import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, readdirSync, rmSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { createServer } from 'node:http'
import { privateKeyToAccount } from 'viem/accounts'

const directory = mkdtempSync(join(tmpdir(), 'onlyagent-supabase-'))
Object.assign(process.env, { DATA_DIR: directory, GEMINI_API_KEY: '', ESCROW_OPERATOR_PRIVATE_KEY: '', BACKUP_ENABLED: 'false' })
await import('../server/index.js') // initializes all working-copy schemas, no listener
const { db, createWorkingDatabase } = await import('../server/db.js')
const { removeRevertedFields } = await import('../scripts/lib/rollback-fields.mjs')
const { store, saveStore } = await import('../server/store.js')
const { withHostedState } = await import('../server/hosted-persistence.js')
const { flushPersistence } = await import('../server/persistence-context.js')
const postgres = new PGlite()
await postgres.exec('create role anon; create role authenticated; create role service_role;')
await postgres.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'))
const names = { oa_read: [], oa_acquire: ['p_owner'], oa_commit: ['p_owner', 'p_version', 'p_snapshot'], oa_release: ['p_owner'] }
async function rpc(name, body = {}) {
  const values = names[name].map(key => key === 'p_snapshot' ? JSON.stringify(body[key]) : body[key])
  const result = await postgres.query(`select public.${name}(${values.map((_, index) => '$' + (index + 1)).join(',')}) as data`, values)
  return result.rows[0].data
}
after(async () => {
  await postgres.close()
  db.close()
  for (const file of readdirSync(directory)) rmSync(join(directory, file))
  rmdirSync(directory)
})

test('Supabase schema is repeatable and denies browser roles access', async () => {
  await postgres.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'))
  const result = await postgres.query("select has_function_privilege('anon','public.oa_read()','execute') as anon, has_function_privilege('authenticated','public.oa_acquire(uuid)','execute') as authenticated, has_function_privilege('service_role','public.oa_commit(uuid,bigint,jsonb)','execute') as server")
  assert.deepEqual(result.rows[0], { anon: false, authenticated: false, server: true })
  assert.equal((await postgres.query("select has_table_privilege('anon','public.onlyagent_state','select') as allowed")).rows[0].allowed, false)
})

test('write leases reject overlap and stale revisions; expired workers cannot commit or release a newer lease', async () => {
  const first = '11111111-1111-4111-8111-111111111111'
  const second = '22222222-2222-4222-8222-222222222222'
  const state = await rpc('oa_acquire', { p_owner: first })
  await assert.rejects(rpc('oa_acquire', { p_owner: second }), /OA_BUSY/)
  const committed = await rpc('oa_commit', { p_owner: first, p_version: state.version, p_snapshot: { tables: {} } })
  assert.equal(committed.version, state.version + 1)
  await assert.rejects(rpc('oa_commit', { p_owner: first, p_version: state.version, p_snapshot: { tables: {} } }), /OA_FENCE/)
  await postgres.exec("update public.onlyagent_state set lease_until = now() - interval '1 second'")
  const next = await rpc('oa_acquire', { p_owner: second })
  await assert.rejects(rpc('oa_commit', { p_owner: first, p_version: next.version, p_snapshot: { tables: {} } }), /OA_FENCE/)
  await rpc('oa_release', { p_owner: first })
  await assert.rejects(rpc('oa_acquire', { p_owner: first }), /OA_BUSY/)
  await rpc('oa_release', { p_owner: second })
})

test('cron SQL requires Vault secrets, replaces its schedule, and sends a protected bounded request', async () => {
  // Stub extension interfaces; exercise the actual setup and scheduled SQL.
  await postgres.exec(`
    create schema vault; create table vault.decrypted_secrets(name text, decrypted_secret text);
    create schema cron; create table cron.job(jobid bigserial, jobname text, command text);
    create function cron.unschedule(bigint) returns boolean language sql as 'delete from cron.job where jobid=$1 returning true';
    create function cron.schedule(text,text,text) returns bigint language sql as 'insert into cron.job(jobname,command) values($1,$3) returning jobid';
    create schema net; create table net.requests(url text, headers jsonb, body jsonb, timeout integer);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.requests values($1,$2,$3,$4) returning 1::bigint';
  `)
  const sql = readFileSync(new URL('../supabase/schedule.sql', import.meta.url), 'utf8')
  await assert.rejects(postgres.exec(sql), /Configure onlyagent_origin/)
  await postgres.exec("insert into vault.decrypted_secrets values ('onlyagent_origin','https://fixture.vercel.app'), ('onlyagent_cron_secret','fixture-only-secret')")
  await postgres.exec(sql)
  await postgres.exec(sql)
  const jobs = (await postgres.query('select command from cron.job')).rows
  assert.equal(jobs.length, 1)
  await postgres.exec(jobs[0].command)
  const request = (await postgres.query('select * from net.requests')).rows[0]
  assert.equal(request.url, 'https://fixture.vercel.app/api/jobs/tick')
  assert.equal(request.headers.Authorization, 'Bearer fixture-only-secret')
  assert.equal(request.timeout, 280000)
})

test('request-local records and SQL sessions survive fresh invocations; read snapshots cannot overwrite progress', async () => {
  const wallet = '0x' + '1'.repeat(40)
  await withHostedState({ write: true, rpc }, async () => {
    assert.equal(store.users.length, 0)
    store.users.push({ id: wallet, walletAddress: wallet, name: 'Wallet fixture', picture: '', created_at: 1 })
    store.tasks.push({ id: 'tk-0042', task: 'fixture', agentId: 'ag-101', ownerId: wallet, status: 'running', ts: 1, source: 'gemini', model: 'fixture' })
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run('hashed-session', JSON.stringify({ id: wallet, walletAddress: wallet }), Date.now() + 10000)
    saveStore()
    await flushPersistence()
    await withHostedState({ rpc }, async () => {
      assert.equal(store.tasks[0].status, 'running')
      assert.equal(db.prepare('SELECT hash FROM sessions').get().hash, 'hashed-session')
      store.tasks[0].status = 'tampered-read'
      saveStore()
    })
    assert.equal(store.tasks[0].status, 'running')
    store.tasks[0].status = 'completed'
    saveStore()
  })
  await withHostedState({ rpc }, async () => {
    assert.equal(store.users[0].id, wallet)
    assert.equal(store.tasks[0].status, 'completed')
    assert.equal(store.seq >= 42, true)
  })
  // The durable working copies never modified the process's local SQLite file.
  assert.equal(db.prepare('SELECT COUNT(*) c FROM tasks').get().c, 0)
})

test('field rollback removes only reverted columns and restores snapshot compatibility', async () => {
  const state = await rpc('oa_read')
  const original = structuredClone(state.snapshot)
  const task = original.tables.tasks[0]
  task.agentOwner = '0x' + '2'.repeat(40)
  const agent = { id: 'historical', name: 'Historical agent', role: 'Coder', stage: 'seed', specialty: 'Coder', created_at: 1, factoryAddress: '0x' + '3'.repeat(40), mintedBy: '0x' + '4'.repeat(40) }
  original.tables.agents = [agent]
  assert.throws(() => createWorkingDatabase(original), /schema does not match/)
  const { snapshot, removed } = removeRevertedFields(original)
  assert.deepEqual(removed, { agents: 2, tasks: 1 })
  assert.equal(Object.hasOwn(original.tables.tasks[0], 'agentOwner'), true)
  const expected = structuredClone(original)
  delete expected.tables.tasks[0].agentOwner
  delete expected.tables.agents[0].factoryAddress
  delete expected.tables.agents[0].mintedBy
  assert.deepEqual(snapshot, expected)
  const working = createWorkingDatabase(snapshot)
  assert.equal(working.prepare('SELECT COUNT(*) c FROM tasks').get().c, original.tables.tasks.length)
  assert.equal(working.prepare('SELECT name FROM agents').get().name, 'Historical agent')
  working.close()
  snapshot.tables.tasks[0].unexpectedField = 'keep validation strict'
  assert.throws(() => createWorkingDatabase(snapshot), /schema does not match/)
})

test('failed checkpoint prevents acknowledgement and releases the writer lease', async () => {
  let released = false
  const failing = async (name, body) => {
    if (name === 'oa_commit') throw new Error('storage unavailable')
    if (name === 'oa_release') released = true
    return rpc(name, body)
  }
  await assert.rejects(withHostedState({ write: true, rpc: failing }, async () => {
    store.config.hireThreshold = 99
    saveStore()
    await flushPersistence()
  }), /storage unavailable/)
  assert.equal(released, true)
  await withHostedState({ rpc }, async () => assert.notEqual(store.config.hireThreshold, 99))
})

test('interrupted work becomes durably recoverable and config receipt IDs remain unique across invocations', async () => {
  await withHostedState({ write: true, rpc }, async () => {
    store.tasks.push({ id: 'tk-0043', task: 'interrupted fixture', agentId: 'ag-101', ownerId: '0x' + '1'.repeat(40), status: 'running', ts: 2, source: 'gemini', model: 'fixture' })
    store.config.customerOutcomes.push({ id: 'out-0055', taskId: 'tk-0042' })
    saveStore()
  })
  await withHostedState({ rpc }, async () => assert.equal(store.tasks.find(task => task.id === 'tk-0043').status, 'running'))
  await withHostedState({ write: true, rpc }, async () => assert.equal(store.seq >= 55, true))
  await withHostedState({ rpc }, async () => assert.equal(store.tasks.find(task => task.id === 'tk-0043').status, 'failed'))
})

test('hosted HTTP waits for lease release before sending a response and accepts the next scheduled write', async t => {
  const { default: handler } = await import('../api/index.js')
  process.env.SUPABASE_URL = 'https://fixture.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-server-key'
  process.env.CRON_SECRET = 'test-only-cron-secret-'.repeat(3)
  let unblockRelease, notifyRelease, ended = false, released = false
  const gate = new Promise(resolve => { unblockRelease = resolve })
  const entered = new Promise(resolve => { notifyRelease = resolve })
  const originalFetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (!String(url).startsWith(process.env.SUPABASE_URL)) return originalFetch(url, options)
    const name = String(url).split('/').at(-1)
    if (name === 'oa_release') { notifyRelease(); await gate }
    const data = await rpc(name, JSON.parse(options.body))
    if (name === 'oa_release') released = true
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  })
  const server = createServer((req, res) => {
    const end = res.end.bind(res)
    res.end = (...args) => { ended = true; assert.equal(released, true); return end(...args) }
    handler(req, res)
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const url = `http://127.0.0.1:${server.address().port}/api/index?__oa_path=jobs%2Ftick`
  const options = { method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' }, body: '{}' }
  let pending
  try {
    pending = fetch(url, options)
    await entered
    assert.equal(ended, false, 'response must stay pending while the lease is held')
    await assert.rejects(rpc('oa_acquire', { p_owner: '33333333-3333-4333-8333-333333333333' }), /OA_BUSY/)
    unblockRelease()
    const response = await pending
    assert.equal(response.status, 200)
    assert.equal((await response.json()).ok, true)
    assert.equal(ended, true)
    const next = await fetch(url, options)
    assert.equal(next.status, 200, 'next write should not inherit a busy lease')
    await next.json()
  } finally {
    unblockRelease()
    await pending?.catch(() => {})
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})

test('hosted HTTP wallet sessions persist before acknowledgement, reject private history access, and protect cron', async t => {
  const { default: handler } = await import('../api/index.js')
  process.env.SUPABASE_URL = 'https://fixture.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-server-key'
  process.env.APP_ORIGIN = 'https://onlyagent-fixture.vercel.app'
  process.env.CRON_SECRET = 'test-only-cron-secret-'.repeat(3)
  const originalFetch = globalThis.fetch
  let failCommit = false
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith(process.env.SUPABASE_URL)) {
      const name = String(url).split('/').at(-1)
      if (failCommit && name === 'oa_commit') return new Response('fixture storage failure', { status: 503 })
      try { return new Response(JSON.stringify(await rpc(name, JSON.parse(options.body))), { headers: { 'Content-Type': 'application/json' } }) }
      catch (error) { return new Response(error.message, { status: 409 }) }
    }
    return originalFetch(url, options)
  })
  const server = createServer(handler)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const base = `http://127.0.0.1:${server.address().port}`
  const account = privateKeyToAccount('0x' + '4'.repeat(64))
  async function call(path, body, cookie = '', authorization) {
    return fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN, 'X-Requested-With': 'OnlyAgent', Cookie: cookie, ...(authorization ? { Authorization: authorization } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }
  try {
    const health = await call('/api/index?__oa_path=health')
    assert.equal(health.status, 200)
    assert.equal(typeof (await health.json()).executions, 'number')
    const challenge = await (await call('/api/auth/challenge', { walletAddress: account.address })).json()
    assert.match(challenge.message, /https:\/\/onlyagent-fixture.vercel.app/)
    const signature = await account.signMessage({ message: challenge.message })
    failCommit = true
    const failed = await call('/api/auth/session', { walletAddress: account.address, signature })
    assert.equal(failed.status, 503)
    assert.equal(failed.headers.get('set-cookie'), null)
    failCommit = false
    const signedIn = await call('/api/auth/session', { walletAddress: account.address, signature })
    assert.equal(signedIn.status, 200)
    const cookie = signedIn.headers.get('set-cookie').split(';')[0]
    assert.equal((await (await call('/api/auth/me', undefined, cookie)).json()).user.walletAddress, account.address.toLowerCase())
    assert.equal((await call('/api/tasks/tk-0042', undefined, cookie)).status, 404)
    assert.equal((await call('/api/jobs/tick', {})).status, 401)
    const job = await call('/api/index?__oa_path=jobs%2Ftick', {}, '', `Bearer ${process.env.CRON_SECRET}`)
    assert.equal(job.status, 200)
    assert.equal((await job.json()).kind, 'idle')
    assert.equal((await call('/api/auth/logout', {}, cookie)).status, 200)
    assert.equal((await call('/api/auth/me', undefined, cookie)).status, 401)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
