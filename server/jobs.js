import { timingSafeEqual } from 'node:crypto'
import { store, saveStore } from './store.js'
import { db } from './db.js'
import { isV2Escrow, syncEscrowTask } from './escrow.js'
import { runFeedCycle } from './feed.js'
import { MODE } from './runtime.js'
import { flushPersistence } from './persistence-context.js'

function authorized(value) {
  const expected = process.env.CRON_SECRET
  if (!expected || expected.length < 32 || typeof value !== 'string') return false
  const a = Buffer.from(value), b = Buffer.from(`Bearer ${expected}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

// No fire-and-forget work: one bounded unit per invocation. The Supabase write
// lease also coordinates operator nonces across separate Vercel instances.
export async function scheduledJobs(req, res) {
  if (!authorized(req.headers.authorization)) return res.status(401).json({ error: 'Scheduled job authentication required.' })
  const saved = db.prepare("SELECT value FROM config WHERE key = 'hostedJobs'").get()
  const jobs = saved ? JSON.parse(saved.value) : { checked: {}, lastFeedAt: 0 }
  const now = Date.now()
  const candidates = store.tasks.filter(task => isV2Escrow(task) && !['paid', 'released', 'refunded'].includes(task.status))
    .sort((a, b) => (jobs.checked[a.id] || 0) - (jobs.checked[b.id] || 0))
  let result = { kind: 'idle' }
  if (candidates.length && (!jobs.lastFeedAt || now - jobs.lastFeedAt < Math.max(60000, Number(process.env.FEED_CYCLE_MS) || 300000) || process.env.FEED_CYCLE_ENABLED !== 'true')) {
    const task = candidates[0]
    try { await syncEscrowTask(task); result = { kind: 'escrow', taskId: task.id } }
    catch { task.escrowSyncError = 'Scheduled escrow synchronization failed. Retry synchronization from the task ledger.'; saveStore(); result = { kind: 'escrow', taskId: task.id, retry: true } }
    jobs.checked[task.id] = now
    // Yield the next invocation to feed generation if enabled.
    jobs.lastFeedAt ||= now - Math.max(60000, Number(process.env.FEED_CYCLE_MS) || 300000)
  } else if (MODE !== 'unconfigured' && process.env.FEED_CYCLE_ENABLED === 'true' && now - jobs.lastFeedAt >= Math.max(60000, Number(process.env.FEED_CYCLE_MS) || 300000)) {
    await runFeedCycle({ count: 1, spacingMs: 0 })
    jobs.lastFeedAt = now
    result = { kind: 'feed' }
  }
  const ids = new Set(candidates.map(task => task.id))
  jobs.checked = Object.fromEntries(Object.entries(jobs.checked).filter(([id]) => ids.has(id)))
  db.prepare("INSERT INTO config (key, value) VALUES ('hostedJobs', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(jobs))
  await flushPersistence()
  res.json({ ok: true, ...result })
}
