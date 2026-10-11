// One shared timer updates all subscribers; pause while the page is hidden.
export function startPollingUpdates(emit) {
  const refresh = () => {
    if (document.visibilityState !== 'hidden') emit({ type: 'update', resource: 'all', ts: Date.now() })
  }
  const timer = setInterval(refresh, 15000)
  document.addEventListener('visibilitychange', refresh)
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', refresh)
  }
}
