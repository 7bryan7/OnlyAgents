import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { startPollingUpdates } from '../src/polling.js'

test('Render URL configuration validates input, preserves SPA routes and replaces the API target', () => {
  const directory = mkdtempSync(join(tmpdir(), 'onlyagent-vercel-'))
  try {
    mkdirSync(join(directory, 'scripts'))
    for (const name of ['configure-vercel.mjs', 'vercel-build.mjs']) copyFileSync(new URL(`../scripts/${name}`, import.meta.url), join(directory, 'scripts', name))
    const configPath = join(directory, 'vercel.json')
    writeFileSync(configPath, JSON.stringify({ rewrites: [{ source: '/app/:path*', destination: '/index.html' }] }))
    const build = spawnSync(process.execPath, [join(directory, 'scripts/vercel-build.mjs')], { encoding: 'utf8' })
    assert.notEqual(build.status, 0)
    assert.match(build.stderr, /Render API is not configured/)
    const configure = value => spawnSync(process.execPath, [join(directory, 'scripts/configure-vercel.mjs'), value], { encoding: 'utf8' })
    for (const value of ['http://localhost:8787', 'https://demo.onrender.com/api', 'https://secret@demo.onrender.com', 'https://demo.onrender.com?token=secret', 'https://demo.onrender.com.evil.test']) {
      assert.notEqual(configure(value).status, 0)
    }
    assert.equal(configure('https://demo.onrender.com/').status, 0)
    assert.equal(configure('https://replacement.onrender.com').status, 0)
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    assert.deepEqual(config.rewrites, [
      { source: '/api/:path*', destination: 'https://replacement.onrender.com/api/:path*' },
      { source: '/app/:path*', destination: '/index.html' },
    ])
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('polling refreshes visible pages, resumes on return, and cleans up its timer and listener', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const page = new EventTarget()
  page.visibilityState = 'visible'
  Object.defineProperty(globalThis, 'document', { configurable: true, value: page })
  let tick, cleared = false
  t.mock.method(globalThis, 'setInterval', (callback, interval) => { tick = callback; assert.equal(interval, 15000); return 123 })
  t.mock.method(globalThis, 'clearInterval', timer => { assert.equal(timer, 123); cleared = true })
  const events = []
  try {
    const stop = startPollingUpdates(event => events.push(event))
    tick()
    assert.equal(events.length, 1)
    assert.equal(events[0].resource, 'all')
    page.visibilityState = 'hidden'
    tick()
    page.dispatchEvent(new Event('visibilitychange'))
    assert.equal(events.length, 1)
    page.visibilityState = 'visible'
    page.dispatchEvent(new Event('visibilitychange'))
    assert.equal(events.length, 2)
    stop()
    assert.equal(cleared, true)
    page.dispatchEvent(new Event('visibilitychange'))
    assert.equal(events.length, 2)
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original)
    else delete globalThis.document
  }
})
