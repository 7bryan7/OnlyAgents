// Local test harness only: real HTTP/SQLite/UI with fixture Google and Gemini boundaries.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installProviderFixture } from './provider-fixture.js'
process.env.BACKUP_ENABLED = 'false'
Object.assign(process.env, { DATA_DIR: mkdtempSync(join(tmpdir(), 'onlyagent-browser-')), GEMINI_API_KEY: 'test-fixture-key', GOOGLE_CLIENT_ID: 'test-client', WARMUP_ENABLED: 'false', FEED_CYCLE_ENABLED: 'false', APP_ORIGIN: 'http://127.0.0.1:5189' })
process.env.ADMIN_EMAILS = 'test-user@example.test'
process.env.API_RATE_LIMIT = '5000'
process.env.AUTH_RATE_LIMIT = '1000'
installProviderFixture()
const { startServer } = await import('../server/index.js')
startServer(8799)
