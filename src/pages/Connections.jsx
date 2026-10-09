import { useEffect, useState } from 'react'
import { Wallet, RefreshCw, ShieldCheck, Cpu } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { useWallet } from '../hooks/useWallet'

const field = 'w-full mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm'
const button = 'rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40'
const panel = 'rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4'

export default function Connections() {
  const { user } = useAuth()
  const { chain, refresh } = useData()
  const wallet = useWallet()
  const [runtime, setRuntime] = useState(null)
  const [form, setForm] = useState(null)
  const [usage, setUsage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [treasury, setTreasury] = useState(null)
  const admin = user?.role === 'admin'
  const isOperator = wallet.address && chain?.operator && wallet.address.toLowerCase() === chain.operator.toLowerCase()
  useEffect(() => {
    let active = true
    Promise.all([api.runtime(), api.usage()]).then(([r, u]) => {
      if (!active) return
      setRuntime(r.runtime)
      setForm({ provider: r.runtime.provider, geminiModel: r.runtime.geminiModel, openaiModel: r.runtime.openaiModel })
      setUsage(u.usage)
    }).catch((e) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [])
  async function save() {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api.updateRuntime(form)
      setRuntime(result.runtime)
      setNotice('Backend settings saved. New tasks use the selected provider and model.')
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
  async function loadTreasury() {
    setBusy(true); setError('')
    try { const result = await api.treasury(); setTreasury(result.treasury) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <div className="max-w-4xl space-y-6 text-slate-800 dark:text-slate-200">
    <div><h1 className="font-sora text-xl font-bold">AI Models & Agent Config</h1>
      <p className="mt-1 text-sm text-slate-500">Live backend settings for tasks, peer reviews, swarms and social generation.</p></div>
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10">{error}</div>}
    {notice && <p role="status" className="text-sm text-emerald-600">{notice}</p>}
    <section className={panel}>
      <h2 className="flex items-center gap-2 font-bold"><Cpu size={18} /> AI runtime</h2>
      {!runtime ? <p>Loading backend settings…</p> : <>
        <div className="grid gap-3 sm:grid-cols-2">{runtime.providers.map((p) => <div key={p.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
          <div className="font-semibold">{p.id === 'gemini' ? 'Google Gemini' : 'OpenAI'}</div>
          <p className="text-xs text-slate-500 mt-1">{p.configured ? 'Server key configured; use the live check to verify access.' : `Add ${p.id === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'} to the server .env and restart.`}</p>
        </div>)}</div>
        <p className="text-sm">Selected: <strong>{runtime.provider} / {runtime.model}</strong></p>
        <p className="text-xs text-slate-500">Credentials stay on the server. Provider errors are recorded as failures; no fabricated response or automatic provider substitution is used.</p>
        {form && <fieldset disabled={!admin || busy} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Provider<select className={field} value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
            <option value="gemini">Google Gemini</option><option value="openai">OpenAI</option>
          </select></label>
          <label className="text-sm">Gemini model<input className={field} value={form.geminiModel} onChange={(e) => setForm({ ...form, geminiModel: e.target.value })} /></label>
          <label className="text-sm">OpenAI model<input className={field} value={form.openaiModel} onChange={(e) => setForm({ ...form, openaiModel: e.target.value })} /></label>
        </fieldset>}
        {admin ? <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={save}>Save runtime settings</button><button className={button} disabled={busy} onClick={check}>Check live generation</button></div> : <p className="text-xs text-slate-500">Administrator access is required to change the shared runtime.</p>}
        <p className="text-xs text-slate-500">The live check sends a small request and uses provider quota. Save settings before checking a newly selected model.</p>
        {runtime.lastCheck && <p className="text-xs text-slate-500">Last check: {runtime.lastCheck.source} / {runtime.lastCheck.model} — {runtime.lastCheck.ok ? 'succeeded' : 'failed'} at {new Date(runtime.lastCheck.checkedAt).toLocaleString()}</p>}
      </>}
    </section>
    {usage && <section className={panel}><h2 className="font-bold">Your AI usage</h2><p>{usage.used} of {usage.limit} generation calls used today. {usage.remaining} remaining.</p><p className="text-xs text-slate-500">Resets at midnight UTC. Tasks, audits and synthesis each use calls; failed attempts also count. This is an application limit, not a billing estimate.</p></section>}
    <section className={panel}>
      <h2 className="flex items-center gap-2 font-bold"><Wallet size={18} /> Wallet</h2>
      <p className="text-sm text-slate-500">Connect MetaMask for Base Sepolia minting and hiring. Before your first transaction, sign a wallet-ownership message to link it to your Google account.</p>
      <button className={button} onClick={() => wallet.connect()} disabled={wallet.connecting}>{wallet.connecting ? 'Connecting…' : wallet.address ? 'Reconnect wallet' : 'Connect wallet'}</button>
      {wallet.address && <div className="text-xs font-mono break-all">Connected {wallet.address.slice(0, 8)}…{wallet.address.slice(-6)}<p className="mt-1 text-slate-500">{isOperator ? 'Configured operator wallet' : 'Operator wallet: ' + (chain?.operator || 'not configured')}</p></div>}
      {wallet.error && <p role="alert" className="text-sm text-red-600">{wallet.error}</p>}
    </section>
    <section className={panel}><h2 className="flex items-center gap-2 font-bold"><ShieldCheck size={18} /> On-chain treasury</h2>
      <p className="text-sm text-slate-500">Read mined contract events from the configured Base Sepolia RPC. Connection alone does not prove a payment.</p>
      <button className={button} onClick={loadTreasury} disabled={busy}><RefreshCw size={14} className="inline mr-2" />Load on-chain treasury</button>
      {treasury && <div className="text-sm space-y-2"><p>Task fees: {treasury.taskFeesEth} ETH · Mint fees: {treasury.mintFeesEth} ETH</p><p>Paid tasks: {treasury.tasksPaid} · Minted agents: {treasury.agentsMinted}</p><p className="text-xs text-slate-500">{treasury.scope}</p></div>}
    </section>
  </div>
}
