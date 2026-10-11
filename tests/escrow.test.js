import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPublicClient, createWalletClient, http, keccak256, toBytes, toHex, parseEther } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { ESCROW_ABI } from '../shared/escrow.js'

// All chain transactions use an ephemeral local Hardhat node and its publicly
// known test mnemonic. No existing database, real wallet or live provider is used.
const reserve = createServer()
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve))
const port = reserve.address().port
await new Promise(resolve => reserve.close(resolve))
const rpc = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['node_modules/hardhat/internal/cli/cli.js', 'node', '--hostname', '127.0.0.1', '--port', String(port)], { stdio: ['ignore', 'ignore', 'pipe'] })
let chainError = ''
child.stderr.on('data', chunk => { chainError += chunk.toString() })
const transport = http(rpc, { retryCount: 0, timeout: 1000 })
const reader = createPublicClient({ chain: baseSepolia, transport, pollingInterval: 20 })
for (let attempt = 0; ; attempt++) {
  try { await reader.getChainId(); break }
  catch {
    if (attempt >= 100 || child.exitCode !== null) { child.kill(); throw new Error('Local chain did not start: ' + chainError) }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}
const mnemonic = 'test test test test test test test test test test test junk'
const consumer = mnemonicToAccount(mnemonic, { addressIndex: 0 })
const operator = mnemonicToAccount(mnemonic, { addressIndex: 1 })
const other = mnemonicToAccount(mnemonic, { addressIndex: 2 })
const administrator = '0x2e0113c8806c8bFFd9cAA0861a9D1ffFE66E48A8'
await reader.request({ method: 'hardhat_impersonateAccount', params: [administrator] })
await reader.request({ method: 'hardhat_setBalance', params: [administrator, toHex(parseEther('100'))] })
const adminWallet = createWalletClient({ account: administrator, chain: baseSepolia, transport })
const consumerWallet = createWalletClient({ account: consumer, chain: baseSepolia, transport })
const artifact = JSON.parse(await readFile(new URL('../.hardhat/artifacts/contracts/TaskEscrow.sol/TaskEscrow.json', import.meta.url), 'utf8'))
const deploymentHash = await adminWallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args: [administrator, 48n * 3600n, operator.address] })
const escrow = (await reader.waitForTransactionReceipt({ hash: deploymentHash })).contractAddress
const factoryArtifact = JSON.parse(await readFile(new URL('../.hardhat/artifacts/contracts/AgentFactory.sol/AgentFactory.json', import.meta.url), 'utf8'))
const factoryHash = await adminWallet.deployContract({ abi: factoryArtifact.abi, bytecode: factoryArtifact.bytecode, args: [administrator] })
const factory = (await reader.waitForTransactionReceipt({ hash: factoryHash })).contractAddress
const directory = await mkdtemp(join(tmpdir(), 'onlyagent-escrow-'))
const operatorKey = toHex(operator.getHdKey().privateKey)
Object.assign(process.env, {
  DATA_DIR: directory, BASE_SEPOLIA_RPC: rpc, BASE_SEPOLIA_TASK_ESCROW: escrow, BASE_SEPOLIA_AGENT_FACTORY: factory,
  LEGACY_TASK_ESCROW: '0x4444444444444444444444444444444444444444',
  ESCROW_OPERATOR_PRIVATE_KEY: operatorKey, GEMINI_API_KEY: 'fixture-key',
  GEMINI_MODEL: 'fixture', BACKUP_ENABLED: 'false', WARMUP_ENABLED: 'false',
  FEED_CYCLE_ENABLED: 'false', DAILY_AI_CALL_LIMIT: '1000', API_RATE_LIMIT: '5000',
})
const originalFetch = globalThis.fetch
const fixture = { failure: false, calls: 0, beforeOutput: null }
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return originalFetch(url, options)
  fixture.calls++
  const reviewing = options.body.includes('independent peer reviewer')
  if (!reviewing) fixture.lastPrompt = options.body
  if (!reviewing && fixture.beforeOutput) await fixture.beforeOutput()
  if (fixture.failure) return new Response('{}', { status: 403 })
  const text = reviewing ? JSON.stringify({ verdict: 'pass', note: 'Fixture independent review' }) : `Fixture output ${fixture.calls}`
  return Response.json({ candidates: [{ content: { parts: [{ text }] } }] })
}
const { startServer, wss, stopEscrowScheduler } = await import('../server/index.js')
const { store, saveStore, loadStore } = await import('../server/store.js')
const { db } = await import('../server/db.js')
const { readEscrowTask, syncEscrowTask, escrowReadiness, startEscrowScheduler } = await import('../server/escrow.js')
const server = startServer(0)
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
const base = `http://127.0.0.1:${server.address().port}/api`
const tokens = {}
for (const [name, walletAddress] of [['consumer', consumer.address], ['other', other.address], ['admin', administrator]]) {
  const token = randomBytes(32).toString('hex')
  tokens[name] = token
  const id = walletAddress.toLowerCase()
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(createHash('sha256').update(token).digest('hex'), JSON.stringify({ id, walletAddress: id }), Date.now() + 3600000)
}
store.config.hireThreshold = 0
async function request(path, body, user = 'consumer') {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: `oa_session=${tokens[user]}`, 'Content-Type': 'application/json', 'X-Requested-With': 'OnlyAgent' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: response.status, data: await response.json() }
}
async function chainWrite(wallet, functionName, args, extra = {}) {
  const hash = await wallet.writeContract({ address: escrow, abi: ESCROW_ABI, functionName, args, ...extra })
  assert.equal((await reader.waitForTransactionReceipt({ hash })).status, 'success')
  return hash
}
async function hire() {
  const txHash = await chainWrite(consumerWallet, 'createTask', [administrator, parseEther('0.001')], { value: parseEther('0.001') })
  const response = await request('/tasks/hire', { task: 'Produce a useful fixture deliverable', agentId: 'ag-103', amountEth: '0.001', txHash, walletAddress: consumer.address })
  assert.equal(response.status, 201, JSON.stringify(response.data))
  return response.data.task
}

test('a repeated verified hire reuses its receipt and rejects changed task instructions', async () => {
  const task = await hire()
  const payload = { task: task.task, agentId: task.agentId, amountEth: task.amountEth, txHash: task.txHash, walletAddress: consumer.address }
  const calls = fixture.calls
  const repeated = await request('/tasks/hire', payload)
  assert.equal(repeated.status, 200)
  assert.equal(repeated.data.task.id, task.id)
  assert.equal(fixture.calls, calls)
  assert.equal((await request('/tasks/hire', { ...payload, task: 'Different instructions' })).status, 409)
  assert.equal((await request('/tasks/hire', { ...payload, amountEth: '0.002' })).status, 409)
})
async function dispute(task, reason = 'The deliverable needs independent review') {
  const txHash = await chainWrite(consumerWallet, 'openDispute', [BigInt(task.escrowTaskId), keccak256(toBytes(reason))])
  const response = await request(`/tasks/${task.id}/dispute`, { reason, txHash })
  assert.equal(response.status, 201, JSON.stringify(response.data))
  return response.data.dispute
}
after(async () => {
  await stopEscrowScheduler()
  for (const socket of wss.clients) socket.terminate()
  await new Promise(resolve => wss.close(resolve))
  await new Promise(resolve => server.close(resolve))
  db.close()
  globalThis.fetch = originalFetch
  const closed = new Promise(resolve => child.once('close', resolve))
  child.kill()
  await closed
  await rm(directory, { recursive: true, force: true })
})

test('hiring preflight rejects missing/wrong operator keys and exposes readiness without secrets', async () => {
  assert.equal(process.env.PRIVATE_KEY, undefined)
  assert.equal(process.env.BASESCAN_API_KEY, undefined)
  assert.equal((await request('/chain')).data.escrowReady, true)
  assert.equal((await request('/chain')).data.factoryReady, true)
  process.env.ESCROW_OPERATOR_PRIVATE_KEY = ''
  assert.equal((await escrowReadiness()).ready, false)
  process.env.ESCROW_OPERATOR_PRIVATE_KEY = toHex(other.getHdKey().privateKey)
  assert.equal((await escrowReadiness()).ready, false)
  process.env.ESCROW_OPERATOR_PRIVATE_KEY = operatorKey
  const readiness = await escrowReadiness()
  assert.equal(readiness.ready, true)
  assert.equal(readiness.reviewWindowHours, 48)
  assert.equal(JSON.stringify(readiness).includes(operatorKey), false)
})

test('mint preflight blocks a contract whose administrator no longer matches the platform owner', async () => {
  const hash = await adminWallet.writeContract({ address: factory, abi: factoryArtifact.abi, functionName: 'transferOwnership', args: [other.address] })
  await reader.waitForTransactionReceipt({ hash })
  const configuration = (await request('/chain')).data
  assert.equal(configuration.factoryReady, false)
  assert.match(configuration.factoryError, /platform owner/)
  assert.equal(configuration.treasury.toLowerCase(), administrator.toLowerCase())
  const wallet = createWalletClient({ account: other, chain: baseSepolia, transport })
  const restore = await wallet.writeContract({ address: factory, abi: factoryArtifact.abi, functionName: 'transferOwnership', args: [administrator] })
  await reader.waitForTransactionReceipt({ hash: restore })
  assert.equal((await request('/chain')).data.factoryReady, true)
})

test('successful hire attests the actual output and uses the chain delivery deadline', async () => {
  const task = await hire()
  assert.equal(task.status, 'completed')
  assert.equal(task.escrowVersion, 2)
  assert.equal(task.escrowAddress.toLowerCase(), escrow.toLowerCase())
  const state = await readEscrowTask(task)
  const output = store.executions.find(item => item.id === task.executionId).output
  assert.equal(state.outputHash, keccak256(toBytes(output)))
  assert.equal(task.reviewDeadlineAt, Number(state.reviewDeadline) * 1000)
  assert.equal(state.reviewDeadline - state.deliveredAt, 48n * 3600n)
  const hash = await chainWrite(consumerWallet, 'completeTask', [BigInt(task.escrowTaskId)])
  // Receipt verification still works for old ledger records whose local
  // deadline/status diverged from an already-mined payout.
  const saved = store.tasks.find(item => item.id === task.id)
  saved.escrowVersion = 1
  saved.status = 'review_expired'
  saved.reviewDeadlineAt = Date.now() - 1
  const confirmed = await request(`/tasks/${task.id}/confirm`, { txHash: hash })
  assert.equal(confirmed.status, 200)
  assert.equal(confirmed.data.task.status, 'paid')
  const repeated = await request(`/tasks/${task.id}/confirm`, { txHash: hash })
  assert.equal(repeated.status, 200)
  assert.equal(repeated.data.task.paidAt, confirmed.data.task.paidAt)
})

test('expired ordinary tasks can request independent review without bypassing acceptance restrictions', async () => {
  const task = { id: 'tk-expired-ordinary', ownerId: consumer.address.toLowerCase(), agentId: 'ag-103', task: 'Ordinary completed fixture', status: 'completed', ts: Date.now(), reviewDeadlineAt: Date.now() - 1 }
  store.tasks.push(task)
  const listed = await request(`/tasks/${task.id}`)
  assert.equal(listed.data.task.status, 'review_expired')
  assert.equal((await request(`/tasks/${task.id}/outcome`, { outcome: 'accepted' })).status, 409)
  assert.equal((await request(`/tasks/${task.id}/dispute`, { reason: 'Please review the expired deliverable' }, 'other')).status, 403)
  const response = await request(`/tasks/${task.id}/dispute`, { reason: 'Please review the expired deliverable' })
  assert.equal(response.status, 201)
  assert.equal(response.data.dispute.review.verdict, 'pass')
  assert.equal(task.status, 'disputed')
})

test('dispute requires a matching mined freeze before API review or state changes', async () => {
  const task = await hire()
  const calls = fixture.calls
  assert.equal((await request(`/tasks/${task.id}/dispute`, { reason: 'Private customer complaint' })).status, 400)
  assert.equal(store.tasks.find(item => item.id === task.id).status, 'completed')
  assert.equal(fixture.calls, calls)
  const reason = 'Private customer complaint'
  const txHash = await chainWrite(consumerWallet, 'openDispute', [BigInt(task.escrowTaskId), keccak256(toBytes(reason))])
  assert.equal((await request(`/tasks/${task.id}/dispute`, { reason, txHash }, 'other')).status, 403)
  assert.equal((await request(`/tasks/${task.id}/dispute`, { reason: 'Different complaint text', txHash })).status, 400)
  store.tasks.find(item => item.id === task.id).reviewDeadlineAt = Date.now() - 1
  const response = await request(`/tasks/${task.id}/dispute`, { reason, txHash })
  assert.equal(response.status, 201)
  assert.equal(response.data.dispute.review.verdict, 'pass')
  const repeat = await request(`/tasks/${task.id}/dispute`, { reason, txHash })
  assert.equal(repeat.status, 200)
  assert.equal(repeat.data.dispute.id, response.data.dispute.id)
  await assert.rejects(reader.simulateContract({ address: escrow, abi: ESCROW_ABI, functionName: 'completeTask', args: [BigInt(task.escrowTaskId)], account: consumer.address }))
  await reader.request({ method: 'evm_increaseTime', params: [48 * 3600 + 1] })
  await reader.request({ method: 'evm_mine', params: [] })
  await assert.rejects(reader.simulateContract({ address: escrow, abi: ESCROW_ABI, functionName: 'releaseTask', args: [BigInt(task.escrowTaskId)], account: other.address }))
  const detail = await request(`/admin/disputes/${response.data.dispute.id}`, undefined, 'admin')
  assert.equal(detail.data.dispute.escrow.address, escrow)
  const refundHash = await chainWrite(adminWallet, 'resolveDispute', [BigInt(task.escrowTaskId), true])
  assert.equal((await request(`/disputes/${response.data.dispute.id}/resolve`, { decision: 'reject', txHash: refundHash }, 'admin')).status, 400)
  assert.equal((await request(`/disputes/${response.data.dispute.id}/resolve`, { decision: 'uphold' }, 'admin')).status, 400)
  const resolved = await request(`/disputes/${response.data.dispute.id}/resolve`, { decision: 'uphold', txHash: refundHash, note: 'Refund approved' }, 'admin')
  assert.equal(resolved.status, 200)
  assert.equal(resolved.data.dispute.resolutionTxHash, refundHash)
  assert.equal(store.tasks.find(item => item.id === task.id).status, 'refunded')
  assert.equal((await request('/disputes', undefined, 'other')).data.disputes.length, 0)
})

test('administrator payout resolution is verified on-chain before marking work paid', async () => {
  const task = await hire()
  const record = await dispute(task)
  const hash = await chainWrite(adminWallet, 'resolveDispute', [BigInt(task.escrowTaskId), false])
  const resolved = await request(`/disputes/${record.id}/resolve`, { decision: 'reject', txHash: hash }, 'admin')
  assert.equal(resolved.status, 200)
  const saved = store.tasks.find(item => item.id === task.id)
  assert.equal(saved.status, 'paid')
  assert.equal(saved.feeEth, 0.00007)
  assert.equal(saved.payoutEth, 0.00093)
})

test('failed work has no release deadline and can be disputed for a refund', async () => {
  fixture.failure = true
  const task = await hire()
  fixture.failure = false
  assert.equal(task.status, 'failed')
  assert.equal((await readEscrowTask(task)).deliveredAt, 0n)
  await reader.request({ method: 'evm_increaseTime', params: [72 * 3600] })
  await reader.request({ method: 'evm_mine', params: [] })
  await assert.rejects(reader.simulateContract({ address: escrow, abi: ESCROW_ABI, functionName: 'releaseTask', args: [BigInt(task.escrowTaskId)], account: other.address }))
  const record = await dispute(task)
  assert.equal(record.status, 'under_review')
})

test('failed dispute reviews can be retried and administrators can resolve with an explanation', async () => {
  const task = await hire()
  fixture.failure = true
  const record = await dispute(task)
  fixture.failure = false
  assert.equal(record.status, 'review_failed')
  assert.equal((await request(`/disputes/${record.id}/retry-review`, {}, 'other')).status, 404)
  assert.equal((await request(`/disputes/${record.id}/resolve`, { decision: 'uphold', note: 'Too short' }, 'admin')).status, 409)
  const retried = await request(`/disputes/${record.id}/retry-review`, {})
  assert.equal(retried.status, 200)
  assert.equal(retried.data.dispute.status, 'under_review')
  assert.equal(retried.data.dispute.reviewPending, false)
  assert.equal(retried.data.dispute.review.verdict, 'pass')
  assert.equal((await request(`/disputes/${record.id}/retry-review`, {})).status, 409)

  fixture.failure = true
  const secondTask = await hire()
  const second = await dispute(secondTask)
  fixture.failure = false
  assert.equal(second.status, 'review_failed')
  const saved = store.config.disputes.find(item => item.id === second.id)
  saved.reviewPending = true
  saved.status = 'under_review'
  saveStore(); loadStore()
  assert.equal(store.config.disputes.find(item => item.id === second.id).status, 'review_failed')
  const hash = await chainWrite(adminWallet, 'resolveDispute', [BigInt(secondTask.escrowTaskId), true])
  assert.equal((await request(`/disputes/${second.id}/resolve`, { decision: 'uphold', note: 'Too short', txHash: hash }, 'admin')).status, 409)
  const resolved = await request(`/disputes/${second.id}/resolve`, { decision: 'uphold', note: 'Reviewed customer evidence manually while the provider was unavailable.', txHash: hash }, 'admin')
  assert.equal(resolved.status, 200)
  assert.equal(resolved.data.dispute.status, 'upheld')
  assert.equal(store.tasks.find(item => item.id === secondTask.id).status, 'refunded')
})

test('revision is held on-chain before generation and redelivery starts a fresh deadline', async () => {
  const task = await hire()
  const firstDeadline = task.reviewDeadlineAt
  let observedHold = false
  fixture.beforeOutput = async () => {
    const state = await readEscrowTask(task)
    assert.equal(state.deliveredAt, 0n)
    assert.equal(state.reviewDeadline, 0n)
    observedHold = true
    await reader.request({ method: 'evm_increaseTime', params: [72 * 3600] })
    await reader.request({ method: 'evm_mine', params: [] })
    await assert.rejects(reader.simulateContract({ address: escrow, abi: ESCROW_ABI, functionName: 'releaseTask', args: [BigInt(task.escrowTaskId)], account: other.address }))
  }
  const response = await request(`/tasks/${task.id}/revision`, { request: 'Please add the missing acceptance criteria' })
  fixture.beforeOutput = null
  assert.equal(response.status, 201, JSON.stringify(response.data))
  assert.equal(observedHold, true)
  assert.equal(response.data.task.status, 'completed')
  assert.ok(response.data.task.reviewDeadlineAt > firstDeadline)
  assert.equal((await readEscrowTask(task)).revisions, 1n)
})

test('interrupted revisions retry their saved request without consuming a second revision', async () => {
  const operatorWallet = createWalletClient({ account: operator, chain: baseSepolia, transport })
  for (const phase of ['before_hold', 'after_hold', 'generating']) {
    const task = await hire()
    const saved = store.tasks.find(item => item.id === task.id)
    if (phase !== 'before_hold') await chainWrite(operatorWallet, 'holdRevision', [BigInt(task.escrowTaskId)])
    saved.revisionRequest = `Preserve this specific customer revision for ${phase}`
    saved.revisionCount = phase === 'generating' ? 1 : 0
    saved.status = phase === 'generating' ? 'revision_requested' : 'revision_hold_pending'
    saveStore(); loadStore()
    assert.equal(store.tasks.find(item => item.id === task.id).status, phase === 'generating' ? 'revision_interrupted' : 'revision_hold_interrupted')
    assert.equal((await request(`/tasks/${task.id}/retry`, {}, 'other')).status, 404)
    const retried = await request(`/tasks/${task.id}/retry`, {})
    assert.equal(retried.status, 200)
    assert.equal(retried.data.task.status, 'completed')
    assert.equal(retried.data.task.revisionCount, 1)
    assert.equal(retried.data.execution.revision, 1)
    assert.ok(fixture.lastPrompt.includes(`Preserve this specific customer revision for ${phase}`))
    assert.equal((await readEscrowTask(retried.data.task)).revisions, 1n)
    assert.equal((await request(`/tasks/${task.id}/retry`, {})).status, 409)
  }
})

test('operator failure leaves output recoverable without another model call', async () => {
  fixture.beforeOutput = async () => { process.env.ESCROW_OPERATOR_PRIVATE_KEY = '' }
  const task = await hire()
  fixture.beforeOutput = null
  assert.equal(task.status, 'delivery_pending')
  assert.equal(task.reviewDeadlineAt, null)
  assert.equal((await readEscrowTask(task)).deliveredAt, 0n)
  const calls = fixture.calls
  process.env.ESCROW_OPERATOR_PRIVATE_KEY = operatorKey
  const response = await request(`/tasks/${task.id}/sync`, {})
  assert.equal(response.status, 200)
  assert.equal(response.data.task.status, 'completed')
  assert.equal(fixture.calls, calls)
  saveStore(); loadStore()
  const restored = store.tasks.find(item => item.id === task.id)
  assert.equal(restored.escrowAddress, escrow)
  assert.equal(restored.escrowVersion, 2)
  assert.equal(restored.reviewDeadlineAt, response.data.task.reviewDeadlineAt)
})

test('automatic worker settles undisputed delivered work and synchronizes the ledger', async () => {
  const task = await hire()
  await reader.request({ method: 'evm_increaseTime', params: [48 * 3600 + 1] })
  await reader.request({ method: 'evm_mine', params: [] })
  await syncEscrowTask(store.tasks.find(item => item.id === task.id))
  assert.equal(store.tasks.find(item => item.id === task.id).status, 'released')
  assert.equal((await readEscrowTask(task)).released, true)
  const stop = startEscrowScheduler(() => {})
  await stop()
})

test('legacy records retain their original contract and reject fictional dispute freezes', async () => {
  store.tasks.push({ id: 'tk-legacy', ownerId: consumer.address.toLowerCase(), task: 'Legacy work', agentId: 'ag-103', status: 'completed', escrowTaskId: '1', consumer: consumer.address, ts: Date.now(), source: 'legacy-chain', model: 'legacy' })
  saveStore(); loadStore()
  const legacy = store.tasks.find(item => item.id === 'tk-legacy')
  assert.equal(legacy.escrowAddress, process.env.LEGACY_TASK_ESCROW)
  assert.equal(legacy.escrowVersion, 1)
  const response = await request('/tasks/tk-legacy/dispute', { reason: 'Legacy consumer complaint' })
  assert.equal(response.status, 409)
  assert.match(response.data.error, /legacy escrow/)
})
