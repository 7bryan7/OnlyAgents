import { createHash } from 'node:crypto'
import { db } from './db.js'
db.exec(`CREATE TABLE IF NOT EXISTS request_keys (ownerId TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL, response TEXT, status INTEGER, createdAt INTEGER NOT NULL, PRIMARY KEY(ownerId, key))`)
const pending = new Map()
export async function idempotency(req, res, next) {
  const key = req.headers['idempotency-key']
  if (!key || req.method !== 'POST' || !['/tasks', '/tasks/hire'].includes(req.path)) return next()
  if (typeof key !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(key)) return res.status(400).json({ error: 'Invalid Idempotency-Key.' })
  const ownerId = req.user.email
  const fingerprint = createHash('sha256').update(req.path + JSON.stringify(req.body)).digest('hex')
  const id = ownerId + ':' + key
  let prior = db.prepare('SELECT * FROM request_keys WHERE ownerId = ? AND key = ?').get(ownerId, key)
  if (prior) {
    if (prior.fingerprint !== fingerprint) return res.status(409).json({ error: 'Idempotency-Key was used for a different request.' })
    if (!prior.response && pending.has(id)) {
      await pending.get(id).promise
      prior = db.prepare('SELECT * FROM request_keys WHERE ownerId = ? AND key = ?').get(ownerId, key)
    }
    if (prior?.response) return res.status(prior.status).json(JSON.parse(prior.response))
    return res.status(409).json({ error: 'The earlier request was interrupted. Check your task ledger before submitting again.' })
  }
  db.prepare('INSERT INTO request_keys (ownerId, key, fingerprint, createdAt) VALUES (?, ?, ?, ?)').run(ownerId, key, fingerprint, Date.now())
  let resolve
  const promise = new Promise((done) => { resolve = done })
  pending.set(id, { promise, resolve })
  const send = res.json.bind(res)
  res.json = (body) => {
    db.prepare('UPDATE request_keys SET response = ?, status = ? WHERE ownerId = ? AND key = ?').run(JSON.stringify(body), res.statusCode, ownerId, key)
    resolve(); pending.delete(id)
    return send(body)
  }
  next()
}
