import { randomBytes } from 'node:crypto'
import { getAddress, verifyMessage } from 'viem'
import { db } from './db.js'

db.exec(`CREATE TABLE IF NOT EXISTS wallet_challenges (ownerId TEXT PRIMARY KEY, wallet TEXT NOT NULL, message TEXT NOT NULL, expiresAt INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS wallet_links (wallet TEXT PRIMARY KEY, ownerId TEXT NOT NULL, verifiedAt INTEGER NOT NULL)`)
function addressOf(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw Object.assign(new Error('Invalid wallet address.'), { status: 400 })
  try { return getAddress(value).toLowerCase() } catch { throw Object.assign(new Error('Invalid wallet address.'), { status: 400 }) }
}
export function walletStatus(req, res) {
  const wallets = db.prepare('SELECT wallet, verifiedAt FROM wallet_links WHERE ownerId = ?').all(req.user.email)
  res.json({ wallets })
}
export function walletChallenge(req, res) {
  const wallet = addressOf(req.body?.walletAddress)
  const expiresAt = Date.now() + 5 * 60000
  const message = `OnlyAgent wallet ownership verification\nOrigin: ${process.env.APP_ORIGIN || 'http://localhost:3000'}\nAccount: ${req.user.email}\nWallet: ${wallet}\nNonce: ${randomBytes(24).toString('hex')}\nExpires: ${new Date(expiresAt).toISOString()}\nThis signature links your wallet to your signed-in account. It does not authorize a payment.`
  db.prepare('INSERT INTO wallet_challenges VALUES (?, ?, ?, ?) ON CONFLICT(ownerId) DO UPDATE SET wallet=excluded.wallet, message=excluded.message, expiresAt=excluded.expiresAt').run(req.user.email, wallet, message, expiresAt)
  res.json({ message, expiresAt })
}
export async function verifyWallet(req, res) {
  const wallet = addressOf(req.body?.walletAddress)
  const signature = req.body?.signature
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return res.status(400).json({ error: 'Invalid wallet signature.' })
  const challenge = db.prepare('SELECT * FROM wallet_challenges WHERE ownerId = ? AND wallet = ? AND expiresAt > ?').get(req.user.email, wallet, Date.now())
  if (!challenge) return res.status(400).json({ error: 'Wallet challenge expired or missing. Request a new signature.' })
  let valid = false
  try { valid = await verifyMessage({ address: wallet, message: challenge.message, signature }) } catch { /* invalid signature */ }
  if (!valid) return res.status(403).json({ error: 'Signature does not prove ownership of this wallet.' })
  db.transaction(() => {
    const current = db.prepare('SELECT message FROM wallet_challenges WHERE ownerId = ?').get(req.user.email)
    if (current?.message !== challenge.message) throw Object.assign(new Error('Wallet challenge was already used or replaced.'), { status: 409 })
    const linked = db.prepare('SELECT ownerId FROM wallet_links WHERE wallet = ?').get(wallet)
    if (linked && linked.ownerId !== req.user.email) throw Object.assign(new Error('Wallet is linked to another account.'), { status: 409 })
    db.prepare('INSERT INTO wallet_links VALUES (?, ?, ?) ON CONFLICT(wallet) DO UPDATE SET verifiedAt = excluded.verifiedAt').run(wallet, req.user.email, Date.now())
    db.prepare('DELETE FROM wallet_challenges WHERE ownerId = ?').run(req.user.email)
  })()
  res.json({ wallet, verified: true })
}
export function requireOwnedWallet(req, res, next) {
  const wallet = addressOf(req.body?.walletAddress)
  if (!db.prepare('SELECT 1 FROM wallet_links WHERE wallet = ? AND ownerId = ?').get(wallet, req.user.email)) return res.status(403).json({ error: 'Verify wallet ownership before submitting a chain transaction.' })
  next()
}
