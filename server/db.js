import './env.js'
import { resolve } from 'node:path'
// ---------------------------------------------------------------------------
// SQLite persistence layer (PRD v2 §6.4 — "replace the flat JSON file with a
// real database; SQLite is enough for a hackathon").
//
// The in-memory store (store.js) remains the runtime working set — metrics and
// API handlers read it synchronously. This module owns the durable copy:
//   - schema (agents with owner fields, users, executions, audits, tasks,
//     config, feed tables for Phase 2)
//   - one-time migration from the legacy data/store.json when the DB is empty
//   - save/load of every collection
// ---------------------------------------------------------------------------

import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { migrateWalletIdentity } from './wallet-migration.js'
import { persistenceContext, hosted } from './persistence-context.js'
import { removeRevertedFields } from './rollback-fields.js'

const DATA_DIR = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : fileURLToPath(new URL('../data', import.meta.url))
const DB_FILE = `${DATA_DIR}/store.db`

if (!hosted) mkdirSync(DATA_DIR, { recursive: true })

const localDb = new Database(hosted ? ':memory:' : DB_FILE)
const currentDb = () => persistenceContext.getStore()?.db || localDb
// Prepared statements must bind to the request's database, including statements
// created during module initialization. No request reads another request's cache.
export const db = new Proxy({}, {
  get(_, property) {
    if (property === 'prepare') return sql => new Proxy({}, {
      get(_, method) { return (...args) => currentDb().prepare(sql)[method](...args) },
    })
    const value = currentDb()[property]
    return typeof value === 'function' ? value.bind(currentDb()) : value
  },
})
db.pragma('journal_mode = WAL')

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,          -- normalized wallet address
    name          TEXT NOT NULL,
    picture       TEXT,
    walletAddress TEXT,                      -- connected wallet (PRD §4.1)
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agents (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL,
    gender        TEXT,
    stage         TEXT NOT NULL,
    specialty     TEXT NOT NULL,             -- constrained to fixed category list
    description   TEXT,
    tags          TEXT,                      -- JSON array
    price         REAL,
    persona       TEXT,
    ownerId       TEXT,                      -- NULL = platform-owned flagship
    walletAddress TEXT,                      -- owner payout wallet
    mintTxHash    TEXT,                      -- verified on-chain mint (PRD §4.3)
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS executions (
    id        TEXT PRIMARY KEY,
    agentId   TEXT NOT NULL,
    task      TEXT NOT NULL,
    output    TEXT,
    success   INTEGER NOT NULL,
    latencyMs INTEGER NOT NULL,
    ts        INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_exec_agent ON executions(agentId);

  CREATE TABLE IF NOT EXISTS audits (
    id        TEXT PRIMARY KEY,
    agentId   TEXT NOT NULL,
    auditorId TEXT NOT NULL,
    task      TEXT NOT NULL,
    output    TEXT,
    verdict   TEXT NOT NULL,
    note      TEXT,
    ts        INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_agent ON audits(agentId);

  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    task        TEXT NOT NULL,
    agentId     TEXT NOT NULL,
    status      TEXT NOT NULL,
    executionId TEXT,
    ts          INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL                    -- JSON-encoded
  );

  -- Phase 2: social training feed
  CREATE TABLE IF NOT EXISTS feed_posts (
    id         TEXT PRIMARY KEY,
    agentId    TEXT NOT NULL,
    content    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'live',  -- pending | live (user approval gate)
    auditScore REAL,                          -- Gemini audit of the post
    ts         INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_feed_agent ON feed_posts(agentId);

  CREATE TABLE IF NOT EXISTS feed_reactions (
    id       TEXT PRIMARY KEY,
    postId   TEXT NOT NULL,
    agentId  TEXT NOT NULL,
    reaction TEXT NOT NULL,
    ts       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reaction_post ON feed_reactions(postId);

  -- Swarm analysis runs (roadmap: fan-out + merged report)
  CREATE TABLE IF NOT EXISTS swarm_runs (
    id         TEXT PRIMARY KEY,
    task       TEXT NOT NULL,
    agentIds   TEXT NOT NULL,               -- JSON array
    status     TEXT NOT NULL,
    startedAt  INTEGER NOT NULL,
    finishedAt INTEGER,
    results    TEXT,                        -- JSON array
    merged     TEXT,
    synthesis  TEXT,
    error      TEXT
  );
`)

// Schema evolution: add columns to tables created by older schema versions.
// Must run before statements are prepared below.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
}
// feed_reactions gained auditScore when the feed audit engine landed (PRD §4.4)
ensureColumn('feed_reactions', 'auditScore', 'auditScore REAL')
// tasks gained escrow fields when the hiring flow landed (PRD §4.6)
ensureColumn('tasks', 'escrowTaskId', 'escrowTaskId TEXT')
ensureColumn('tasks', 'consumer', 'consumer TEXT')
ensureColumn('tasks', 'amountEth', 'amountEth REAL')
ensureColumn('tasks', 'txHash', 'txHash TEXT')
ensureColumn('tasks', 'payoutEth', 'payoutEth REAL')
ensureColumn('tasks', 'feeEth', 'feeEth REAL')
ensureColumn('tasks', 'paidAt', 'paidAt INTEGER')
ensureColumn('tasks', 'reviewDeadlineAt', 'reviewDeadlineAt INTEGER')
ensureColumn('tasks', 'revisionCount', 'revisionCount INTEGER NOT NULL DEFAULT 0')
ensureColumn('tasks', 'revisionRequest', 'revisionRequest TEXT')
ensureColumn('tasks', 'escrowAddress', 'escrowAddress TEXT')
ensureColumn('tasks', 'escrowVersion', 'escrowVersion INTEGER')
ensureColumn('tasks', 'escrowSyncError', 'escrowSyncError TEXT')

// ---------------------------------------------------------------------------
// Collection load/save
// ---------------------------------------------------------------------------
ensureColumn('agents', 'tokenId', 'tokenId TEXT')
ensureColumn('feed_posts', 'audit', 'audit TEXT')
ensureColumn('tasks', 'auditId', 'auditId TEXT')
ensureColumn('tasks', 'ownerId', 'ownerId TEXT')
ensureColumn('swarm_runs', 'ownerId', 'ownerId TEXT')
const activityTables = ['executions', 'audits', 'tasks', 'feed_posts', 'feed_reactions', 'swarm_runs']
for (const table of activityTables) {
  ensureColumn(table, 'source', 'source TEXT')
  ensureColumn(table, 'model', 'model TEXT')
}

// Old records have no provider provenance. Preserve an atomic SQLite snapshot
// before excluding them from active metrics; never guess authenticity from text.
export function archiveUnverifiedActivity() {
  const counts = Object.fromEntries(activityTables.map((table) => [table,
    db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE source IS NULL`).get().c]))
  if (!Object.values(counts).some(Boolean)) return null
  if (hosted) throw new Error('Hosted history contains unverified records. Archive them locally before importing.')
  const archive = `${DATA_DIR}/unverified-history-${Date.now()}.db`
  db.prepare('VACUUM INTO ?').run(archive)
  db.transaction(() => {
    for (const table of activityTables) {
      // Keep chain payment records in the ledger, but do not treat their old
      // execution links as evidence of an actual model response.
      if (table === 'tasks') {
        db.prepare("UPDATE tasks SET source = 'legacy-chain', executionId = NULL, auditId = NULL WHERE source IS NULL AND escrowTaskId IS NOT NULL").run()
      }
      db.prepare(`DELETE FROM ${table} WHERE source IS NULL`).run()
    }
  })()
  console.log(`[db] archived unverified activity to ${archive}`)
  return { archive, counts }
}
const walletMigration = migrateWalletIdentity(db)
if (walletMigration) console.log('[db] migrated wallet-only identities:', JSON.stringify(walletMigration))

const stmts = {
  users: {
    insert: db.prepare(
      `INSERT OR REPLACE INTO users (id, name, picture, walletAddress, created_at)
       VALUES (@id, @name, @picture, @walletAddress, @created_at)`
    ),
    all: db.prepare('SELECT * FROM users'),
  },
  agents: {
    insert: db.prepare(
      `INSERT OR REPLACE INTO agents
         (id, name, role, gender, stage, specialty, description, tags, price, persona,
          ownerId, walletAddress, mintTxHash, created_at, tokenId)
       VALUES
         (@id, @name, @role, @gender, @stage, @specialty, @description, @tags, @price, @persona,
          @ownerId, @walletAddress, @mintTxHash, @created_at, @tokenId)`
    ),
    all: db.prepare('SELECT * FROM agents'),
  },
  executions: {
    insert: db.prepare(
      `INSERT OR REPLACE INTO executions (id, agentId, task, output, success, latencyMs, ts)
       VALUES (@id, @agentId, @task, @output, @success, @latencyMs, @ts)`
    ),
    all: db.prepare('SELECT * FROM executions'),
  },
  audits: {
    insert: db.prepare(
      `INSERT OR REPLACE INTO audits (id, agentId, auditorId, task, output, verdict, note, ts)
       VALUES (@id, @agentId, @auditorId, @task, @output, @verdict, @note, @ts)`
    ),
    all: db.prepare('SELECT * FROM audits'),
  },
  tasks: {
    insert: db.prepare(
      `INSERT OR REPLACE INTO tasks (id, task, agentId, status, executionId, ts, escrowTaskId, consumer, amountEth, txHash, payoutEth, feeEth, paidAt, auditId, ownerId, reviewDeadlineAt, revisionCount, revisionRequest, escrowAddress, escrowVersion, escrowSyncError)
       VALUES (@id, @task, @agentId, @status, @executionId, @ts, @escrowTaskId, @consumer, @amountEth, @txHash, @payoutEth, @feeEth, @paidAt, @auditId, @ownerId, @reviewDeadlineAt, @revisionCount, @revisionRequest, @escrowAddress, @escrowVersion, @escrowSyncError)`
    ),
    all: db.prepare('SELECT * FROM tasks'),
  },
  config: {
    upsert: db.prepare(
      `INSERT INTO config (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ),
    all: db.prepare('SELECT key, value FROM config'),
  },
  feed_posts: {
    insert: db.prepare(
      `INSERT OR REPLACE INTO feed_posts (id, agentId, content, status, auditScore, ts, audit)
       VALUES (@id, @agentId, @content, @status, @auditScore, @ts, @audit)`
    ),
    all: db.prepare('SELECT * FROM feed_posts'),
  },
  feed_reactions: {
    insert: db.prepare(
      `INSERT OR REPLACE INTO feed_reactions (id, postId, agentId, reaction, auditScore, ts)
       VALUES (@id, @postId, @agentId, @reaction, @auditScore, @ts)`
    ),
    all: db.prepare('SELECT * FROM feed_reactions'),
  },
  swarm_runs: {
    insert: db.prepare(
      `INSERT OR REPLACE INTO swarm_runs (id, task, agentIds, status, startedAt, finishedAt, results, merged, synthesis, error, ownerId)
       VALUES (@id, @task, @agentIds, @status, @startedAt, @finishedAt, @results, @merged, @synthesis, @error, @ownerId)`
    ),
    all: db.prepare('SELECT * FROM swarm_runs'),
  },
}

// Row → in-memory shape (SQLite booleans are 0/1, tags are JSON strings,
// stage is stored as its id and restored to the lifecycle object)
const STAGE_BY_ID = {
  discovery: { id: 'discovery', label: 'Discovery', color: '#6366f1' },
  design: { id: 'design', label: 'Design', color: '#8b5cf6' },
  development: { id: 'development', label: 'Development', color: '#3d6cec' },
  qa: { id: 'qa', label: 'QA & Security', color: '#f59e0b' },
  deployment: { id: 'deployment', label: 'Deployment', color: '#10b981' },
  operations: { id: 'operations', label: 'Operations', color: '#ef4444' },
}
function rowToExec(row) {
  return { ...row, success: !!row.success }
}
function rowToAgent(row) {
  return { ...row, tags: row.tags ? JSON.parse(row.tags) : [], stage: STAGE_BY_ID[row.stage] || row.stage }
}

export function dbSaveAll({ users, agents, executions, audits, tasks, config, feedPosts, feedReactions, swarmRuns }) {
  const tx = db.transaction(() => {
    users.forEach((u) => stmts.users.insert.run(u))
    agents.forEach((a) =>
      stmts.agents.insert.run({
        tokenId: null, ...a,
        tags: JSON.stringify(a.tags || []),
        stage: typeof a.stage === 'string' ? a.stage : a.stage?.id,
      })
    )
    executions.forEach((e) => stmts.executions.insert.run({ ...e, success: e.success ? 1 : 0 }))
    audits.forEach((a) => stmts.audits.insert.run(a))
    tasks.forEach((t) => stmts.tasks.insert.run({ executionId: null, escrowTaskId: null, consumer: null, amountEth: null, txHash: null, payoutEth: null, feeEth: null, paidAt: null, auditId: null, ownerId: null, reviewDeadlineAt: null, revisionCount: 0, revisionRequest: null, escrowAddress: null, escrowVersion: null, escrowSyncError: null, ...t }))
    Object.entries(config).forEach(([k, v]) => stmts.config.upsert.run(k, JSON.stringify(v)))
    ;(feedPosts || []).forEach((p) => stmts.feed_posts.insert.run({ ...p, audit: JSON.stringify(p.audit || null) }))
    ;(feedReactions || []).forEach((r) => stmts.feed_reactions.insert.run(r))
    ;(swarmRuns || []).forEach((r) =>
      stmts.swarm_runs.insert.run({
        ...r,
        ownerId: r.ownerId || null,
        agentIds: JSON.stringify(r.agentIds || []),
        results: JSON.stringify(r.results || []),
      })
    )
    const collections = { executions, audits, tasks, feed_posts: feedPosts || [], feed_reactions: feedReactions || [], swarm_runs: swarmRuns || [] }
    for (const [table, records] of Object.entries(collections)) {
      const provenance = db.prepare(`UPDATE ${table} SET source = ?, model = ? WHERE id = ?`)
      const selected = JSON.parse(db.prepare("SELECT value FROM config WHERE key = 'runtime'").get()?.value || '{}')
      const source = 'gemini'
      const model = selected.geminiModel || process.env.GEMINI_MODEL || 'gemini-flash-lite-latest'
      for (const record of records) provenance.run(record.source || source, record.model || model, record.id)
    }
  })
  tx()
  persistenceContext.getStore()?.checkpoint?.()
}

export function exportDatabase(database = currentDb()) {
  const names = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
  return { tables: Object.fromEntries(names.map(({ name }) => [name, database.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()])) }
}

export function createWorkingDatabase(snapshot) {
  // An in-flight deployment or cron worker can reintroduce these columns after
  // a one-off rollback. Strip only the known reverted fields on every load;
  // the next write exports the current schema without those fields.
  snapshot = removeRevertedFields(snapshot).snapshot
  const database = new Database(':memory:')
  try {
    // Rebuild schema, rather than deserializing a WAL-mode file whose journal
    // header can require a filesystem even when its bytes are in memory.
    const schema = localDb.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END").all()
    for (const { sql } of schema) database.exec(sql)
    const template = exportDatabase(database)
    database.transaction(() => {
      for (const name of Object.keys(template.tables)) database.exec(`DELETE FROM "${name}"`)
      for (const [name, rows] of Object.entries(snapshot?.tables || {})) {
        if (!Object.hasOwn(template.tables, name)) throw new Error('The hosted database contains an unsupported table. Update the application before importing it.')
        const allowed = new Set(database.prepare(`PRAGMA table_info("${name}")`).all().map(column => column.name))
        for (const row of rows) {
          const columns = Object.keys(row)
          if (!columns.length || columns.some(column => !allowed.has(column))) throw new Error('The hosted database schema does not match this application version.')
          database.prepare(`INSERT INTO "${name}" (${columns.map(column => `"${column}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map(column => row[column]))
        }
      }
    })()
    return database
  } catch (error) { database.close(); throw error }
}

export function dbLoadAll() {
  const users = stmts.users.all.all()
  const agents = stmts.agents.all.all().map(rowToAgent)
  const executions = stmts.executions.all.all().map(rowToExec)
  const audits = stmts.audits.all.all()
  const tasks = stmts.tasks.all.all()
  const feedPosts = stmts.feed_posts.all.all().map((p) => ({ ...p, audit: p.audit ? JSON.parse(p.audit) : null }))
  const feedReactions = stmts.feed_reactions.all.all()
  const swarmRuns = stmts.swarm_runs.all.all().map((r) => ({
    ...r,
    agentIds: r.agentIds ? JSON.parse(r.agentIds) : [],
    results: r.results ? JSON.parse(r.results) : [],
  }))
  const config = {}
  stmts.config.all.all().forEach(({ key, value }) => {
    try {
      config[key] = JSON.parse(value)
    } catch {
      /* ignore malformed config rows */
    }
  })
  return { users, agents, executions, audits, tasks, config, feedPosts, feedReactions, swarmRuns }
}

export function dbCounts() {
  return {
    executions: db.prepare('SELECT COUNT(*) c FROM executions').get().c,
    audits: db.prepare('SELECT COUNT(*) c FROM audits').get().c,
    tasks: db.prepare('SELECT COUNT(*) c FROM tasks').get().c,
    users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    agents: db.prepare('SELECT COUNT(*) c FROM agents').get().c,
    swarmRuns: db.prepare('SELECT COUNT(*) c FROM swarm_runs').get().c,
  }
}

// Highest numeric id suffix across all tables — keeps nextId() collision-free
// even after records are deleted (counts alone would reuse ids).
export function dbMaxSeq() {
  const tables = ['executions', 'audits', 'tasks', 'users', 'agents', 'feed_posts', 'feed_reactions', 'swarm_runs']
  let max = 0
  for (const t of tables) {
    for (const row of db.prepare(`SELECT id FROM ${t}`).all()) {
      const m = /-(\d+)$/.exec(row.id)
      if (m) max = Math.max(max, Number(m[1]))
    }
  }
  return max
}
