import { app } from './index.js'
import { withHostedState } from './hosted-persistence.js'

export default async function handler(req, res) {
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
  const end = res.end.bind(res)
  let responseArgs, onError
  try {
    await withHostedState({ write }, () => new Promise((resolve, reject) => {
      // Hold the response until withHostedState finishes its checkpoints AND
      // releases the write lease. Vercel can freeze work after the response ends.
      let ending = false
      res.end = (...args) => {
        if (ending) return res
        ending = true
        responseArgs = args
        resolve()
        return res
      }
      onError = reject
      res.once('error', onError)
      app(req, res)
    }))
    end(...responseArgs)
  } catch (error) {
    if (res.headersSent) { res.destroy(error); return }
    res.removeHeader('Set-Cookie')
    res.removeHeader('Content-Length')
    res.statusCode = error.status || 503
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    if (res.statusCode === 503) res.setHeader('Retry-After', '5')
    end(JSON.stringify({ error: error.status ? error.message : 'The API could not load persistent data. Check the Supabase setup.' }))
  } finally {
    if (onError) res.removeListener('error', onError)
  }
}
