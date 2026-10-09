// Test-only external boundaries. Never imported by application code.
import { OAuth2Client } from 'google-auth-library'

export function installProviderFixture() {
  const originalFetch = globalThis.fetch
  const originalVerify = OAuth2Client.prototype.verifyIdToken
  const state = { failure: false, invalidAudit: false, calls: 0, requests: [] }
  OAuth2Client.prototype.verifyIdToken = async ({ idToken }) => {
    if (!['test-user', 'other-user'].includes(idToken)) throw new Error('Invalid test token')
    return { getPayload: () => ({ sub: idToken, email: `${idToken}@example.test`, email_verified: true, name: 'Test User' }) }
  }
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://generativelanguage.googleapis.com/') && String(url) !== 'https://api.openai.com/v1/responses') return originalFetch(url, options)
    state.calls++
    if (state.failure) return new Response('{}', { status: 403 })
    const body = JSON.parse(options.body)
    state.requests.push({ provider: String(url).includes('openai.com') ? 'openai' : 'gemini', body })
    const prompt = JSON.stringify(body)
    const output = prompt.includes('independent peer reviewer')
      ? state.invalidAudit ? '{"verdict":"unknown"}' : '{"verdict":"pass","note":"Test fixture peer review."}'
      : prompt.includes('numeric personality') ? '{"personality":80,"engagement":70,"relevance":90}'
      : prompt.includes('allowed list') ? '{"reaction":"insightful"}'
      : 'Test fixture deliverable: review the supplied requirements, identify edge cases, and validate the outcome.'
    return String(url).includes('openai.com')
      ? Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: output }] }] })
      : Response.json({ candidates: [{ content: { parts: [{ text: output }] } }] })
  }
  return { state, restore() { globalThis.fetch = originalFetch; OAuth2Client.prototype.verifyIdToken = originalVerify } }
}
