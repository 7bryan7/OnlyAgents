import { getAddress } from 'viem'

function wallet(value) {
  try { return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) ? getAddress(value).toLowerCase() : null } catch { return null }
}

// One-time conversion of email accounts. Run before preparing persistence queries.
export function migrateWalletIdentity(db) {
  const columns = db.prepare('PRAGMA table_info(users)').all()
  if (!columns.some(column => column.name === 'email')) return null
  const exists = table => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)
  const users = db.prepare('SELECT * FROM users').all()
  const links = exists('wallet_links') ? db.prepare('SELECT * FROM wallet_links').all() : []
  const identities = new Map()
  for (const user of users) {
    const linked = [...new Set(links.filter(link => link.ownerId === user.id).map(link => wallet(link.wallet)).filter(Boolean))]
    const primary = wallet(user.id) || wallet(user.walletAddress) || (linked.length === 1 ? linked[0] : null)
    if (!primary && linked.length > 1) throw new Error('Legacy account has multiple wallets and no recorded primary wallet; choose its history owner before migration.')
    identities.set(user.id, primary)
  }
  // Some old accounts have a link but no saved profile.
  for (const ownerId of new Set(links.map(link => link.ownerId))) {
    if (identities.has(ownerId)) continue
    const linked = [...new Set(links.filter(link => link.ownerId === ownerId).map(link => wallet(link.wallet)).filter(Boolean))]
    if (linked.length > 1 && !wallet(ownerId)) throw new Error('Legacy account has multiple wallets and no recorded primary wallet; choose its history owner before migration.')
    identities.set(ownerId, wallet(ownerId) || linked[0] || null)
  }
  const owner = (id, recordedWallet) => wallet(recordedWallet) || wallet(id) || identities.get(id) || null
  const taskOwners = new Map()
  const removedTasks = new Set()
  const recordedOwners = new Set()
  let removedTaskCount = 0, movedTaskCount = 0, movedAgentCount = 0
  db.transaction(() => {
    for (const agent of db.prepare('SELECT id, ownerId, walletAddress FROM agents WHERE ownerId IS NOT NULL').all()) {
      const id = owner(agent.ownerId, agent.walletAddress)
      if (id) { db.prepare('UPDATE agents SET ownerId=?, walletAddress=? WHERE id=?').run(id, id, agent.id); recordedOwners.add(id); movedAgentCount++ }
      else {
        db.prepare('DELETE FROM feed_reactions WHERE postId IN (SELECT id FROM feed_posts WHERE agentId=?) OR agentId=?').run(agent.id, agent.id)
        db.prepare('DELETE FROM feed_posts WHERE agentId=?').run(agent.id)
        db.prepare('DELETE FROM agents WHERE id=?').run(agent.id)
      }
    }
    const originalTasks = db.prepare('SELECT id, ownerId, consumer, executionId, auditId FROM tasks').all()
    for (const task of originalTasks) {
      const id = owner(task.ownerId, task.consumer)
      if (id) { db.prepare('UPDATE tasks SET ownerId=? WHERE id=?').run(id, task.id); taskOwners.set(task.id, id); movedTaskCount++ }
      else { removedTasks.add(task.id); db.prepare('DELETE FROM tasks WHERE id=?').run(task.id); removedTaskCount++ }
    }
    // Remove execution/audit history referenced only by removed tasks.
    // Unowned fleet activity remains public evidence, rather than an account record.
    for (const task of originalTasks.filter(task => removedTasks.has(task.id))) {
      if (task.executionId && !db.prepare('SELECT 1 FROM tasks WHERE executionId=?').get(task.executionId)) db.prepare('DELETE FROM executions WHERE id=?').run(task.executionId)
      if (task.auditId && !db.prepare('SELECT 1 FROM tasks WHERE auditId=?').get(task.auditId)) db.prepare('DELETE FROM audits WHERE id=?').run(task.auditId)
    }
    for (const run of db.prepare('SELECT id,ownerId FROM swarm_runs').all()) {
      const id = owner(run.ownerId)
      if (id) db.prepare('UPDATE swarm_runs SET ownerId=? WHERE id=?').run(id, run.id)
      else db.prepare('DELETE FROM swarm_runs WHERE id=?').run(run.id)
    }
    const clean = value => {
      if (Array.isArray(value)) return value.map(clean).filter(item => item !== undefined)
      if (!value || typeof value !== 'object') return value
      if (value.taskId && removedTasks.has(value.taskId)) return undefined
      const result = { ...value }
      delete result.email
      if (result.ownerId) {
        result.ownerId = taskOwners.get(result.taskId) || owner(result.ownerId)
        if (!result.ownerId) return undefined
      }
      for (const key of Object.keys(result)) result[key] = clean(result[key])
      return result
    }
    for (const row of db.prepare('SELECT key,value FROM config').all()) {
      const value = JSON.parse(row.value)
      db.prepare('UPDATE config SET value=? WHERE key=?').run(JSON.stringify(clean(value) ?? null), row.key)
    }
    for (const table of ['api_usage', 'request_keys']) {
      if (!exists(table)) continue
      // Cached responses and old quotas must never become another wallet's data.
      for (const row of db.prepare(`SELECT DISTINCT ownerId FROM ${table}`).all()) {
        if (!wallet(row.ownerId)) db.prepare(`DELETE FROM ${table} WHERE ownerId=?`).run(row.ownerId)
      }
    }
    if (exists('sessions')) {
      for (const session of db.prepare('SELECT hash,identity FROM sessions').all()) {
        const identity = JSON.parse(session.identity)
        const id = wallet(identity.walletAddress)
        if (!id || wallet(identity.id || identity.email) !== id) db.prepare('DELETE FROM sessions WHERE hash=?').run(session.hash)
        else db.prepare('UPDATE sessions SET identity=? WHERE hash=?').run(JSON.stringify({ id, walletAddress: id, name: identity.name, picture: '' }), session.hash)
      }
    }
    db.exec('DELETE FROM users; ALTER TABLE users DROP COLUMN email; DROP TABLE IF EXISTS wallet_links; DROP TABLE IF EXISTS wallet_challenges')
    const addresses = new Set([...identities.values(), ...links.map(link => wallet(link.wallet)), ...taskOwners.values(), ...recordedOwners].filter(Boolean))
    const insert = db.prepare('INSERT INTO users (id,name,picture,walletAddress,created_at) VALUES (?,?,?,?,?)')
    for (const id of addresses) insert.run(id, `Wallet ${id.slice(0, 6)}…${id.slice(-4)}`, '', id, Date.now())
  })()
  return { movedTaskCount, movedAgentCount, removedTaskCount }
}
