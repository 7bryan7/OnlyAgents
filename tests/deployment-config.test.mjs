import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startPollingUpdates } from '../src/polling.js'

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
