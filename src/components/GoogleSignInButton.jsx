import { useEffect, useRef } from 'react'
import { useAuth } from '../AuthContext'

/**
 * Official "Sign in with Google" button (Google Identity Services).
 * Renders the branded button once GIS is initialized.
 */
export default function GoogleSignInButton({ size = 'large', shape = 'pill', theme = 'outline' }) {
  const { gisReady, clientId } = useAuth()
  const ref = useRef(null)

  useEffect(() => {
    if (!gisReady || !ref.current) return
    window.google.accounts.id.renderButton(ref.current, {
      theme,
      size,
      shape,
      text: 'signin_with',
      logo_alignment: 'left',
      width: 260,
    })
  }, [gisReady, size, shape, theme])

  if (!clientId) {
    return (
      <div role="status" className="max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950 shadow-sm">
        <p className="font-semibold">Google sign-in not configured</p>
        <p className="mt-1 leading-relaxed">Add your Google OAuth Web client ID to <code className="rounded bg-amber-100 px-1">.env</code>:</p>
        <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-xs">VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com</code>
        <p className="mt-2 leading-relaxed">In Google Cloud Console, authorize <code>http://localhost:5173</code>. Restart <code>npm run dev:all</code> after saving.</p>
        <a className="mt-2 inline-block font-semibold text-amber-900 underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Open Google Cloud credentials</a>
      </div>
    )
  }

  return <div ref={ref} />
}