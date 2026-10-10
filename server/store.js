// ---------------------------------------------------------------------------
// In-memory store: executions, audits, tasks, users.
// NO synthetic seed — every record is produced by a real runtime call
// (Gemini only). Metrics are always
// computed from these real records.
//
// Persistence: SQLite via db.js (PRD v2 §6.4). The in-memory arrays are the
// runtime working set; saveStore() writes the durable copy, loadStore() reads
// it back (with one-time migration from the legacy store.json).
// ---------------------------------------------------------------------------

import { AGENTS } from './agents.js'
import { runAgent, auditOutput } from './runtime.js'
import { dbSaveAll, dbLoadAll, archiveUnverifiedActivity, dbMaxSeq, dbCounts } from './db.js'

export const store = {
  executions: [], // { id, agentId, task, output, success, latencyMs, ts }
  audits: [], // { id, agentId, auditorId, task, output, verdict, note, ts }
  tasks: [], // { id, task, agentId, status, ts }
  users: [], // { id, name, email, picture, walletAddress, created_at }
  agents: [], // custom agents minted on-chain (PRD §4.3); flagship roster lives in agents.js
  feedPosts: [], // { id, agentId, content, status: pending|live, auditScore, audit, ts } (PRD §4.4)
  feedReactions: [], // { id, postId, agentId, reaction, auditScore, ts }
  swarmRuns: [], // { id, task, agentIds, status, startedAt, finishedAt, results, merged, synthesis, error }
  seq: 0,
  warmup: { running: false, done: 0, total: 0, startedAt: null, finishedAt: null },
  feed: { enabled: true, intervalMs: 300000, lastCycleAt: null, lastCycleCount: 0, nextCycleAt: null },
  // Reputation protocol config — weights must sum to 1.0; hireThreshold gates
  // marketplace eligibility (composite reputationScore >= threshold).
  config: {
    reputation: { trust: 0.4, completion: 0.2, latency: 0.2, social: 0.2 },
    hireThreshold: 70,
    fleetLimit: 5,
    explorationRate: 0.25,
    routingCount: 0,
    auditorCredits: {},
    customerOutcomes: [],
    disputes: [],
    feedRotation: {},
    feedFocus: {}, // agentId → focus prompt for the next feed cycle (PRD §4.4)
  },
}

// Merged roster: flagship (code-defined) + custom (on-chain minted).
export function getAllAgents() {
  return [...AGENTS, ...store.agents]
}

export function getAgent(id) {
  return AGENTS.find((a) => a.id === id) || store.agents.find((a) => a.id === id) || null
}

// ---------------------------------------------------------------------------
// Persistence — real records survive restarts (SQLite, git-ignored).
// ---------------------------------------------------------------------------
export function loadStore() {
  try {
    archiveUnverifiedActivity()
    const data = dbLoadAll()
    store.executions = data.executions
    store.audits = data.audits
    store.tasks = data.tasks.map((t) => (t.status === 'running' || (t.status === 'escrowed' && !t.executionId)) ? { ...t, status: 'failed' } : t)
    store.users = data.users
    store.agents = data.agents
    store.feedPosts = data.feedPosts || []
    store.feedReactions = data.feedReactions || []
    store.swarmRuns = (data.swarmRuns || []).map((r) => r.status === 'running' ? { ...r, status: 'failed', finishedAt: Date.now(), error: 'Server stopped before this analysis finished. Submit a new analysis.' } : r)
    if (data.config && Object.keys(data.config).length) {
      store.config = {
        reputation: { ...store.config.reputation, ...data.config.reputation },
        hireThreshold:
          typeof data.config.hireThreshold === 'number' ? data.config.hireThreshold : store.config.hireThreshold,
        fleetLimit: Number(data.config.fleetLimit) || store.config.fleetLimit,
        explorationRate: Number(data.config.explorationRate) || store.config.explorationRate,
        routingCount: Number(data.config.routingCount) || 0,
        auditorCredits: data.config.auditorCredits || {},
        customerOutcomes: data.config.customerOutcomes || [],
        disputes: data.config.disputes || [],
        feedRotation: data.config.feedRotation || {},
        feedFocus: data.config.feedFocus || {},
      }
    }
    const counts = dbCounts()
    store.seq = Math.max(dbMaxSeq(), counts.executions + counts.audits + counts.tasks + counts.users)
    return store.executions.length > 0 || store.audits.length > 0
  } catch (e) {
    throw new Error('Cannot load persisted data: ' + e.message)
  }
}

export function saveStore() {
  dbSaveAll(store)
}

export function nextId(prefix) {
  store.seq += 1
  return `${prefix}-${String(store.seq).padStart(4, '0')}`
}

// Realistic task pool per lifecycle stage — used by the warm-up so each
// agent executes work that matches its role.
const STAGE_TASKS = {
  discovery: [
    'Interview 5 target users and summarize pain points for the onboarding flow',
    'Analyze competitor pricing pages and list differentiation opportunities',
    'Synthesize customer support transcripts into a top-10 issue report',
  ],
  design: [
    'Propose a simplified empty-state design for the settings page',
    'Draft a UX flow for the new team-invite experience',
    'Review the checkout redesign against accessibility guidelines',
  ],
  development: [
    'Implement a debounced search input with optimistic UI updates',
    'Refactor the API client to support request cancellation',
    'Add feature-flag support to the build pipeline',
  ],
  qa: [
    'Write a test plan covering the payments retry path',
    'Draft edge-case test cases for the file uploader',
    'Review the release candidate for regression risks',
  ],
  security: [
    'Audit the file upload endpoint for path traversal risks',
    'Review the auth token refresh flow for replay vulnerabilities',
    'Check the new dependency tree for known CVEs',
  ],
  deployment: [
    'Draft a zero-downtime rollout plan for the API service',
    'Write a rollback runbook for the payments service',
    'Plan the staging-to-production promotion checklist',
  ],
  operations: [
    'Triage the top 5 alerts from the last 24 hours',
    'Summarize the weekly error budget report',
    'Draft a post-incident review for the checkout outage',
  ],
}

function pickTask(agent) {
  const pool = STAGE_TASKS[agent.stage.id] || STAGE_TASKS.development
  return pool[Math.floor(Math.random() * pool.length)]
}

// ---------------------------------------------------------------------------
// Real-data warm-up: runs genuine tasks (and peer audits) through the live
// runtime so the dashboard is populated with real execution records.
// Runs in the background; safe to call at startup.
// ---------------------------------------------------------------------------
export async function warmup({ tasksPerAgent = 1, audits = true, concurrency = 2, spacingMs = 1200, onProgress } = {}) {
  if (store.warmup.running) return
  store.warmup.running = true
  store.warmup.startedAt = Date.now()

  const jobs = []
  AGENTS.forEach((agent) => {
    for (let i = 0; i < tasksPerAgent; i++) {
      jobs.push({ kind: 'task', agent })
    }
  })
  if (audits) {
    // Audit roughly half the agents (their most recent warm-up execution)
    AGENTS.filter((_, i) => i % 2 === 0).forEach((agent) => {
      jobs.push({ kind: 'audit', agent })
    })
  }
  store.warmup.total = jobs.length

  let cursor = 0
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor]
      cursor += 1
      try {
        if (job.kind === 'task') {
          const task = pickTask(job.agent)
          const result = await runAgent(job.agent, task)
          store.executions.push({
            id: nextId('ex'),
            agentId: job.agent.id,
            task,
            output: result.output,
            success: result.success,
            latencyMs: result.latencyMs,
            ts: Date.now(),
            source: result.source, model: result.model,
          })
          saveStore()
        } else {
          // Audit the agent's most recent execution
          const ex = [...store.executions].reverse().find((e) => e.agentId === job.agent.id)
          if (ex?.success) {
            const auditor =
              AGENTS.find((a) => a.id !== job.agent.id && a.stage.id === job.agent.stage.id) ||
              AGENTS.find((a) => a.id !== job.agent.id)
            const result = await auditOutput(auditor, job.agent, ex.task, ex.output)
            store.audits.push({
              id: nextId('au'),
              agentId: job.agent.id,
              auditorId: auditor.id,
              task: ex.task,
              output: ex.output,
              verdict: result.verdict,
              note: result.note,
              ts: Date.now(),
              source: result.source, model: result.model,
            })
            saveStore()
          }
        }
      } catch (e) {
        console.error('[warmup] job failed:', e.message)
      }
      store.warmup.done += 1
      onProgress?.()
      if (store.warmup.done % 5 === 0 || store.warmup.done === store.warmup.total) {
        console.log(`[warmup] ${store.warmup.done}/${store.warmup.total} real records`)
      }
      // Space calls out to stay under the API rate limit
      await new Promise((r) => setTimeout(r, spacingMs))
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, worker)
  await Promise.all(workers)
  store.warmup.running = false
  store.warmup.finishedAt = Date.now()
  console.log(
    `[warmup] done — ${store.executions.length} executions, ${store.audits.length} audits ` +
      `in ${((store.warmup.finishedAt - store.warmup.startedAt) / 1000).toFixed(1)}s`
  )
}
