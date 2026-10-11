import { useEffect, useState } from 'react'
import { Cpu } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'

const field = 'w-full mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm'
const button = 'rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40'
const panel = 'ui-panel rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4'
const GEMINI_MODELS = [
  { value: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite', badge: 'Pro' },
  { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
  { value: 'gemini-flash-lite-latest', label: 'gemini-flash-lite-latest' },
]

export default function Connections() {
  const { user } = useAuth()
  const { refresh } = useData()
  const [runtime, setRuntime] = useState(null)
  const [form, setForm] = useState(null)
  const [usage, setUsage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const admin = user?.role === 'admin'
  const selectedModel = form?.geminiModel || runtime?.geminiModel || runtime?.model || 'not configured'
  useEffect(() => {
    let active = true
    Promise.all([api.runtime(), api.usage()]).then(([r, u]) => {
      if (!active) return
      setRuntime(r.runtime)
      setForm({ geminiModel: r.runtime.geminiModel })
      setUsage(u.usage)
    }).catch((e) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [])
  async function selectModel(geminiModel) {
    setForm({ geminiModel })
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api.updateRuntime({ geminiModel })
      setRuntime(result.runtime)
      setNotice(`Runtime updated. New tasks use ${geminiModel}.`)
      refresh()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function check() {
    setBusy(true); setError(''); setNotice('')
    try {
      const { check } = await api.checkRuntime()
      setRuntime((r) => ({ ...r, lastCheck: check }))
      const result = await api.usage(); setUsage(result.usage)
      if (check.ok) setNotice('Live generation succeeded for ' + check.source + ' / ' + check.model + '.')
      else setError(check.error)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <div className="ui-section models-section w-full max-w-[1452px] mx-auto space-y-6 text-slate-800 dark:text-slate-200">
    <div><span className="ui-eyebrow">Runtime & generation</span>
          <h1 className="font-sora text-xl font-bold">AI Models & Agent Config</h1>
      <p className="mt-1 text-sm text-slate-500">Live backend settings for tasks, peer reviews, swarms and social generation.</p></div>
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10">{error}</div>}
    {notice && <p role="status" className="text-sm text-emerald-600">{notice}</p>}
    <div className="grid items-start gap-6 lg:grid-cols-2">
    <section className={panel}>
      <h2 className="flex items-center gap-2 font-bold"><Cpu size={18} /> AI runtime</h2>
      {!runtime ? <p>Loading backend settings…</p> : <>
        <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
          <div className="font-semibold">Google Gemini · {selectedModel}</div>
          <p className="text-xs text-slate-500 mt-1">{runtime.providers[0]?.configured ? `Server key configured for ${selectedModel}; use the live check to verify access.` : `Add GEMINI_API_KEY to the server .env to use ${selectedModel}.`}</p>
        </div></div>
        <p className="text-sm">Selected model: <strong>{selectedModel}</strong></p>
        <p className="text-xs text-slate-500">Credentials stay on the server. Provider errors are recorded as failures; no fabricated response or automatic provider substitution is used.</p>
        {form && <fieldset disabled={!admin || busy} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Gemini model
            <span className="relative mt-1 block">
              <select
                aria-label="Gemini model"
                className={field}
                value={form.geminiModel}
                onChange={(e) => selectModel(e.target.value)}
              >
                {GEMINI_MODELS.map((model) => (
                  <option key={model.value} value={model.value}>{model.label}{model.badge ? ` (${model.badge})` : ''}</option>
                ))}
              </select>
              {form.geminiModel === 'gemini-3.5-flash-lite' && (
                <span className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                  Pro
                </span>
              )}
            </span>
          </label>
        </fieldset>}
        {admin ? <button className={button} disabled={busy} onClick={check}>Check live generation</button> : <p className="text-xs text-slate-500">Administrator access is required to change the shared runtime.</p>}
        <p className="text-xs text-slate-500">The live check sends a small {selectedModel} request and uses Gemini quota. Model changes are saved immediately.</p>
        {runtime.lastCheck && <p className="text-xs text-slate-500">Last check: {runtime.lastCheck.source} / {runtime.lastCheck.model} — {runtime.lastCheck.ok ? 'succeeded' : 'failed'} at {new Date(runtime.lastCheck.checkedAt).toLocaleString()}</p>}
      </>}
    </section>
    {usage && <section className={`${panel} ui-usage-panel`}><h2 className="font-bold">Your AI usage</h2><p>{usage.used} of {usage.limit} generation calls used today. {usage.remaining} remaining.</p><p className="text-xs text-slate-500">Resets at midnight UTC. Tasks, audits and synthesis each use calls; failed attempts also count. This is an application limit, not a billing estimate.</p></section>}
    </div>
  </div>
}
