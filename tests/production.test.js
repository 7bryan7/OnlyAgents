import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, rmdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('production server starts without credentials and serves SPA deep links', { timeout: 20000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'onlyagent-production-'))
  const child = spawn(process.execPath, ['server/index.js'], {
    windowsHide: true,
    env: { ...process.env, NODE_ENV: 'production', PORT: '0', DATA_DIR: directory, GEMINI_API_KEY: '', GOOGLE_CLIENT_ID: '', VITE_GOOGLE_CLIENT_ID: '', APP_ORIGIN: '', RENDER_EXTERNAL_URL: 'https://metropolice-test.onrender.com', WARMUP_ENABLED: 'false', FEED_CYCLE_ENABLED: 'false', BACKUP_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stderr.on('data', (chunk) => { logs += chunk.toString() })
  try {
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server did not start: ' + logs)), 10000)
      child.once('error', reject)
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error('Server exited: ' + code + ' ' + logs)) })
      child.stdout.on('data', (chunk) => {
        const match = chunk.toString().match(/http:\/\/localhost:(\d+)/)
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`) }
      })
    })
    const health = await (await fetch(base + '/api/health')).json()
    assert.equal(health.mode, 'unconfigured')
    assert.equal(health.executions, 0)
    const cors = await fetch(base + '/api/health', { headers: { Origin: 'https://metropolice-test.onrender.com' } })
    assert.equal(cors.headers.get('access-control-allow-origin'), 'https://metropolice-test.onrender.com')
    const protectedApi = await fetch(base + '/api/agents')
    assert.equal(protectedApi.status, 401)
    assert.match((await protectedApi.json()).error, /sign-in required/)
    for (const path of ['/', '/app', '/app/swarms', '/app/agents/ag-103']) {
      const response = await fetch(base + path)
      assert.equal(response.status, 200)
      assert.match(await response.text(), /<div id="root">/)
    }
  } finally {
    child.kill()
    await new Promise((resolve) => child.once('close', resolve))
    for (const filename of readdirSync(directory)) rmSync(join(directory, filename))
    rmdirSync(directory)
  }
})

test('Vercel cold start exports an API handler without creating local database files', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'onlyagent-vercel-start-'))
  const dataPath = join(directory, 'must-not-be-created')
  const child = spawn(process.execPath, ['--input-type=module', '-e', "const { default: handler } = await import('./api/index.js'); const { db, dbCounts } = await import('./server/db.js'); if (typeof handler !== 'function' || dbCounts().tasks !== 0) process.exitCode=1; db.close();"], {
    env: { ...process.env, VERCEL: '1', NODE_ENV: 'production', DATA_DIR: dataPath, GEMINI_API_KEY: '', BACKUP_ENABLED: 'true' },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let errors = ''
  child.stderr.on('data', chunk => { errors += chunk.toString() })
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
    assert.equal(code, 0, errors)
    assert.equal(existsSync(dataPath), false)
  } finally { rmdirSync(directory) }
})
