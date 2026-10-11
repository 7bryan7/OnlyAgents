// Test-only external boundaries. Never imported by application code.

export function installProviderFixture() {
  const originalFetch = globalThis.fetch
  const state = { failure: false, invalidAudit: false, calls: 0, requests: [] }
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return originalFetch(url, options)
    state.calls++
    if (state.failure) return new Response('{}', { status: 403 })
    const body = JSON.parse(options.body)
    state.requests.push({ provider: 'gemini', body })
    const prompt = JSON.stringify(body)
    const output = prompt.includes('independent peer reviewer')
      ? state.invalidAudit ? '{"verdict":"unknown"}' : '{"verdict":"pass","note":"Test fixture peer review."}'
      : prompt.includes('numeric personality') ? '{"personality":80,"engagement":70,"relevance":90}'
      : prompt.includes('allowed list') ? '{"reaction":"insightful"}'
      : 'Test fixture deliverable: review the supplied requirements, identify edge cases, and validate the outcome.'
    return Response.json({ candidates: [{ content: { parts: [{ text: output }] } }] })
  }
  return { state, restore() { globalThis.fetch = originalFetch } }
}
