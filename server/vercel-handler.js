import { app } from './index.js'
import { withHostedState } from './hosted-persistence.js'
import { flushPersistence } from './persistence-context.js'

export default async function handler(req, res) {
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
  const end = res.end.bind(res)
  try {
    await withHostedState({ write }, () => new Promise((resolve, reject) => {
      // Never acknowledge a session or payment record before durable persistence.
      let ending = false
      res.end = (...args) => {
        if (ending) return res
        ending = true
        flushPersistence().then(() => { end(...args); resolve() }, reject)
        return res
      }
      res.once('error', reject)
      app(req, res)
    }))
  } catch (error) {
    if (res.headersSent) { res.destroy(error); return }
    res.removeHeader('Set-Cookie')
    res.removeHeader('Content-Length')
    res.statusCode = error.status || 503
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    if (res.statusCode === 503) res.setHeader('Retry-After', '5')
    end(JSON.stringify({ error: error.status ? error.message : 'The API could not load persistent data. Check the Supabase setup.' }))
  }
}
