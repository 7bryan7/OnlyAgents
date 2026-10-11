import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directory = await mkdtemp(join(tmpdir(), 'onlyagent-privacy-'))
Object.assign(process.env, {
  DATA_DIR: directory, GEMINI_API_KEY: '', BACKUP_ENABLED: 'false',
  WARMUP_ENABLED: 'false', FEED_CYCLE_ENABLED: 'false', API_RATE_LIMIT: '5000',
})
const { startServer, wss } = await import('../server/index.js')
const { store } = await import('../server/store.js')
const { db } = await import('../server/db.js')
const { PLATFORM_OWNER } = await import('../server/auth.js')
const server = startServer(0)
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
const base = `http://127.0.0.1:${server.address().port}/api`
const owners = {
  alice: '0x1111111111111111111111111111111111111111',
  bob: '0x2222222222222222222222222222222222222222',
  empty: '0x3333333333333333333333333333333333333333',
  admin: PLATFORM_OWNER,
}
// Seed server-side sessions only in the temporary test database. Requests still
// pass through the application's cookie authentication and role checks.
const tokens = {}
for (const [name, walletAddress] of Object.entries(owners)) {
  const token = randomBytes(32).toString('hex')
  tokens[name] = token
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(
    createHash('sha256').update(token).digest('hex'),
    JSON.stringify({ id: walletAddress, walletAddress }), Date.now() + 60000,
  )
}
store.config.customerOutcomes = [
  { id: 'out-alice-old', ownerId: owners.alice, taskId: 'tk-a', agentId: 'ag-103', outcome: 'accepted', quality: 100, note: 'Alice private note', ts: 1 },
  { id: 'out-bob', ownerId: owners.bob, taskId: 'tk-b', agentId: 'ag-103', outcome: 'accepted', quality: 100, note: 'Bob private note', ts: 2 },
  { id: 'out-alice-new', ownerId: owners.alice, taskId: 'tk-c', agentId: 'ag-103', outcome: 'accepted', quality: 100, note: 'Alice newer note', ts: 3 },
  { id: 'out-legacy', note: 'Unattributed private note', ts: 4 },
]
store.config.disputes = [
  { id: 'dis-alice-old', ownerId: owners.alice, taskId: 'tk-a', reason: 'Alice private reason', createdAt: 1, status: 'under_review', review: { verdict: 'pass', note: 'Private reviewer note' } },
  { id: 'dis-bob', ownerId: owners.bob, taskId: 'tk-b', reason: 'Bob private reason', createdAt: 2, status: 'review_failed', reviewError: 'Private error detail' },
  { id: 'dis-alice-new', ownerId: owners.alice, taskId: 'tk-c', reason: 'Alice newer reason', createdAt: 3, status: 'upheld', resolutionNote: 'Private resolution note' },
  { id: 'dis-legacy', reason: 'Unattributed private reason', createdAt: 4 },
]
store.config.feedFocus = { 'cu-private': 'Private agent instructions' }
store.config.futurePrivateField = 'Future private data'
store.config.reputation.futurePrivateField = 'Future nested private data'

async function request(path, user = 'alice', body, method = 'GET') {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(tokens[user] ? { Cookie: `oa_session=${tokens[user]}` } : {}),
      'Content-Type': 'application/json', 'X-Requested-With': 'OnlyAgent',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, data: await response.json() }
}

after(async () => {
  for (const client of wss.clients) client.terminate()
  await new Promise(resolve => wss.close(resolve))
  await new Promise(resolve => server.close(resolve))
  db.close()
  await rm(directory, { recursive: true, force: true })
})

function assertPublicConfig(config) {
  assert.deepEqual(Object.keys(config).sort(), ['explorationRate', 'fleetLimit', 'hireThreshold', 'reputation'])
  assert.deepEqual(Object.keys(config.reputation).sort(), ['completion', 'latency', 'social', 'trust'])
  assert.equal(config.fleetLimit, store.config.fleetLimit)
  assert.equal(config.explorationRate, store.config.explorationRate)
  assert.equal(config.hireThreshold, store.config.hireThreshold)
  for (const key of ['trust', 'completion', 'latency', 'social']) assert.equal(config.reputation[key], store.config.reputation[key])
}

test('configuration exposes only explicit public settings to users and administrators', async () => {
  for (const user of ['alice', 'bob', 'admin']) {
    const response = await request('/config', user)
    assert.equal(response.status, 200)
    assertPublicConfig(response.data.config)
  }
  const response = await request('/config', 'admin', { hireThreshold: 71 }, 'PUT')
  assert.equal(response.status, 200)
  assertPublicConfig(response.data.config)
  assert.equal(response.data.config.hireThreshold, 71)
  assert.equal(store.config.disputes[0].reason, 'Alice private reason')
  assert.equal((await request('/config', 'alice', {}, 'PUT')).status, 403)
})

test('all private record and administrator routes require authentication', async () => {
  for (const path of ['/config', '/outcomes', '/outcomes/out-alice-old', '/disputes', '/disputes/dis-alice-old', '/admin/disputes', '/admin/disputes/dis-alice-old']) {
    assert.equal((await request(path, 'anonymous')).status, 401, path)
  }
})

test('owners see only their own outcome and dispute lists in newest-first order', async () => {
  for (const [path, field, expected] of [
    ['/outcomes', 'outcomes', ['out-alice-new', 'out-alice-old']],
    ['/disputes', 'disputes', ['dis-alice-new', 'dis-alice-old']],
  ]) {
    const response = await request(`${path}?ownerId=${owners.bob}&email=${owners.bob}`)
    assert.equal(response.status, 200)
    assert.deepEqual(response.data[field].map(item => item.id), expected)
    assert.ok(response.data[field].every(item => item.ownerId === owners.alice))
    assert.deepEqual((await request(path, 'empty')).data[field], [])
    // Admin visibility is explicit: ordinary owner routes remain owner-scoped.
    assert.deepEqual((await request(path, 'admin')).data[field], [])
  }
  assert.equal((await request('/outcomes', 'bob')).data.outcomes[0].note, 'Bob private note')
  assert.equal((await request('/disputes', 'bob')).data.disputes[0].reviewError, 'Private error detail')
})

test('record detail returns owner data and conceals other owners and missing records equally', async () => {
  for (const [path, field, id] of [['/outcomes', 'outcome', 'out-alice-old'], ['/disputes', 'dispute', 'dis-alice-old']]) {
    const owned = await request(`${path}/${id}`)
    assert.equal(owned.status, 200)
    assert.equal(owned.data[field].id, id)
    const other = await request(`${path}/${id}`, 'bob')
    const missing = await request(`${path}/missing`, 'bob')
    assert.equal(other.status, 404)
    assert.deepEqual(other, missing)
    assert.equal((await request(`${path}/${id}`, 'admin')).status, 404)
  }
  assert.equal((await request('/disputes/dis-alice-old')).data.dispute.review.note, 'Private reviewer note')
})

test('administrator management access is denied to ordinary users', async () => {
  for (const user of ['alice', 'bob']) {
    assert.equal((await request('/admin/disputes', user)).status, 403)
    assert.equal((await request('/admin/disputes/dis-alice-old', user)).status, 403)
    assert.equal((await request('/disputes/dis-alice-old/resolve', user, { decision: 'uphold' }, 'POST')).status, 403)
  }
  const all = await request('/admin/disputes', 'admin')
  assert.equal(all.status, 200)
  assert.deepEqual(all.data.disputes.map(item => item.id), ['dis-legacy', 'dis-alice-new', 'dis-bob', 'dis-alice-old'])
  assert.equal((await request('/admin/disputes/dis-bob', 'admin')).data.dispute.reason, 'Bob private reason')
  assert.equal((await request('/admin/disputes/missing', 'admin')).status, 404)
  const resolved = await request('/disputes/dis-alice-old/resolve', 'admin', { decision: 'uphold', note: 'Administrator resolution' }, 'POST')
  assert.equal(resolved.status, 200)
  assert.equal(resolved.data.dispute.status, 'upheld')
  assert.equal((await request('/disputes/dis-alice-old')).data.dispute.resolutionNote, 'Administrator resolution')
  assert.equal((await request('/disputes/dis-alice-old', 'bob')).status, 404)
})

test('acceptance requires successful completion and preserves the receipt on retries', async () => {
  const { saveStore } = await import('../server/store.js')
  for (const status of ['failed', 'running', 'revision_requested', 'disputed', 'review_expired', 'refunded']) {
    const id = `tk-accept-${status}`
    store.tasks.push({ id, ownerId: owners.alice, agentId: 'ag-103', task: 'Acceptance fixture', status, ts: Date.now() })
    const response = await request(`/tasks/${id}/outcome`, 'alice', { outcome: 'accepted' }, 'POST')
    assert.equal(response.status, 409, status)
    assert.equal(store.tasks.find(task => task.id === id).status, status)
    assert.equal(store.config.customerOutcomes.some(item => item.taskId === id), false)
  }
  const task = { id: 'tk-accept-completed', ownerId: owners.alice, agentId: 'ag-103', task: 'Completed fixture', status: 'completed', ts: Date.now(), reviewDeadlineAt: Date.now() + 60000 }
  store.tasks.push(task)
  const accepted = await request(`/tasks/${task.id}/outcome`, 'alice', { outcome: 'accepted', note: 'Original receipt' }, 'POST')
  assert.equal(accepted.status, 201)
  task.reviewDeadlineAt = Date.now() - 1
  const repeat = await request(`/tasks/${task.id}/outcome`, 'alice', { outcome: 'accepted', note: 'Replacement receipt' }, 'POST')
  assert.equal(repeat.status, 200)
  assert.deepEqual(repeat.data.outcome, accepted.data.outcome)
  assert.equal(store.config.customerOutcomes.filter(item => item.taskId === task.id).length, 1)
  assert.equal((await request(`/tasks/${task.id}/outcome`, 'bob', { outcome: 'accepted' }, 'POST')).status, 403)
  saveStore()
  const { loadStore } = await import('../server/store.js')
  loadStore()
  assert.deepEqual((await request(`/tasks/${task.id}/outcome`, 'alice', { outcome: 'accepted' }, 'POST')).data.outcome, accepted.data.outcome)
})
