import handler from '../server/vercel-handler.js'
import { restoreApiUrl } from '../server/vercel-routing.js'

export default function api(req, res) {
  restoreApiUrl(req)
  return handler(req, res)
}
