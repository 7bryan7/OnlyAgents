import './env.js'
import { createHash, randomBytes } from 'node:crypto'
import { getAddress, verifyMessage } from 'viem'
import { db } from './db.js'

const SESSION_MS = 7 * 86400000
export const PLATFORM_OWNER = '0x2e0113c8806c8bFFd9cAA0861a9D1ffFE66E48A8'.toLowerCase()
db.exec(`CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, identity TEXT NOT NULL, expiresAt INTEGER NOT NULL)`)
db.exec(`CREATE TABLE IF NOT EXISTS auth_challenges (wallet TEXT PRIMARY KEY, message TEXT NOT NULL, expiresAt INTEGER NOT NULL)`)

const hash = (value) => createHash('sha256').update(value).digest('hex')
function sessionToken(req) { return req.headers.cookie?.split(';').map((p) => p.trim()).find((p) => p.startsWith('oa_session='))?.slice(11) }
function addressOf(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw Object.assign(new Error('Invalid wallet address.'), { status: 400 })
  try { return getAddress(value).toLowerCase() } catch { throw Object.assign(new Error('Invalid wallet address.'), { status: 400 }) }
}
function walletName(wallet) { return `Wallet ${wallet.slice(0, 6)}…${wallet.slice(-4)}` }

export function withRole(user) {
  const wallet = addressOf(user.walletAddress)
  return { id: wallet, walletAddress: wallet, name: user.name || walletName(wallet), picture: '', role: wallet === PLATFORM_OWNER ? 'admin' : 'user' }
}

export function walletLoginChallenge(req, res) {
  try {
    const wallet = addressOf(req.body?.walletAddress)
    const expiresAt = Date.now() + 5 * 60000
    const message = `OnlyAgents wallet sign-in\nOrigin: ${process.env.APP_ORIGIN || 'http://localhost:3000'}\nWallet: ${wallet}\nNonce: ${randomBytes(24).toString('hex')}\nExpires: ${new Date(expiresAt).toISOString()}\nSign this message to start your OnlyAgents session. It does not authorize a payment.`
    db.prepare('INSERT INTO auth_challenges VALUES (?, ?, ?) ON CONFLICT(wallet) DO UPDATE SET message=excluded.message, expiresAt=excluded.expiresAt').run(wallet, message, expiresAt)
    res.json({ message, expiresAt })
  } catch (e) { res.status(e.status || 400).json({ error: e.message }) }
}

async function verifyWalletLogin(walletValue, signature) {
  const wallet = addressOf(walletValue)
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw Object.assign(new Error('Invalid wallet signature.'), { status: 400 })
  const challenge = db.prepare('SELECT * FROM auth_challenges WHERE wallet = ? AND expiresAt > ?').get(wallet, Date.now())
  if (!challenge) throw Object.assign(new Error('Wallet sign-in challenge expired or missing. Try again.'), { status: 400 })
  let valid = false
  try { valid = await verifyMessage({ address: wallet, message: challenge.message, signature }) } catch { valid = false }
  if (!valid) throw Object.assign(new Error('Signature does not prove ownership of this wallet.'), { status: 403 })
  db.prepare('DELETE FROM auth_challenges WHERE wallet = ?').run(wallet)
  return withRole({ walletAddress: wallet })
}

export async function resolveIdentity(req) {
  const token = sessionToken(req)
  if (token) {
    const session = db.prepare('SELECT * FROM sessions WHERE hash = ? AND expiresAt > ?').get(hash(token), Date.now())
    if (session) {
      const identity = JSON.parse(session.identity)
      // Older email sessions must reauthenticate with a wallet signature.
      if (identity.walletAddress && identity.id?.toLowerCase() === identity.walletAddress.toLowerCase()) return withRole(identity)
    }
  }
  throw Object.assign(new Error('Wallet sign-in required.'), { status: 401 })
}

export function protectMutation(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.origin
    if (origin && origin !== (process.env.APP_ORIGIN || 'http://localhost:3000')) return res.status(403).json({ error: 'Request origin is not allowed.' })
    if (sessionToken(req) && req.headers['x-requested-with'] !== 'OnlyAgent') return res.status(403).json({ error: 'Missing request verification header.' })
  }
  next()
}
export async function authenticate(req, res, next) {
  try { req.user = await resolveIdentity(req); next() } catch (e) { res.status(e.status || 401).json({ error: e.message }) }
}
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' })
  next()
}
export async function createSession(req, res) {
  const user = await verifyWalletLogin(req.body?.walletAddress, req.body?.signature)
  const prior = sessionToken(req)
  if (prior) db.prepare('DELETE FROM sessions WHERE hash = ?').run(hash(prior))
  db.prepare('DELETE FROM sessions WHERE expiresAt <= ?').run(Date.now())
  const token = randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hash(token), JSON.stringify(user), Date.now() + SESSION_MS)
  res.cookie('oa_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_MS })
  return user
}
export function logout(req, res) {
  const token = sessionToken(req)
  if (token) db.prepare('DELETE FROM sessions WHERE hash = ?').run(hash(token))
  res.clearCookie('oa_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' })
  res.json({ ok: true })
}
