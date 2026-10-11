import { readFileSync, writeFileSync } from 'node:fs'

// Run after Render assigns its public URL, then commit the updated vercel.json.
const input = process.argv[2]
let backend
try { backend = new URL(input) } catch { throw new Error('Usage: npm run configure:vercel -- https://YOUR-SERVICE.onrender.com') }
if (backend.protocol !== 'https:' || backend.username || backend.password || backend.port || backend.search || backend.hash || backend.pathname !== '/' || !backend.hostname.endsWith('.onrender.com')) {
  throw new Error('Provide only the Render HTTPS origin, without credentials, a port, query, or path.')
}
const path = new URL('../vercel.json', import.meta.url)
const config = JSON.parse(readFileSync(path, 'utf8'))
config.rewrites = [
  { source: '/api/:path*', destination: `${backend.origin}/api/:path*` },
  ...config.rewrites.filter(route => route.source !== '/api/:path*'),
]
writeFileSync(path, JSON.stringify(config, null, 2) + '\n')
console.log(`Configured same-origin /api proxy to ${backend.origin}. Commit vercel.json and push before deploying Vercel.`)
