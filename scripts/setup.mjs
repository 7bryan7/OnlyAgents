import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const envPath = fileURLToPath(new URL('../.env', import.meta.url))
if (!existsSync(envPath)) {
  copyFileSync(fileURLToPath(new URL('../.env.example', import.meta.url)), envPath)
  console.log('Created .env. Add your server credentials there.')
}
await import('../server/env.js')
const { runtimeStatus, checkRuntime } = await import('../server/runtime.js')
const { db } = await import('../server/db.js')
let failed = false
function check(ok, message) { console.log(`${ok ? 'OK' : 'NEEDED'}: ${message}`); if (!ok) failed = true }
const runtime = runtimeStatus()
check(runtime.mode !== 'unconfigured', `${runtime.provider} server API key configured`)
for (const provider of runtime.providers) console.log(`${provider.id}: ${provider.configured ? 'key configured' : 'key missing'} (credentials are never printed)`)
const frontend = process.env.VITE_GOOGLE_CLIENT_ID?.trim() || ''
const audience = process.env.GOOGLE_CLIENT_ID?.trim() || frontend
check(/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(frontend), 'Google OAuth Web application client ID')
check(frontend === audience, 'Backend Google audience matches frontend client ID')
check(!!process.env.ADMIN_EMAILS?.trim(), 'ADMIN_EMAILS configured for platform administrators')
const origin = process.env.APP_ORIGIN || 'http://localhost:5173'
try { const url = new URL(origin); check(['http:', 'https:'].includes(url.protocol) && url.origin === origin, 'APP_ORIGIN is an exact HTTP(S) origin') }
catch { check(false, 'APP_ORIGIN must be an HTTP(S) origin') }
console.log('Authorize this JavaScript origin in Google OAuth: ' + origin)
console.log('SQLite requires no database API key. Wallet private keys stay in MetaMask.')
try {
  if (process.argv.includes('--live')) {
    console.log('Checking live generation with a small request; this may use provider quota.')
    const result = await checkRuntime()
    check(result.ok, `${result.source} / ${result.model} generation access`)
    if (result.error) console.log(result.error)
  }
} finally { db.close() }
process.exitCode = failed ? 1 : 0
