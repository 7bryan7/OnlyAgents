import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
const proxy = config.rewrites.find(route => route.source === '/api/:path*')
if (!proxy || !/^https:\/\/[^/]+\.onrender\.com\/api\/:path\*$/.test(proxy.destination)) {
  throw new Error('Render API is not configured. Run npm run configure:vercel -- https://YOUR-SERVICE.onrender.com, then commit vercel.json and push.')
}
// Avoid a cross-site cookie connection or unsupported WebSocket proxy.
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_API_URL: '', VITE_LIVE_UPDATES: 'poll' },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
