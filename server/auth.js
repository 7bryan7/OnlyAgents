import './env.js'
import { OAuth2Client } from 'google-auth-library'
import { createHash, randomBytes } from 'node:crypto'
import { db } from './db.js'
const client = new OAuth2Client()
const SESSION_MS = 7 * 86400000
db.exec(`CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, identity TEXT NOT NULL, expiresAt INTEGER NOT NULL)`)
const hash = (value) => createHash('sha256').update(value).digest('hex')
function sessionToken(req) { return req.headers.cookie?.split(';').map((p) => p.trim()).find((p) => p.startsWith('oa_session='))?.slice(11) }
export function withRole(user) {
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase())
  return { ...user, role: admins.includes(user.email.toLowerCase()) ? 'admin' : 'user' }
}
async function verifyGoogle(token) {
  const audience = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID
  if (!audience || audience.startsWith('your-')) throw Object.assign(new Error('Configure VITE_GOOGLE_CLIENT_ID in .env and restart.'), { status: 503 })
  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience })
    const user = ticket.getPayload()
    if (!user?.email_verified || !user.email || !user.sub) throw new Error('Unverified identity')
    return withRole({ sub: user.sub, email: user.email, name: user.name || user.email, picture: user.picture || '' })
  } catch { throw Object.assign(new Error('Google session expired or invalid. Sign in again.'), { status: 401 }) }
}
export async function resolveIdentity(req) {
  const token = sessionToken(req)
  if (token) {
    const session = db.prepare('SELECT * FROM sessions WHERE hash = ? AND expiresAt > ?').get(hash(token), Date.now())
    if (session) return withRole(JSON.parse(session.identity))
  }
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
  if (bearer) return verifyGoogle(bearer)
  throw Object.assign(new Error('Google sign-in required.'), { status: 401 })
}
export function protectMutation(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.origin
    if (origin && origin !== (process.env.APP_ORIGIN || 'http://localhost:5173')) return res.status(403).json({ error: 'Request origin is not allowed.' })
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
  if (typeof req.body?.idToken !== 'string' || !req.body.idToken) return res.status(400).json({ error: 'Google ID token is required.' })
  const user = await verifyGoogle(req.body.idToken)
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
