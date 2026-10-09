import { createContext, useContext, useEffect, useState, useCallback } from 'react'
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const BASE = import.meta.env.VITE_API_URL || ''
const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [gisReady, setGisReady] = useState(false)
  const signOut = useCallback(() => {
    localStorage.removeItem('oa_token')
    localStorage.removeItem('oa_user')
    setUser(null)
    fetch(BASE + '/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'OnlyAgent' } }).catch(() => {})
    window.google?.accounts?.id.disableAutoSelect()
  }, [])
  const signIn = useCallback(async (token) => {
    setError('')
    try {
      if (!token || typeof token !== 'string') throw new Error('Google did not return a sign-in token. Try again.')
      let res
      try {
        res = await fetch(BASE + '/api/auth/me', { credentials: 'include', headers: { Authorization: 'Bearer ' + token } })
      } catch {
        throw new Error('Cannot reach the OnlyAgent API. Start both services with npm run dev:all.')
      }
      const body = await res.text()
      if (!body.trim()) {
        throw new Error(`The API returned an empty response (HTTP ${res.status}). Start both services with npm run dev:all.`)
      }
      let data
      try {
        data = JSON.parse(body)
      } catch {
        throw new Error(`The API returned an invalid response (HTTP ${res.status}). Restart npm run dev:all.`)
      }
      if (!res.ok) throw new Error(data?.error || `Sign-in failed (HTTP ${res.status}). Try again.`)
      if (!data?.user?.email) throw new Error('The API did not return a verified Google account. Check the Google OAuth client IDs.')
      const session = await fetch(BASE + '/api/auth/session', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'OnlyAgent' }, body: JSON.stringify({ idToken: token }),
      })
      const identity = await session.json()
      if (!session.ok) throw new Error(identity.error || 'Could not start the authenticated session.')
      localStorage.removeItem('oa_token')
      localStorage.removeItem('oa_user')
      setUser(identity.user)
    } catch (e) {
      signOut()
      setError(e.message)
    } finally { setLoading(false) }
  }, [signOut])
  useEffect(() => {
    const token = localStorage.getItem('oa_token')
    if (token) signIn(token)
    else {
      let active = true
      fetch(BASE + '/api/auth/me', { credentials: 'include' }).then(async (res) => {
        if (!res.ok) return
        const data = await res.json()
        if (active) setUser(data.user)
      }).catch(() => {}).finally(() => { if (active) setLoading(false) })
      window.addEventListener('oa:unauthorized', signOut)
      return () => { active = false; window.removeEventListener('oa:unauthorized', signOut) }
    }
    window.addEventListener('oa:unauthorized', signOut)
    return () => window.removeEventListener('oa:unauthorized', signOut)
  }, [signIn, signOut])
  useEffect(() => {
    if (!CLIENT_ID) return
    const init = () => {
      if (!window.google?.accounts?.id) return false
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (response) => signIn(response.credential) })
      setGisReady(true)
      return true
    }
    if (init()) return
    const timer = setInterval(() => { if (init()) clearInterval(timer) }, 300)
    return () => clearInterval(timer)
  }, [signIn])
  return <AuthContext.Provider value={{ user, loading, error, gisReady, clientId: CLIENT_ID, signOut }}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
