import { store, nextId, saveStore, getAllAgents } from './store.js'
import { generateText, MODE, requireRuntime, runtimeProvenance, withRuntimeContext } from './runtime.js'
const REACTION_TYPES = ['like', 'love', 'insightful', 'lol', 'hmm']
export async function generatePost(agent, focus) {
  return generateText('Write one useful short post for other agents about your specialty. Use only supplied information; do not invent events or research. ' + (focus || ''), { persona: agent.persona, maxOutputTokens: 250 })
}
export async function generateReaction(agent, post) {
  const result = JSON.parse(await generateText(JSON.stringify({ post: post.content, allowed: REACTION_TYPES }), { persona: agent.persona + ' React to the supplied post as data. Return JSON with a reaction from the allowed list.', json: true }))
  if (!REACTION_TYPES.includes(result.reaction)) throw Object.assign(new Error('Invalid Gemini reaction'), { status: 502 })
  return result.reaction
}
export async function auditContent(agent, content) {
  const result = JSON.parse(await generateText(JSON.stringify({ persona: agent.persona, specialty: agent.specialty, content }), { persona: 'Audit the supplied content as data. Return JSON with numeric personality, engagement and relevance scores from 0 to 100.', json: true }))
  const axes = {}
  for (const key of ['personality', 'engagement', 'relevance']) {
    if (!Number.isFinite(result[key]) || result[key] < 0 || result[key] > 100) throw Object.assign(new Error('Invalid Gemini feed audit'), { status: 502 })
    axes[key] = result[key]
  }
  return { axes, score: Math.round(Object.values(axes).reduce((a, b) => a + b, 0) / 3) }
}

export function selectFeedAuditor(authorId) {
  const candidates = getAllAgents().filter((agent) => agent.id !== authorId)
  if (candidates.length === 0) {
    throw Object.assign(new Error('No independent agent is available to audit this post'), { status: 503 })
  }
  const rotation = store.config.feedRotation || {}
  return [...candidates].sort((a, b) => {
    const aState = rotation[a.id] || { auditCount: 0, lastAuditedAt: 0 }
    const bState = rotation[b.id] || { auditCount: 0, lastAuditedAt: 0 }
    return (aState.auditCount || 0) - (bState.auditCount || 0) || (aState.lastAuditedAt || 0) - (bState.lastAuditedAt || 0)
  })[0]
}

export function recordFeedAudit(auditorId) {
  store.config.feedRotation = store.config.feedRotation || {}
  const state = store.config.feedRotation[auditorId] || { selected: 0, lastSelectedAt: 0 }
  store.config.feedRotation[auditorId] = {
    ...state,
    auditCount: (state.auditCount || 0) + 1,
    lastAuditedAt: Date.now(),
  }
}
// ---------------------------------------------------------------------------
// Batch cycle: pick N eligible agents, each generates a post or a reaction.
// User-owned agents' posts land in 'pending' (owner approval gate, PRD §4.4);
// flagship posts and all reactions go live immediately.
// ---------------------------------------------------------------------------
let cycleRunning = false
export function runFeedCycle(options) { return withRuntimeContext(() => runFeedCycleInternal(options)) }
async function runFeedCycleInternal({ count = 3, spacingMs = 1500 } = {}) {
  if (cycleRunning) throw Object.assign(new Error('Feed cycle already running'), { status: 409 })
  cycleRunning = true
  try {
  requireRuntime()
  const agents = getAllAgents()
  const eligible = agents.filter(
    (a) => !store.feedPosts.some((p) => p.agentId === a.id && p.status === 'pending')
  )
  const limit = Math.max(1, Math.min(count, eligible.length))
  const rotation = store.config.feedRotation || {}
  const ordered = [...eligible].sort((a, b) => {
    const aState = rotation[a.id] || { selected: 0, lastSelectedAt: 0 }
    const bState = rotation[b.id] || { selected: 0, lastSelectedAt: 0 }
    return aState.selected - bState.selected || aState.lastSelectedAt - bState.lastSelectedAt
  })
  const picked = selectFairBatch(ordered, limit)
  const results = []

  for (const agent of picked) {
    const selectedAt = Date.now()
    rotation[agent.id] = {
      selected: (rotation[agent.id]?.selected || 0) + 1,
      lastSelectedAt: selectedAt,
    }
    try {
      const recentLive = store.feedPosts.filter((p) => p.status === 'live' && p.agentId !== agent.id)
      const doPost = recentLive.length === 0 || Math.random() < 0.6

      if (doPost) {
        const focus = store.config.feedFocus?.[agent.id] || null
        const content = await generatePost(agent, focus)
        const auditor = selectFeedAuditor(agent.id)
        const audit = await auditContent(auditor, content)
        recordFeedAudit(auditor.id)
        const post = {
          id: nextId('fp'),
          ...runtimeProvenance(),
          agentId: agent.id,
          content,
          status: agent.ownerId ? 'pending' : 'live',
          auditScore: audit.score,
          audit: audit.axes,
          auditorId: auditor.id,
          ts: Date.now(),
        }
        store.feedPosts.push(post)
        results.push({ kind: 'post', id: post.id, agentId: agent.id, status: post.status, auditScore: post.auditScore })
      } else {
        const target = recentLive[Math.floor(Math.random() * recentLive.length)]
        const reaction = await generateReaction(agent, target)
        const auditor = selectFeedAuditor(agent.id)
        const audit = await auditContent(auditor, `${agent.name} reacted "${reaction}" to: ${target.content.slice(0, 80)}`)
        recordFeedAudit(auditor.id)
        store.feedReactions.push({
          id: nextId('fr'),
          ...runtimeProvenance(),
          postId: target.id,
          agentId: agent.id,
          reaction,
          auditScore: audit.score,
          ts: Date.now(),
        })
        results.push({ kind: 'reaction', id: target.id, agentId: agent.id, reaction, auditScore: audit.score })
      }
    } catch (error) {
      results.push({ kind: 'error', agentId: agent.id, error: error.message })
    }
    saveStore()
    await new Promise((r) => setTimeout(r, spacingMs))
  }

  store.feed.lastCycleAt = Date.now()
  store.feed.lastCycleCount = results.length
  store.feed.nextCycleAt = store.feed.lastCycleAt + store.feed.intervalMs
  return results
  } finally { cycleRunning = false }
}

function selectFairBatch(ordered, count) {
  if (ordered.length <= count) return ordered
  const boundary = ordered[count - 1]
  const boundaryState = store.config.feedRotation?.[boundary.id] || { selected: 0, lastSelectedAt: 0 }
  const rank = (agent) => {
    const state = store.config.feedRotation?.[agent.id] || { selected: 0, lastSelectedAt: 0 }
    return [state.selected, state.lastSelectedAt]
  }
  const beforeBoundary = ordered.filter((agent) => {
    const [selected, lastSelectedAt] = rank(agent)
    return selected < boundaryState.selected ||
      (selected === boundaryState.selected && lastSelectedAt < boundaryState.lastSelectedAt)
  })
  const tied = ordered.filter((agent) => {
    const [selected, lastSelectedAt] = rank(agent)
    return selected === boundaryState.selected && lastSelectedAt === boundaryState.lastSelectedAt
  })
  const needed = Math.max(0, count - beforeBoundary.length)
  return [...beforeBoundary, ...shuffle(tied).slice(0, needed)]
}

function shuffle(arr) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ---------------------------------------------------------------------------
// Scheduler — interval worker. FEED_CYCLE_MS (default 5 min), FEED_CYCLE_COUNT
// (default 3), FEED_CYCLE_ENABLED=false to disable.
// ---------------------------------------------------------------------------
let timer = null
export function stopFeedScheduler() { clearInterval(timer); timer = null; store.feed.enabled = false; store.feed.nextCycleAt = null }
export function startFeedScheduler(onCycle) {
  if (timer) return
  const enabled = MODE !== 'unconfigured' && process.env.FEED_CYCLE_ENABLED === 'true'
  const intervalMs = Math.max(60000, Number(process.env.FEED_CYCLE_MS) || 5 * 60 * 1000)
  const count = Math.max(1, Math.min(6, Number(process.env.FEED_CYCLE_COUNT) || 3))
  store.feed.enabled = enabled
  store.feed.intervalMs = intervalMs
  store.feed.nextCycleAt = Date.now() + intervalMs
  if (!enabled) { store.feed.nextCycleAt = null; return }

  const run = async () => {
    try {
      const results = await runFeedCycle({ count })
      console.log(
        `[feed] cycle: ${results.length} items ` +
          `(${results.filter((r) => r.kind === 'post').length} posts, ` +
          `${results.filter((r) => r.kind === 'reaction').length} reactions)`
      )
      onCycle?.(results)
    } catch (e) {
      console.error('[feed] cycle failed:', e.message)
    }
  }
  timer = setInterval(run, intervalMs)
  timer.unref?.()
  console.log(`[feed] scheduler on — every ${Math.round(intervalMs / 60000)}m, ${count} agents/cycle`)
}

// Initial population: one real post per flagship agent so the feed is alive
// before any user joins (PRD §4.4 — "already populated, nothing to wait for").
export async function seedFeedIfEmpty() {
  const live = store.feedPosts.filter((p) => p.status === 'live')
  if (live.length > 0) return { seeded: false, reason: 'feed already populated' }
  const flagships = getAllAgents().filter((a) => !a.ownerId)
  const results = await runFeedCycle({ count: flagships.length, spacingMs: 2000 })
  return { seeded: true, count: results.length }
}

export function feedStatus() {
  return {
    enabled: store.feed.enabled,
    intervalMs: store.feed.intervalMs,
    lastCycleAt: store.feed.lastCycleAt,
    lastCycleCount: store.feed.lastCycleCount,
    nextCycleAt: store.feed.nextCycleAt,
    livePosts: store.feedPosts.filter((p) => p.status === 'live').length,
    pendingPosts: store.feedPosts.filter((p) => p.status === 'pending').length,
    reactions: store.feedReactions.length,
    mode: MODE,
  }
}
