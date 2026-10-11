import { test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { migrateWalletIdentity } from '../server/wallet-migration.js'

const primary = '0x1111111111111111111111111111111111111111'
const secondary = '0x2222222222222222222222222222222222222222'
function fixture() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY,name TEXT,email TEXT,picture TEXT,walletAddress TEXT,created_at INTEGER);
    CREATE TABLE wallet_links (wallet TEXT,ownerId TEXT);
    CREATE TABLE wallet_challenges (ownerId TEXT);
    CREATE TABLE agents (id TEXT,ownerId TEXT,walletAddress TEXT);
    CREATE TABLE tasks (id TEXT,ownerId TEXT,consumer TEXT,executionId TEXT,auditId TEXT);
    CREATE TABLE executions (id TEXT); CREATE TABLE audits (id TEXT);
    CREATE TABLE feed_posts (id TEXT,agentId TEXT); CREATE TABLE feed_reactions (id TEXT,postId TEXT,agentId TEXT);
    CREATE TABLE swarm_runs (id TEXT,ownerId TEXT); CREATE TABLE config (key TEXT,value TEXT);
    CREATE TABLE sessions (hash TEXT,identity TEXT);
    CREATE TABLE api_usage (ownerId TEXT); CREATE TABLE request_keys (ownerId TEXT);
  `)
  return db
}

test('migration splits recorded wallets, removes unlinked history and email sessions, and runs once', () => {
  const db = fixture()
  try {
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run('linked@example.test', 'Old profile', 'linked@example.test', '', primary, 1)
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run('unlinked@example.test', 'Unlinked', 'unlinked@example.test', '', null, 1)
    for (const address of [primary, secondary]) db.prepare('INSERT INTO wallet_links VALUES (?,?)').run(address, 'linked@example.test')
    db.prepare('INSERT INTO agents VALUES (?,?,?)').run('agent', 'linked@example.test', secondary)
    db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?)').run('paid', 'linked@example.test', secondary, null, null)
    db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?)').run('ordinary', 'linked@example.test', null, null, null)
    db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?)').run('delete', 'unlinked@example.test', null, 'delete-execution', 'delete-audit')
    db.exec("INSERT INTO executions VALUES ('delete-execution'); INSERT INTO audits VALUES ('delete-audit'); INSERT INTO swarm_runs VALUES ('delete-swarm','unlinked@example.test')")
    db.prepare('INSERT INTO config VALUES (?,?)').run('customerOutcomes', JSON.stringify([{ taskId: 'paid', ownerId: 'linked@example.test' }, { taskId: 'delete', ownerId: 'unlinked@example.test' }]))
    db.prepare('INSERT INTO sessions VALUES (?,?)').run('legacy', JSON.stringify({ email: 'linked@example.test', walletAddress: primary }))
    db.prepare('INSERT INTO sessions VALUES (?,?)').run('signed', JSON.stringify({ email: primary, walletAddress: primary }))
    assert.deepEqual(migrateWalletIdentity(db), { movedTaskCount: 2, movedAgentCount: 1, removedTaskCount: 1 })
    assert.deepEqual(db.prepare('SELECT id,ownerId FROM tasks ORDER BY id').all(), [{ id: 'ordinary', ownerId: primary }, { id: 'paid', ownerId: secondary }])
    assert.equal(db.prepare('SELECT ownerId FROM agents').get().ownerId, secondary)
    assert.equal(db.prepare('SELECT count(*) n FROM executions').get().n, 0)
    assert.equal(db.prepare('SELECT count(*) n FROM audits').get().n, 0)
    assert.equal(db.prepare('SELECT count(*) n FROM swarm_runs').get().n, 0)
    assert.deepEqual(JSON.parse(db.prepare('SELECT value FROM config').get().value), [{ taskId: 'paid', ownerId: secondary }])
    assert.deepEqual(db.prepare('SELECT id FROM users ORDER BY id').all(), [{ id: primary }, { id: secondary }])
    assert.equal(db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'email'), false)
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='wallet_links'").get(), undefined)
    assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n, 1)
    assert.equal(JSON.parse(db.prepare('SELECT identity FROM sessions').get().identity).email, undefined)
    assert.equal(migrateWalletIdentity(db), null)
  } finally { db.close() }
})

test('ambiguous linked history fails before changing any records', () => {
  const db = fixture()
  try {
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run('ambiguous@example.test', '', '', '', null, 1)
    for (const address of [primary, secondary]) db.prepare('INSERT INTO wallet_links VALUES (?,?)').run(address, 'ambiguous@example.test')
    assert.throws(() => migrateWalletIdentity(db), /multiple wallets/)
    assert.equal(db.prepare('SELECT count(*) n FROM users').get().n, 1)
    assert.equal(db.prepare('SELECT count(*) n FROM wallet_links').get().n, 2)
  } finally { db.close() }
})
