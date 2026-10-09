import { X, LogOut, Bot, ShieldCheck, Network, Activity, Scale, Wallet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { api } from '../api'
import { useEffect, useState } from 'react'

const MODE_META = {
  loading: { label: 'Connecting…', color: '#94a3b8', bg: '#f1f5f9' },
  unconfigured: { label: 'AI key required', color: '#f59e0b', bg: '#fffbeb' },
  gemini: { label: 'Gemini configured', color: '#10b981', bg: '#ecfdf5' },
  openai: { label: 'OpenAI configured', color: '#10b981', bg: '#ecfdf5' },
  offline: { label: 'Backend offline', color: '#ef4444', bg: '#fef2f2' },
}

export default function SettingsModal({ open, onClose }) {
  const { user, signOut } = useAuth()
  const { mode, agents, swarms, auditTotal, config, updateConfig } = useData()
  const navigate = useNavigate()
  const [weights, setWeights] = useState(config.reputation)
  const [threshold, setThreshold] = useState(config.hireThreshold)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [wallet, setWallet] = useState('')
  const [walletSaved, setWalletSaved] = useState(false)

  // Load the server-side profile (wallet address) when the modal opens
  useEffect(() => {
    if (!open || !user?.email) return
    let cancelled = false
    api.profile(user.email).then(({ profile }) => {
      if (cancelled || !profile) return
      setWallet(profile.walletAddress || '')
    })
    return () => {
      cancelled = true
    }
  }, [open, user?.email])

  const saveWallet = async () => {
    if (!user?.email) return
    setWalletSaved(false)
    setError('')
    try {
      await api.updateProfile({
        email: user.email,
        name: user.name,
        picture: user.picture,
        walletAddress: wallet.trim() || null,
      })
      setWalletSaved(true)
      setTimeout(() => setWalletSaved(false), 2500)
    } catch (e) {
      setError(e.message)
    }
  }

  // Keep local sliders in sync when config reloads (e.g. after refresh)
  useEffect(() => {
    setWeights(config.reputation)
    setThreshold(config.hireThreshold)
  }, [config])

  if (!open) return null

  const meta = MODE_META[mode] || MODE_META.offline

  const stats = [
    { icon: Bot, label: 'Agents registered', value: agents.length },
    { icon: Network, label: 'Swarms', value: swarms.length },
    { icon: ShieldCheck, label: 'Audits recorded', value: auditTotal },
    { icon: Activity, label: 'Runtime', value: meta.label },
  ]

  // Adjust one weight; scale the others proportionally so they always sum to 1.
  const setWeight = (key, value) => {
    const next = { ...weights, [key]: value }
    const others = Object.keys(next).filter((k) => k !== key)
    const rest = 1 - value
    const otherSum = others.reduce((s, k) => s + next[k], 0)
    others.forEach((k) => {
      next[k] = Math.round((otherSum ? next[k] / otherSum : 1 / others.length) * rest * 1000) / 1000
    })
    setWeights(next)
  }

  const commit = async () => {
    setSaving(true)
    setError('')
    try {
      await updateConfig({ reputation: weights, hireThreshold: threshold })
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const weightSum = Object.values(weights).reduce((s, v) => s + v, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      {error && <div role="alert" className="absolute top-5 z-10 rounded bg-red-100 p-3 text-red-700">{error}</div>}
      {/* Panel */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Account */}
          <div>
            <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Account</div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt={user.name || 'user'}
                  className="w-10 h-10 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-brand-600 flex items-center justify-center text-white text-sm font-bold">
                  {(user?.name || 'U').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{user?.name || 'Signed in'}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 truncate">{user?.email}</div>
              </div>
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Signed in
              </span>
            </div>

            {/* Wallet (PRD §4.1) — payout address for hired agents; wagmi connect lands in Phase 2 */}
            <div className="mt-2.5 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
                <Wallet size={12} />
                Payout wallet
              </div>
              <div className="flex gap-2">
                <input
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  placeholder="0x… (Base Sepolia address)"
                  spellCheck={false}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-brand-300 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-500/20 outline-none text-xs font-mono text-slate-700 dark:text-slate-300"
                />
                <button
                  onClick={saveWallet}
                  className="shrink-0 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold transition-colors"
                >
                  Save
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                {walletSaved
                  ? 'Saved to your profile.'
                  : 'Profile preference only. Minting and hiring require a connected, verified wallet.'}
              </p>
            </div>
          </div>

          {/* Runtime */}
          <div>
            <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Platform status</div>
            <div className="grid grid-cols-2 gap-2.5">
              {stats.map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                    <Icon size={12} />
                    {label}
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-200">{value}</div>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
              Reputation metrics are computed from real task executions and peer audits.
            </p>
          </div>

          {/* Reputation protocol */}
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
              <Scale size={11} />
              Reputation protocol
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
              {[
                { key: 'trust', label: 'Trust (peer audits)' },
                { key: 'completion', label: 'Completion' },
                { key: 'latency', label: 'Latency health' },
                { key: 'social', label: 'Social (feed)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-600 dark:text-slate-300 font-medium">{label}</span>
                    <span className="text-slate-400 dark:text-slate-500 tabular-nums">{Math.round(weights[key] * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(weights[key] * 100)}
                    onChange={(e) => setWeight(key, Number(e.target.value) / 100)}
                    onPointerUp={commit}
                    onKeyUp={commit}
                    className="w-full accent-brand-600"
                  />
                </div>
              ))}
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 dark:text-slate-500">Weights sum</span>
                <span className={`tabular-nums font-semibold ${Math.abs(weightSum - 1) < 0.01 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                  {weightSum.toFixed(3)}
                </span>
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-600 dark:text-slate-300 font-medium">Hire threshold</span>
                  <span className="text-slate-400 dark:text-slate-500 tabular-nums">{threshold}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  onPointerUp={commit}
                  onKeyUp={commit}
                  className="w-full accent-brand-600"
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  Agents with composite reputation below this are locked in the marketplace.
                </p>
              </div>
              <button
                onClick={commit}
                disabled={user?.role !== 'admin' || saving || Math.abs(weightSum - 1) > 0.01}
                className="w-full inline-flex items-center justify-center px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
              >
                {saving ? 'Saving…' : 'Apply protocol config'}
              </button>
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={() => {
              signOut()
              navigate('/')
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
