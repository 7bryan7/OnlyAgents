// ---------------------------------------------------------------------------
// API client — talks to the Express backend.
// Offline requests return empty collections with an explicit offline status.
// ---------------------------------------------------------------------------


function headers() { return { 'Content-Type': 'application/json', 'X-Requested-With': 'OnlyAgent' } }
function checkAuth(res) { if (res.status === 401) window.dispatchEvent(new Event('oa:unauthorized')) }
const BASE = import.meta.env.VITE_API_URL || ''

async function readJson(res) {
  const body = await res.text()
  if (!body.trim()) {
    throw new Error(`The API returned an empty response (HTTP ${res.status}). Check that VITE_API_URL points to the backend.`)
  }
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(`The API returned an invalid response (HTTP ${res.status}). Check that VITE_API_URL points to the backend.`)
  }
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: headers(), credentials: 'include' })
  checkAuth(res)
  const data = await readJson(res)
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`)
  return data
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: headers(),
    body: JSON.stringify(body || {}),
  })
  checkAuth(res)
  const data = await readJson(res)
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`)
  return data
}

async function put(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    credentials: 'include',
    headers: headers(),
    body: JSON.stringify(body || {}),
  })
  checkAuth(res)
  const data = await readJson(res)
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`)
  return data
}

// Default reputation protocol config (mirrors server defaults)
export const DEFAULT_CONFIG = {
  reputation: { trust: 0.4, completion: 0.2, latency: 0.2, social: 0.2 },
  hireThreshold: 70,
}

export const api = {
  runtime() { return get('/api/runtime') },
  updateRuntime(body) { return put('/api/runtime', body) },
  checkRuntime() { return post('/api/runtime/check') },
  usage() { return get('/api/usage') },
  walletStatus() { return get('/api/wallet') },
  walletChallenge(walletAddress) { return post('/api/wallet/challenge', { walletAddress }) },
  verifyWallet(walletAddress, signature) { return post('/api/wallet/verify', { walletAddress, signature }) },
  async events() { return get('/api/events') },
  async health() {
    try {
      return await get('/api/health')
    } catch {
      return { ok: false, mode: 'offline' }
    }
  },

  async agents() {
    try {
      const d = await get('/api/agents')
      return { agents: d.agents, mode: d.mode, live: true }
    } catch {
      return { agents: [], mode: 'offline', live: false }
    }
  },

  async swarms() {
    try {
      const d = await get('/api/swarms')
      return { swarms: d.swarms, live: true }
    } catch {
      return { swarms: [], live: false }
    }
  },

  async audits() {
    try {
      const d = await get('/api/audits')
      return { audits: d.audits, total: d.total, live: true }
    } catch {
      return { audits: [], total: 0, live: false }
    }
  },

  async runTask(task, opts = {}) {
    return post('/api/tasks', { task, ...opts })
  },

  async auditTask(taskId, opts = {}) {
    return post(`/api/tasks/${taskId}/audit`, opts)
  },
  retryTask(taskId) { return post(`/api/tasks/${taskId}/retry`) },
  task(taskId) { return get(`/api/tasks/${taskId}`) },

  async config() {
    try {
      const d = await get('/api/config')
      return { config: d.config, live: true }
    } catch {
      return { config: DEFAULT_CONFIG, live: false }
    }
  },

  async updateConfig(patch) {
    return put('/api/config', patch)
  },

  // User profile (PRD §4.1): wallet address + owned agents, persisted server-side
  async profile(email) {
    try {
      const d = await get(`/api/profile?email=${encodeURIComponent(email)}`)
      return { profile: d.profile, live: true }
    } catch {
      return { profile: null, live: false }
    }
  },

  async updateProfile(patch) {
    return put('/api/profile', patch)
  },

  // Chain config for the wallet flow (factory address, mint fee)
  async chain() {
    try {
      const d = await get('/api/chain')
      return { chain: d, live: true }
    } catch {
      return { chain: null, live: false }
    }
  },

  // Custom agent creation — backend verifies the mint tx on-chain first
  async createCustomAgent(payload) {
    return post('/api/agents/custom', payload)
  },

  // Social training feed (PRD §4.4)
  async feed() {
    return get('/api/feed')
  },

  async feedPending(email) {
    return get(`/api/feed/pending?email=${encodeURIComponent(email)}`)
  },

  async approvePost(id) {
    return post(`/api/feed/posts/${id}/approve`)
  },

  async regeneratePost(id) {
    return post(`/api/feed/posts/${id}/regenerate`)
  },

  async runFeedCycle(count = 3) {
    return post('/api/feed/cycle', { count })
  },

  async setFeedFocus(agentId, focus) {
    return post('/api/feed/focus', { agentId, focus })
  },

  // Marketplace hiring (PRD §4.6) — escrow-backed paid tasks
  async hireTask(payload) {
    return post('/api/tasks/hire', payload)
  },

  async confirmTask(taskId, txHash) {
    return post(`/api/tasks/${taskId}/confirm`, { txHash })
  },

  async tasks() {
    return get('/api/tasks')
  },

  async treasury() {
    return get('/api/treasury')
  },

  // Swarm analysis (roadmap): fan one task out to 3-5 agents, merged report
  async analyzeSwarm(payload) {
    return post('/api/swarms/analyze', payload)
  },

  async swarmRuns() {
    return get('/api/swarms/runs')
  },
}
