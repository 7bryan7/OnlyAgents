// ---------------------------------------------------------------------------
// Live updates client — connects to the backend WebSocket (/ws) and notifies
// subscribers of `{ type, resource, ts }` events. Auto-reconnects with backoff.
// The REST API stays the source of truth: events only say *what* changed, the
// caller re-fetches via api.js. Reconnection refreshes the current data.
// ---------------------------------------------------------------------------

const BASE = import.meta.env.VITE_API_URL || window.location.origin

const listeners = new Set()
let socket = null
let retries = 0
let reconnectTimer = null
let closedByUs = false

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
    for (const fn of listeners) {
      try {
        fn(msg)
      } catch (e) {
        console.error('[ws] listener error:', e)
      }
    }
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
  connect()
  return () => listeners.delete(fn)
}

/** True when a live socket is currently open. */
export function isWSConnected() {
  return Boolean(socket && socket.readyState === WebSocket.OPEN)
}

/** Close permanently (e.g. app teardown). */
export function closeWS() {
  closedByUs = true
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
