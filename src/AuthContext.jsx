import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getAddress } from 'viem'

const BASE = import.meta.env.VITE_API_URL || ''
const AuthContext = createContext(null)

function provider() {
  return typeof window !== 'undefined' ? window.ethereum?.providers?.find((item) => item.isMetaMask) || window.ethereum : null
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)

  const signOut = useCallback(() => {
    localStorage.removeItem('oa_user')
    setUser(null)
    fetch(BASE + '/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'OnlyAgent' } }).catch(() => {})
  }, [])

  const signIn = useCallback(async () => {
    setError('')
    setConnecting(true)
    try {
      const activeProvider = provider()
      if (!activeProvider) throw new Error('MetaMask was not detected. Install or unlock MetaMask, then try again.')
      const accounts = await activeProvider.request({ method: 'eth_requestAccounts' })
      if (!accounts?.[0]) throw new Error('No wallet account selected.')
      const walletAddress = getAddress(accounts[0])
      const challengeResponse = await fetch(BASE + '/api/auth/challenge', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'OnlyAgent' },
        body: JSON.stringify({ walletAddress }),
      })
      const challenge = await challengeResponse.json()
      if (!challengeResponse.ok) throw new Error(challenge.error || 'Could not start wallet sign-in.')
      const signature = await activeProvider.request({ method: 'personal_sign', params: [challenge.message, walletAddress] })
      const sessionResponse = await fetch(BASE + '/api/auth/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'OnlyAgent' },
        body: JSON.stringify({ walletAddress, signature }),
      })
      const identity = await sessionResponse.json()
      if (!sessionResponse.ok) throw new Error(identity.error || 'Wallet sign-in failed.')
      setUser(identity.user)
      return identity.user
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setConnecting(false)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    fetch(BASE + '/api/auth/me', { credentials: 'include' }).then(async (res) => {
      if (!res.ok) return
      const data = await res.json()
      if (active) setUser(data.user)
    }).catch(() => {}).finally(() => { if (active) setLoading(false) })
    const unauthorized = () => signOut()
    window.addEventListener('oa:unauthorized', unauthorized)
    return () => { active = false; window.removeEventListener('oa:unauthorized', unauthorized) }
  }, [signOut])

  return <AuthContext.Provider value={{ user, loading, error, connecting, signIn, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
