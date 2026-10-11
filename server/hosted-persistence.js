import { randomUUID } from 'node:crypto'
import { createWorkingDatabase, exportDatabase } from './db.js'
import { createStore, loadStore, saveStore } from './store.js'
import { persistenceContext } from './persistence-context.js'
import { reloadRuntime } from './runtime.js'
import { supabaseRpc } from './supabase.js'

// A PostgreSQL lease serializes hosted writes, with revision and token fencing.
// Reads use independent snapshots and do not wait for AI or chain operations.
export async function withHostedState({ write = false, rpc = supabaseRpc } = {}, work) {
  const owner = randomUUID()
  const state = await rpc(write ? 'oa_acquire' : 'oa_read', write ? { p_owner: owner } : {})
  let database
  try {
    if (!state || typeof state.version !== 'number' || !state.snapshot?.tables || Array.isArray(state.snapshot.tables) || typeof state.snapshot.tables !== 'object') throw Object.assign(new Error('Supabase returned an invalid application state. Check the schema setup.'), { status: 503 })
    database = createWorkingDatabase(state.snapshot)
    let version = state.version
    let tail = Promise.resolve(), failure, lastSnapshot = JSON.stringify(state.snapshot)
    const persist = () => {
      if (!write) return
      const snapshot = exportDatabase(database)
      const serialized = JSON.stringify(snapshot)
      if (serialized === lastSnapshot) return
      lastSnapshot = serialized
      tail = tail.then(async () => {
        if (failure) throw failure
        const result = await rpc('oa_commit', { p_owner: owner, p_version: version, p_snapshot: snapshot })
        version = result.version
      })
      tail.catch(error => { failure = error })
    }
    const context = { db: database, store: createStore(), checkpoint: persist, flush: async () => { persist(); await tail; if (failure) throw failure } }
    return await persistenceContext.run(context, async () => {
      loadStore({ recover: write })
      reloadRuntime()
      if (write) {
        // Recovery must be durable even when the next request is read-only.
        saveStore()
        await context.flush()
      }
      const jobs = storeJobs(database)
      context.store.feed.enabled = process.env.FEED_CYCLE_ENABLED === 'true'
      context.store.feed.lastCycleAt = jobs.lastFeedAt || null
      context.store.feed.nextCycleAt = context.store.feed.enabled ? (jobs.lastFeedAt || Date.now()) + context.store.feed.intervalMs : null
      try { return await work() }
      finally { await context.flush() }
    })
  } finally {
    database?.close()
    if (write) await rpc('oa_release', { p_owner: owner }).catch(() => {})
  }
}

function storeJobs(database) {
  return JSON.parse(database.prepare("SELECT value FROM config WHERE key = 'hostedJobs'").get()?.value || '{}')
}
