import { AsyncLocalStorage } from 'node:async_hooks'
import { db } from './db.js'
export const requestContext = new AsyncLocalStorage()
db.exec(`CREATE TABLE IF NOT EXISTS api_usage (ownerId TEXT NOT NULL, day TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(ownerId, day))`)
export function usageFor(ownerId) {
  const day = new Date().toISOString().slice(0, 10)
  const limit = Math.max(1, Number(process.env.DAILY_AI_CALL_LIMIT) || 100)
  const used = db.prepare('SELECT calls FROM api_usage WHERE ownerId = ? AND day = ?').get(ownerId, day)?.calls || 0
  return { day, used, limit, remaining: Math.max(0, limit - used), resetTimezone: 'UTC' }
}
export function consumeModelCall() {
  const ownerId = requestContext.getStore()?.ownerId
  if (!ownerId) return
  db.transaction(() => {
    const usage = usageFor(ownerId)
    if (!usage.remaining) throw Object.assign(new Error('Daily AI call limit reached. Try again after midnight UTC.'), { status: 429 })
    db.prepare(`INSERT INTO api_usage VALUES (?, ?, 1) ON CONFLICT(ownerId, day) DO UPDATE SET calls = calls + 1`).run(ownerId, usage.day)
  })()
}
let active = 0
const waiters = []
export async function withModelSlot(work) {
  const limit = Math.max(1, Math.min(10, Number(process.env.AI_CONCURRENCY) || 3))
  if (active >= limit) {
    if (waiters.length >= 30) throw Object.assign(new Error('AI service is busy. Retry shortly.'), { status: 503 })
    await new Promise((resolve) => waiters.push(resolve))
  } else active++
  try { return await work() } finally {
    const next = waiters.shift()
    if (next) next()
    else active--
  }
}
const buckets = new Map()
export function rateLimit(req, res, next) {
  const now = Date.now(), key = req.user?.email || req.ip
  let bucket = buckets.get(key)
  if (!bucket || now >= bucket.until) { bucket = { count: 0, until: now + 60000 }; buckets.set(key, bucket) }
  const limit = req.baseUrl === '/api/auth' ? Number(process.env.AUTH_RATE_LIMIT) || 60 : Number(process.env.API_RATE_LIMIT) || 600
  if (++bucket.count > limit) { res.setHeader('Retry-After', Math.ceil((bucket.until - now) / 1000)); return res.status(429).json({ error: 'Too many API requests. Retry shortly.' }) }
  if (buckets.size > 1000) for (const [id, value] of buckets) if (now >= value.until) buckets.delete(id)
  next()
}
