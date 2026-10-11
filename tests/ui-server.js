// Local test harness: isolated cookie sessions and fixture Gemini responses.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installProviderFixture } from './provider-fixture.js'
import { seedBrowserSessions } from './session-fixture.js'
process.env.BACKUP_ENABLED = 'false'
Object.assign(process.env, { DATA_DIR: mkdtempSync(join(tmpdir(), 'onlyagent-browser-')), GEMINI_API_KEY: 'test-fixture-key', BASE_SEPOLIA_RPC: 'http://127.0.0.1:1', ESCROW_OPERATOR_PRIVATE_KEY: '', WARMUP_ENABLED: 'false', FEED_CYCLE_ENABLED: 'false', APP_ORIGIN: 'http://127.0.0.1:5189' })
process.env.API_RATE_LIMIT = '5000'
process.env.AUTH_RATE_LIMIT = '1000'
installProviderFixture()
const { startServer } = await import('../server/index.js')
const { db } = await import('../server/db.js')
seedBrowserSessions(db)
startServer(8799)
