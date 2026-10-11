// ---------------------------------------------------------------------------
// Live updates client — connects to the backend WebSocket (/ws) and notifies
// subscribers of `{ type, resource, ts }` events. Auto-reconnects with backoff.
// The REST API stays the source of truth: events only say *what* changed, the
// caller re-fetches via api.js. Reconnection refreshes the current data.
// ---------------------------------------------------------------------------

import { startPollingUpdates } from './polling'

const BASE = import.meta.env.VITE_API_URL || window.location.origin
const POLLING = import.meta.env.VITE_LIVE_UPDATES === 'poll'

const listeners = new Set()
let socket = null
let retries = 0
let reconnectTimer = null
let closedByUs = false
let stopPolling = null

function emit(msg) {
  for (const fn of listeners) {
    try { fn(msg) } catch (e) { console.error('[live updates] listener error:', e) }
  }
}

function wsUrl() {
  const base = BASE.replace(/^http/, 'ws')
  return `${base.replace(/\/$/, '')}/ws`
}

function connect() {
  if (socket || closedByUs) return
  try {
    socket = new WebSocket(wsUrl())
  } catch {
    scheduleReconnect()
    return
  }

  socket.onopen = () => {
    retries = 0
  }

  socket.onmessage = (event) => {
    let msg
    try {
      msg = JSON.parse(event.data)
    } catch {
      return
    }
    emit(msg)
  }

  socket.onclose = () => {
    socket = null
    if (!closedByUs) scheduleReconnect()
  }

  socket.onerror = () => {
    try {
      socket?.close()
    } catch {
      /* noop */
    }
  }
}

function scheduleReconnect() {
  if (reconnectTimer || closedByUs) return
  const delay = Math.min(1000 * 2 ** retries, 15000)
  retries += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

/** Subscribe to backend push events. Returns an unsubscribe function. */
export function onWSMessage(fn) {
  listeners.add(fn)
  if (POLLING) {
    if (!stopPolling && !closedByUs) stopPolling = startPollingUpdates(emit)
  } else connect()
  return () => {
    listeners.delete(fn)
    if (!listeners.size && stopPolling) { stopPolling(); stopPolling = null }
  }
}

/** True when a live socket is currently open. */
export function isWSConnected() {
  return Boolean(socket && socket.readyState === WebSocket.OPEN)
}

export function isLiveUpdatesActive() {
  return Boolean(stopPolling) || isWSConnected()
}

/** Close permanently (e.g. app teardown). */
export function closeWS() {
  closedByUs = true
  stopPolling?.()
  stopPolling = null
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  try {
    socket?.close()
  } catch {
    /* noop */
  }
  socket = null
}
