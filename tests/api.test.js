import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, rmdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'
import { installProviderFixture } from './provider-fixture.js'
import { execFileSync } from 'node:child_process'
import { fleetHistory, periodValue, periodChange } from '../src/fleetMetrics.js'
import { privateKeyToAccount } from 'viem/accounts'

const dir = mkdtempSync(join(tmpdir(), 'onlyagent-test-'))
process.env.BACKUP_ENABLED = 'false'
Object.assign(process.env, { DATA_DIR: dir, GEMINI_API_KEY: 'test-fixture-key', GOOGLE_CLIENT_ID: 'test-client', WARMUP_ENABLED: 'false', FEED_CYCLE_ENABLED: 'false' })
process.env.ADMIN_EMAILS = 'test-user@example.test'
process.env.DAILY_AI_CALL_LIMIT = '1000'
process.env.API_RATE_LIMIT = '5000'
process.env.AUTH_RATE_LIMIT = '1000'
const fixture = installProviderFixture()
const { startServer, wss } = await import('../server/index.js')
const { store, saveStore, loadStore, nextId } = await import('../server/store.js')
const { db, dbMaxSeq, archiveUnverifiedActivity } = await import('../server/db.js')
const server = startServer(0)
await new Promise((resolve) => server.once('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}`
async function request(path, body, token = 'test-user', method) {
  const res = await fetch(base + '/api' + path, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: res.status, data: await res.json() }
}
after(async () => {
  fixture.restore()
  for (const client of wss.clients) client.terminate()
  wss.close()
  await new Promise((resolve) => server.close(resolve))
  db.close()
  // Remove only files from the exact directory created above; no recursive deletion.
  for (const file of readdirSync(dir)) rmSync(join(dir, file))
  rmdirSync(dir)
})

test('rejects unverified identity and exposes health without authentication', async () => {
  assert.equal((await request('/agents', undefined, 'invalid')).status, 401)
  assert.equal((await request('/health', undefined, '')).data.ok, true)
  const me = await request('/auth/me')
  assert.equal(me.data.user.email, 'test-user@example.test')
})

test('empty database has 18 personas, no fabricated activity and zero evidence', async () => {
  const { data } = await request('/agents')
  assert.equal(data.agents.length, 18)
  for (const agent of data.agents) {
    assert.equal(agent.trustScore, 0)
    assert.equal(agent.tasksCompleted, 0)
    assert.equal(agent.status, 'idle')
    assert.equal(agent.history.response[0].value, null)
  }
  assert.equal((await request('/audits')).data.total, 0)
})

test('validates tasks and swarm selections before invoking the provider', async () => {
  const calls = fixture.state.calls
  for (const task of ['', '   ', 4, 'a'.repeat(501)]) assert.equal((await request('/tasks', { task })).status, 400)
  assert.equal((await request('/tasks', { task: 'test', stage: 'unknown' })).status, 400)
  assert.equal((await request('/tasks', { task: 'test', agentId: 'missing' })).status, 404)
  for (const extra of [{ count: 2 }, { count: 6 }, { agentIds: 'bad' }, { agentIds: ['ag-101', 'ag-101', 'ag-102'] }]) {
    assert.equal((await request('/swarms/analyze', { task: 'test', ...extra })).status, 400)
  }
  assert.equal(fixture.state.calls, calls)
})

test('runs a task, pushes an update, audits once, and updates reputation', async () => {
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/ws', { headers: { Authorization: 'Bearer test-user' } })
  await new Promise((resolve) => socket.once('open', resolve))
  const update = new Promise((resolve) => socket.on('message', (raw) => { if (JSON.parse(raw).type === 'update') resolve() }))
  const run = await request('/tasks', { task: 'Draft a test plan', agentId: 'ag-103' })
  assert.equal(run.data.execution.success, true)
  assert.match(run.data.execution.output, /Test fixture/)
  await update
  socket.close()
  const taskId = run.data.task.id
  const detail = await request(`/tasks/${taskId}`)
  assert.equal(detail.data.execution.output, run.data.execution.output)
  assert.equal((await request(`/tasks/${taskId}`, undefined, 'other-user')).status, 404)
  const callsBeforeUnauthorizedAudit = fixture.state.calls
  assert.equal((await request(`/tasks/${taskId}/audit`, {}, 'other-user')).status, 403)
  assert.equal(fixture.state.calls, callsBeforeUnauthorizedAudit)
  assert.equal((await request(`/tasks/${taskId}/audit`, { auditorId: 'ag-103' })).status, 400)
  assert.equal((await request(`/tasks/${taskId}/audit`, { auditorId: 'missing' })).status, 404)
  fixture.state.invalidAudit = true
  assert.equal((await request(`/tasks/${taskId}/audit`, {})).status, 502)
  assert.equal(store.audits.length, 0)
  fixture.state.invalidAudit = false
  const audit = await request(`/tasks/${taskId}/audit`, {})
  assert.equal(audit.data.audit.verdict, 'pass')
  assert.equal(audit.data.updatedAgent.trustScore, 100)
  assert.equal((await request(`/tasks/${taskId}/audit`, {})).status, 409)
  assert.equal((await request('/tasks', undefined, 'other-user')).data.tasks.length, 0)
  const routed = await request('/tasks', { task: 'Plan another release' })
  assert.equal(routed.data.routedTo.id, 'ag-103')
})

test('provider failures are persisted as failures and never audited as successes', async () => {
  fixture.state.failure = true
  const result = await request('/tasks', { task: 'Provider unavailable', agentId: 'ag-102' })
  assert.equal(result.data.task.status, 'failed')
  assert.equal(result.data.execution.success, false)
  assert.match(result.data.execution.output, /HTTP 403/)
  assert.equal((await request(`/tasks/${result.data.task.id}/audit`, {})).status, 400)
  const failed = await request('/swarms/analyze', { task: 'Provider unavailable', count: 3 })
  assert.equal(failed.data.run.status, 'failed')
  assert.equal(failed.data.run.results.filter((r) => r.success).length, 0)
  fixture.state.failure = false
})

test('swarm fan-out records all contributions, merges and persists the report', async () => {
  const result = await request('/swarms/analyze', { task: 'Plan a release', count: 3 })
  assert.equal(result.status, 200)
  assert.equal(result.data.run.results.length, 3)
  assert.equal(result.data.run.status, 'done')
  assert.match(result.data.run.synthesis, /Test fixture/)
  assert.equal((await request('/swarms/runs')).data.runs.length, 2)
})

test('SQLite retains custom agent metadata, feed audit axes, and payment fields on reload', () => {
  const ts = Date.now()
  store.agents.push({ id: 'cu-10000', name: 'Persisted', role: 'Coder', specialty: 'Coder', gender: null, stage: { id: 'development' }, tags: [], price: 1, persona: 'Precise', description: '', ownerId: 'test-user@example.test', walletAddress: null, mintTxHash: '0xfixture', tokenId: '12', created_at: ts })
  store.tasks.push({ id: 'tk-10001', task: 'Paid task fixture', agentId: 'cu-10000', status: 'paid', executionId: null, ts, escrowTaskId: '17', consumer: 'wallet-fixture', amountEth: 0.001, txHash: '0xpayment', payoutEth: 0.00093, feeEth: 0.00007, paidAt: ts, ownerId: 'test-user@example.test' })
  store.feedPosts.push({ id: 'fp-10002', agentId: 'cu-10000', content: 'Test fixture post', status: 'pending', auditScore: 80, audit: { personality: 80, engagement: 80, relevance: 80 }, ts })
  saveStore()
  store.tasks = []
  store.agents = []
  loadStore()
  assert.equal(store.agents[0].tokenId, '12')
  assert.equal(store.tasks.find((t) => t.id === 'tk-10001').escrowTaskId, '17')
  assert.equal(store.tasks.find((t) => t.id === 'tk-10001').feeEth, 0.00007)
  assert.equal(store.feedPosts[0].audit.personality, 80)
  assert.equal(dbMaxSeq(), 10002)
  assert.equal(nextId('ex'), 'ex-10003')
})

test('feed owner actions enforce the authenticated identity', async () => {
  assert.equal((await request('/feed/posts/fp-10002/approve', {}, 'other-user')).status, 403)
  assert.equal((await request('/feed/focus', { agentId: 'cu-10000', focus: 'Testing' }, 'other-user')).status, 403)
  assert.equal((await request('/feed/posts/fp-10002/approve', {})).status, 200)
  assert.equal((await request('/feed/pending?email=test-user@example.test', undefined, 'other-user')).data.pending.length, 0)
})

test('custom agents can generate focused pending posts on demand', async () => {
  const focus = await request('/feed/focus', { agentId: 'cu-10000', focus: 'Explain testing strategy clearly.' })
  assert.equal(focus.status, 200)
  assert.equal(focus.data.focus, 'Explain testing strategy clearly.')
  const generated = await request('/feed/agents/cu-10000/generate', {})
  assert.equal(generated.status, 201)
  assert.equal(generated.data.post.status, 'pending')
  assert.equal(generated.data.post.agentId, 'cu-10000')
  assert.ok(generated.data.post.auditorId)
  assert.notEqual(generated.data.post.auditorId, 'cu-10000')
  assert.ok(generated.data.post.auditor)
  assert.match(generated.data.post.content, /Test fixture/)
  assert.equal((await request('/feed/agents/cu-10000/generate', {})).status, 409)
  assert.equal((await request('/feed/agents/cu-10000/generate', {}, 'other-user')).status, 403)
})

test('configuration validation is atomic and profile identity cannot be supplied by callers', async () => {
  const before = structuredClone(store.config)
  assert.equal((await request('/config', { reputation: { trust: 'wrong' } }, 'test-user', 'PUT')).status, 400)
  assert.equal((await request('/config', { hireThreshold: -1 }, 'test-user', 'PUT')).status, 400)
  assert.deepEqual(store.config, before)
  const profile = await request('/profile', { email: 'other-user@example.test', name: 'Impostor' }, 'test-user', 'PUT')
  assert.equal(profile.data.profile.email, 'test-user@example.test')
  assert.equal(profile.data.profile.name, 'Test User')
})

test('missing Gemini key never creates a simulated result', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', "import { runAgent, MODE } from './server/runtime.js'; try { await runAgent({}, 'test'); process.exitCode = 1 } catch (e) { console.log(MODE + ':' + e.status) }"], { cwd: process.cwd(), env: { ...process.env, GEMINI_API_KEY: '' }, encoding: 'utf8' })
  assert.match(output, /unconfigured:503/)
})

test('fleet averages are weighted across agents and empty periods are not fabricated', () => {
  const makeAgent = (value, samples) => ({ history: { response: Array.from({ length: 30 }, (_, i) => ({ day: `D-${29 - i}`, value, samples })) } })
  const series = fleetHistory([makeAgent(100, 1), makeAgent(300, 3)], 'response')
  assert.equal(series[0].value, 250)
  assert.equal(periodValue(series.slice(-7), 'response'), 250)
  assert.equal(periodChange(series, 'response', 7), 0)
  assert.equal(periodChange(series, 'response', 30), null)
  assert.equal(fleetHistory([makeAgent(null, 0)], 'response')[0].value, null)
})

test('feed generation persists validated provider scores and propagates failures', async () => {
  const before = store.feedPosts.length + store.feedReactions.length
  const cycle = await request('/feed/cycle', { count: 1 })
  assert.equal(cycle.status, 200)
  assert.equal(cycle.data.results.length, 1)
  assert.equal(store.feedPosts.length + store.feedReactions.length, before + 1)
  fixture.state.failure = true
  assert.equal((await request('/feed/cycle', { count: 1 })).status, 502)
  assert.equal(store.feedPosts.length + store.feedReactions.length, before + 1)
  fixture.state.failure = false
})

test('interrupted running tasks become failed after reloading durable state', () => {
  const task = { id: nextId('tk'), task: 'Interrupted task', agentId: 'ag-101', status: 'running', ownerId: 'test-user@example.test', executionId: null, ts: Date.now() }
  store.tasks.push(task)
  saveStore()
  loadStore()
  assert.equal(store.tasks.find((t) => t.id === task.id).status, 'failed')
})

test('provider provenance survives reload and unverified history is archived once', () => {
  const execution = db.prepare('SELECT * FROM executions LIMIT 1').get()
  assert.equal(execution.source, 'gemini')
  assert.ok(execution.model)
  const before = db.prepare('SELECT COUNT(*) c FROM executions').get().c
  db.prepare('UPDATE executions SET source = NULL WHERE id = ?').run(execution.id)
  const archived = archiveUnverifiedActivity()
  assert.equal(archived.counts.executions, 1)
  assert.ok(readdirSync(dir).includes(archived.archive.split('/').at(-1)))
  assert.equal(db.prepare('SELECT COUNT(*) c FROM executions').get().c, before - 1)
  assert.equal(archiveUnverifiedActivity(), null)
  loadStore()
  assert.ok(!store.executions.some((e) => e.id === execution.id))
})

test('cookie sessions are hashed, reject CSRF, survive reload and revoke on logout', async () => {
  const login = await fetch(base + '/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: 'test-user' }) })
  assert.equal(login.status, 200)
  const setCookie = login.headers.get('set-cookie')
  assert.match(setCookie, /HttpOnly/)
  const cookie = setCookie.split(';')[0]
  assert.ok(!db.prepare('SELECT hash FROM sessions').all().some((s) => s.hash === cookie.split('=')[1]))
  const me = await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } })
  assert.equal((await me.json()).user.role, 'admin')
  const csrf = await fetch(base + '/api/config', { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(csrf.status, 403)
  const foreign = await fetch(base + '/api/auth/session', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: 'test-user' }) })
  assert.equal(foreign.status, 403)
  const out = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, 'X-Requested-With': 'OnlyAgent' } })
  assert.equal(out.status, 200)
  assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } })).status, 401)
})

test('only admins can change global settings and Gemini runtime generates real-shaped responses', async () => {
  assert.equal((await request('/config', { hireThreshold: 50 }, 'other-user', 'PUT')).status, 403)
  assert.equal((await request('/runtime', { geminiModel: 'gemini-test-model' }, 'other-user', 'PUT')).status, 403)
  assert.equal((await request('/runtime', { provider: 'custom' }, 'test-user', 'PUT')).status, 400)
  assert.equal((await request('/runtime', { geminiModel: 'gemini-test-model' }, 'test-user', 'PUT')).status, 200)
  try {
    const task = await request('/tasks', { task: 'Write a release plan using Gemini' })
    assert.equal(task.data.execution.source, 'gemini')
    assert.equal(task.data.execution.model, 'gemini-test-model')
    const audit = await request(`/tasks/${task.data.task.id}/audit`, {})
    assert.equal(audit.data.audit.source, 'gemini')
    assert.equal(audit.data.audit.verdict, 'pass')
    const swarm = await request('/swarms/analyze', { task: 'Review the release plan', count: 3 })
    assert.equal(swarm.data.run.status, 'done')
    assert.ok(swarm.data.run.results.every((r) => r.source === 'gemini'))
    assert.equal(db.prepare('SELECT source FROM executions WHERE id = ?').get(task.data.execution.id).source, 'gemini')
    const requestBody = fixture.state.requests.at(-1).body
    assert.equal(requestBody.generationConfig.maxOutputTokens, 700)
    assert.equal((await request('/runtime/check', {})).data.check.ok, true)
  } finally { await request('/runtime', { provider: 'gemini' }, 'test-user', 'PUT') }
})

test('daily quotas persist and block provider spending while allowing ordinary account actions', async () => {
  db.prepare('DELETE FROM api_usage WHERE ownerId = ?').run('other-user@example.test')
  process.env.DAILY_AI_CALL_LIMIT = '1'
  try {
    assert.equal((await request('/tasks', { task: 'One allowed task' }, 'other-user')).status, 200)
    const calls = fixture.state.calls
    assert.equal((await request('/tasks', { task: 'Over budget' }, 'other-user')).status, 429)
    assert.equal(fixture.state.calls, calls)
    assert.equal((await request('/usage', undefined, 'other-user')).data.usage.remaining, 0)
    assert.equal((await request('/profile', {}, 'other-user', 'PUT')).status, 200)
    assert.equal((await request('/tasks/missing/confirm', {}, 'other-user')).status, 404)
  } finally { process.env.DAILY_AI_CALL_LIMIT = '1000' }
})

test('wallet linkage verifies signatures, expiry, single use and account ownership', async () => {
  const account = privateKeyToAccount('0x' + '11'.repeat(32))
  const other = privateKeyToAccount('0x' + '22'.repeat(32))
  const body = { walletAddress: account.address }
  assert.equal((await request('/agents/custom', body)).status, 403)
  const challenge = await request('/wallet/challenge', body)
  const invalid = await other.signMessage({ message: challenge.data.message })
  assert.equal((await request('/wallet/verify', { ...body, signature: invalid })).status, 403)
  const signature = await account.signMessage({ message: challenge.data.message })
  assert.equal((await request('/wallet/verify', { ...body, signature })).status, 200)
  assert.equal((await request('/wallet/verify', { ...body, signature })).status, 400)
  assert.equal((await request('/wallet')).data.wallets.length, 1)
  const someoneElse = await request('/wallet/challenge', body, 'other-user')
  const signed = await account.signMessage({ message: someoneElse.data.message })
  assert.equal((await request('/wallet/verify', { ...body, signature: signed }, 'other-user')).status, 409)
  db.prepare('UPDATE wallet_challenges SET expiresAt = 0 WHERE ownerId = ?').run('other-user@example.test')
  assert.equal((await request('/wallet/verify', { ...body, signature: signed }, 'other-user')).status, 400)
})

test('task idempotency replays durable results and rejects changed payloads', async () => {
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer test-user', 'Idempotency-Key': 'release-plan-1' }
  const submit = (task) => fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ task }) })
  const first = await (await submit('A repeatable release plan')).json()
  const calls = fixture.state.calls
  const second = await (await submit('A repeatable release plan')).json()
  assert.equal(first.task.id, second.task.id)
  assert.equal(fixture.state.calls, calls)
  assert.equal((await submit('A different task')).status, 409)
})

test('failed task retries preserve identity, forbid other owners and record a new real attempt', async () => {
  fixture.state.failure = true
  const failed = await request('/tasks', { task: 'Retry after a provider failure' })
  fixture.state.failure = false
  assert.equal((await request(`/tasks/${failed.data.task.id}/retry`, {}, 'other-user')).status, 404)
  const retried = await request(`/tasks/${failed.data.task.id}/retry`, {})
  assert.equal(retried.data.task.id, failed.data.task.id)
  assert.equal(retried.data.execution.success, true)
  assert.notEqual(retried.data.execution.id, failed.data.execution.id)
  assert.equal((await request(`/tasks/${failed.data.task.id}/retry`, {})).status, 409)
})
