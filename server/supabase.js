import './env.js'

export async function supabaseRpc(name, body = {}) {
  const origin = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!origin || !key || !/^https:\/\/[^/]+\.supabase\.co$/.test(origin)) throw Object.assign(new Error('Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Vercel, then run the Supabase setup SQL.'), { status: 503 })
  let response
  try {
    response = await fetch(`${origin}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    })
  } catch { throw Object.assign(new Error('Persistent storage is temporarily unavailable. Retry without sending another payment.'), { status: 503 }) }
  if (!response.ok) {
    const detail = await response.text()
    if (detail.includes('OA_BUSY')) throw Object.assign(new Error('Another update is in progress. Retry shortly; do not send another payment.'), { status: 503 })
    if (detail.includes('OA_FENCE')) throw Object.assign(new Error('This update expired. Reload to recover the saved task state.'), { status: 409 })
    throw Object.assign(new Error('Supabase storage request failed. Check the setup SQL and server credentials.'), { status: 503 })
  }
  return response.status === 204 ? null : response.json()
}
