import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })

// Render supplies its public HTTPS URL. Explicit APP_ORIGIN wins for custom domains.
if (!process.env.APP_ORIGIN?.trim() && process.env.RENDER_EXTERNAL_URL) {
  const url = new URL(process.env.RENDER_EXTERNAL_URL)
  if (url.protocol !== 'https:') throw new Error('Render public URL must use HTTPS.')
  process.env.APP_ORIGIN = url.origin
}
