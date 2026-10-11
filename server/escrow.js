import { createWalletClient, http, keccak256, toBytes, decodeEventLog } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { ESCROW_ABI } from '../shared/escrow.js'
import { publicClient, TASK_ESCROW_ADDRESS, PLATFORM_OWNER_ADDRESS } from './chain.js'
import { db } from './db.js'
import { store, saveStore } from './store.js'

db.exec(`CREATE TABLE IF NOT EXISTS escrow_operations (
  operation TEXT PRIMARY KEY, txHash TEXT NOT NULL, createdAt INTEGER NOT NULL
)`)
const problem = (message, status = 503) => Object.assign(new Error(message), { status })
const sameAddress = (a, b) => a?.toLowerCase() === b?.toLowerCase()
export const escrowAddressOf = (task) => task.escrowAddress || TASK_ESCROW_ADDRESS
export const isV2Escrow = (task) => Boolean(task.escrowTaskId && task.escrowVersion === 2)

function operatorWallet() {
  const key = process.env.ESCROW_OPERATOR_PRIVATE_KEY
  if (!/^0x[0-9a-fA-F]{64}$/.test(key || '')) throw problem('Configure a dedicated ESCROW_OPERATOR_PRIVATE_KEY before enabling escrow hiring.')
  const account = privateKeyToAccount(key)
  if (sameAddress(account.address, PLATFORM_OWNER_ADDRESS)) throw problem('The delivery operator must use a dedicated wallet, separate from the platform administrator.')
  return createWalletClient({ account, chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org') })
}

export async function escrowReadiness() {
  try {
    const wallet = operatorWallet()
    if (!TASK_ESCROW_ADDRESS) throw problem('Deploy the dispute-aware TaskEscrow before enabling escrow hiring.')
    const read = (functionName) => publicClient.readContract({ address: TASK_ESCROW_ADDRESS, abi: ESCROW_ABI, functionName })
    const [version, operator, owner, treasury, timeout, chainId] = await Promise.all([
      read('VERSION'), read('deliveryOperator'), read('owner'), read('treasury'), read('timeout'), publicClient.getChainId(),
    ])
    if (chainId !== baseSepolia.id) throw problem('Escrow RPC must use Base Sepolia.')
    if (version !== 2n) throw problem('New hires require the dispute-aware TaskEscrow v2.')
    if (!sameAddress(operator, wallet.account.address)) throw problem('Configured server wallet does not match the contract delivery operator.')
    if (!sameAddress(owner, PLATFORM_OWNER_ADDRESS)) throw problem('Escrow administrator must match the platform owner wallet.')
    if (!sameAddress(treasury, PLATFORM_OWNER_ADDRESS)) throw problem('Escrow treasury must pay platform fees to the platform owner wallet.')
    if (!await publicClient.getBalance({ address: operator })) throw problem('Fund the delivery operator with testnet ETH before enabling escrow hiring.')
    return { ready: true, version: 2, operator, administrator: owner, reviewWindowHours: Number(timeout) / 3600 }
  } catch (error) {
    return { ready: false, version: null, error: error.status ? error.message : 'Cannot verify dispute-aware escrow configuration. Check the contract address, operator key and RPC.' }
  }
}

export async function requireEscrowReady() {
  const status = await escrowReadiness()
  if (!status.ready) throw problem(status.error)
  return status
}

export async function readEscrowTask(task) {
  const values = await publicClient.readContract({ address: escrowAddressOf(task), abi: ESCROW_ABI, functionName: 'tasks', args: [BigInt(task.escrowTaskId)] })
  const keys = ['consumer', 'agentOwner', 'amount', 'createdAt', 'completed', 'released', 'deliveredAt', 'reviewDeadline', 'outputHash', 'disputed', 'refunded', 'revisions']
  const result = Object.fromEntries(keys.map((key, index) => [key, values[index]]))
  if (!sameAddress(result.consumer, task.consumer)) throw problem('Escrow consumer does not match the recorded task.', 409)
  return result
}

// Serialize the operator's sends to avoid nonce collisions. Save each hash
// before waiting, so a restart retries verification rather than a second send.
let sends = Promise.resolve()
async function operatorTransaction(task, functionName, args, operation) {
  const work = async () => {
    const wallet = operatorWallet()
    if (await publicClient.getChainId() !== baseSepolia.id) throw problem('Escrow RPC must use Base Sepolia.')
    const id = `${escrowAddressOf(task).toLowerCase()}:${task.escrowTaskId}:${operation}`
    let hash = db.prepare('SELECT txHash FROM escrow_operations WHERE operation = ?').get(id)?.txHash
    if (!hash) {
      const { request } = await publicClient.simulateContract({ address: escrowAddressOf(task), abi: ESCROW_ABI, functionName, args, account: wallet.account })
      hash = await wallet.writeContract(request)
      db.prepare('INSERT INTO escrow_operations VALUES (?, ?, ?)').run(id, hash, Date.now())
    }
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60000 })
    if (receipt.status !== 'success') {
      db.prepare('DELETE FROM escrow_operations WHERE operation = ?').run(id)
      throw problem('Escrow operator transaction reverted. Retry synchronization.', 502)
    }
    return hash
  }
  const pending = sends.then(work)
  sends = pending.catch(() => {})
  try { return await pending }
  catch (error) { throw error.status ? error : problem('Escrow transaction could not be confirmed. Check the operator wallet and RPC, then retry synchronization.', 502) }
}

function applyChainState(task, state) {
  task.reviewDeadlineAt = state.reviewDeadline ? Number(state.reviewDeadline) * 1000 : null
  if (state.refunded) task.status = 'refunded'
  else if (state.completed || state.released) {
    task.status = state.released ? 'released' : 'paid'
    task.feeEth = Number(state.amount * 700n / 10000n) / 1e18
    task.payoutEth = Number(state.amount - state.amount * 700n / 10000n) / 1e18
    task.paidAt ||= Date.now()
  } else if (state.disputed) task.status = 'disputed'
}

export async function attestDelivery(task) {
  if (!isV2Escrow(task)) return
  const execution = store.executions.find(item => item.id === task.executionId)
  if (!execution?.success) return
  task.status = 'delivery_pending'
  task.reviewDeadlineAt = null
  saveStore()
  try {
    let state = await readEscrowTask(task)
    if (!state.disputed && !state.completed && !state.released && !state.refunded) {
      const outputHash = keccak256(toBytes(execution.output))
      if (!state.deliveredAt) {
        await operatorTransaction(task, 'markDelivered', [BigInt(task.escrowTaskId), outputHash], `delivery:${execution.id}`)
        state = await readEscrowTask(task)
      }
      if (state.outputHash !== outputHash) throw problem('On-chain delivery hash does not match the recorded output.', 409)
      task.status = 'completed'
    }
    applyChainState(task, state)
    task.escrowSyncError = null
  } catch {
    task.escrowSyncError = 'Delivery confirmation is pending. Payment cannot auto-release until delivery is confirmed on-chain.'
  }
  saveStore()
}

export async function holdEscrowRevision(task) {
  if (!isV2Escrow(task)) return
  const revision = (task.revisionCount || 0) + 1
  let state = await readEscrowTask(task)
  if (state.disputed || state.completed || state.released || state.refunded) throw problem('Escrow is disputed or already settled.', 409)
  if (state.revisions < BigInt(revision)) {
    const block = await publicClient.getBlock()
    if (block.timestamp >= state.reviewDeadline) throw problem('The on-chain review window has expired.', 409)
    await operatorTransaction(task, 'holdRevision', [BigInt(task.escrowTaskId)], `revision:${revision}`)
    state = await readEscrowTask(task)
  }
  if (state.deliveredAt || state.revisions !== BigInt(revision)) throw problem('Revision hold could not be confirmed.', 409)
  task.reviewDeadlineAt = null
}

async function matchingEvent(task, txHash, eventName, matches) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash || '')) throw problem('A mined escrow transaction hash is required.', 400)
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  if (receipt.status !== 'success') throw problem('Escrow transaction reverted.', 400)
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, escrowAddressOf(task))) continue
    let event
    try { event = decodeEventLog({ abi: ESCROW_ABI, data: log.data, topics: log.topics }) } catch { continue }
    if (event.eventName === eventName && event.args.taskId === BigInt(task.escrowTaskId) && matches(event.args)) return event.args
  }
  throw problem(`No matching ${eventName} event was found for this escrow task.`, 400)
}

export async function verifyEscrowDispute(task, txHash, reason) {
  await matchingEvent(task, txHash, 'TaskDisputed', args => sameAddress(args.consumer, task.consumer) && args.reasonHash === keccak256(toBytes(reason)))
  const state = await readEscrowTask(task)
  if (!state.disputed) throw problem('Escrow dispute is no longer open.', 409)
}

export async function verifyEscrowResolution(task, txHash, refundConsumer) {
  await matchingEvent(task, txHash, 'DisputeResolved', args => args.refundConsumer === refundConsumer)
  const state = await readEscrowTask(task)
  if (refundConsumer ? !state.refunded : !state.completed) throw problem('Escrow resolution is not confirmed.', 409)
  applyChainState(task, state)
  return state
}

export async function syncEscrowTask(task, { release = true } = {}) {
  if (!isV2Escrow(task)) return
  if (task.status === 'delivery_pending') await attestDelivery(task)
  const state = await readEscrowTask(task)
  applyChainState(task, state)
  if (release && state.deliveredAt && !state.disputed && !state.completed && !state.released && !state.refunded) {
    const block = await publicClient.getBlock()
    if (block.timestamp >= state.reviewDeadline) {
      await operatorTransaction(task, 'releaseTask', [BigInt(task.escrowTaskId)], 'release')
      applyChainState(task, await readEscrowTask(task))
    }
  }
  task.escrowSyncError = task.status === 'delivery_pending' ? task.escrowSyncError : null
  saveStore()
}

export function startEscrowScheduler(onChange) {
  let stopped = false, running = null
  const cycle = () => {
    if (stopped || running) return
    running = (async () => {
      for (const task of store.tasks.filter(item => isV2Escrow(item) && !['paid', 'released', 'refunded'].includes(item.status))) {
        if (stopped) break
        const before = JSON.stringify(task)
        try { await syncEscrowTask(task) }
        catch { task.escrowSyncError = 'Escrow synchronization failed. Retry shortly.'; saveStore() }
        if (JSON.stringify(task) !== before) onChange()
      }
    })().finally(() => { running = null })
  }
  const timer = setInterval(cycle, 60000)
  timer.unref()
  cycle()
  return async () => { stopped = true; clearInterval(timer); await running }
}
