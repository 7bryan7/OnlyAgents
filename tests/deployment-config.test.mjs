import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startPollingUpdates } from '../src/polling.js'
import { readFileSync, existsSync } from 'node:fs'
import { restoreApiUrl } from '../server/vercel-routing.js'

test('Vercel routes nested API requests to a concrete function before SPA rewrites', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)))
  assert.deepEqual(config.rewrites[0], {
    source: '/api/:path*', destination: '/api/index?__oa_path=:path*',
  })
  assert.equal(existsSync(new URL('../api/index.js', import.meta.url)), true)
  assert.equal(existsSync(new URL('../api/[...path].js', import.meta.url)), false)
})

test('API rewrite restores nested routes and query parameters without trusting path overrides on original URLs', () => {
  for (const [input, expected] of [
    ['/api/index?__oa_path=health', '/api/health'],
    ['/api/index?__oa_path=jobs%2Ftick', '/api/jobs/tick'],
    ['/api/index?__oa_path=tasks%2Ftk-42&cursor=older&limit=10', '/api/tasks/tk-42?cursor=older&limit=10'],
    ['/api/health?__oa_path=jobs%2Ftick', '/api/health'],
    ['/api/jobs/tick', '/api/jobs/tick'],
  ]) {
    const req = { url: input }
    restoreApiUrl(req)
    assert.equal(req.url, expected)
  }
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
