import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
const envPath = fileURLToPath(new URL('../.env', import.meta.url))
if (existsSync(envPath)) {
  for (const [name, value] of Object.entries(dotenv.parse(readFileSync(envPath)))) {
    // Deployment credentials are never runtime signing credentials.
    if (!['PRIVATE_KEY', 'BASESCAN_API_KEY'].includes(name) && process.env[name] === undefined) process.env[name] = value
  }
}
delete process.env.PRIVATE_KEY
delete process.env.BASESCAN_API_KEY

// Render supplies its public HTTPS URL. Explicit APP_ORIGIN wins for custom domains.
if (!process.env.APP_ORIGIN?.trim() && process.env.RENDER_EXTERNAL_URL) {
  const url = new URL(process.env.RENDER_EXTERNAL_URL)
  if (url.protocol !== 'https:') throw new Error('Render public URL must use HTTPS.')
  process.env.APP_ORIGIN = url.origin
}
