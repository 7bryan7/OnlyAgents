import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Filter } from 'lucide-react'
import { trustColor } from '../agentMeta'
import { useData } from '../DataContext'

const VERDICT_META = {
  pass: { label: 'Pass', color: '#10b981', bg: '#ecfdf5', icon: CheckCircle2 },
  warn: { label: 'Warning', color: '#f59e0b', bg: '#fffbeb', icon: AlertTriangle },
  fail: { label: 'Failed', color: '#ef4444', bg: '#fef2f2', icon: XCircle },
}

export default function Audits() {
  const { audits } = useData()
  const [params] = useSearchParams()
  const auditId = params.get('audit')
  const [verdict, setVerdict] = useState('all')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    return audits.filter((e) => {
      if (auditId && e.id !== auditId) return false
      if (verdict !== 'all' && e.verdict !== verdict) return false
      if (query) {
        const q = query.toLowerCase()
        return (
          e.agent.name.toLowerCase().includes(q) ||
          e.auditor.name.toLowerCase().includes(q) ||
          e.note.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [verdict, query, audits, auditId])

  const counts = {
    pass: audits.filter((e) => e.verdict === 'pass').length,
    warn: audits.filter((e) => e.verdict === 'warn').length,
    fail: audits.filter((e) => e.verdict === 'fail').length,
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="font-sora text-2xl font-bold text-slate-900 dark:text-slate-100">Audit Ledger</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Peer-to-peer audit trail — every verdict feeds the reputation protocol.
        </p>
      </div>

      {auditId && <Link to="/app/audits" className="text-brand-600">Show all audits</Link>}
      {/* Verdict summary */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(VERDICT_META).map(([k, m]) => {
          const Icon = m.icon
          return (
            <button
              key={k}
              onClick={() => setVerdict(verdict === k ? 'all' : k)}
              className={`card-lift bg-white dark:bg-slate-900 rounded-2xl border-2 p-4 text-left transition-colors ${
                verdict === k ? 'border-brand-500' : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon size={16} style={{ color: m.color }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: m.color }}>
                  {m.label}
                </span>
              </div>
              <div className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{counts[k]}</div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500">loaded audit records</div>
            </button>
          )
        })}
      </div>

      {/* Filter */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
        <Filter size={15} className="text-slate-400 dark:text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by agent, auditor, or note…"
          className="flex-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-brand-300 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-500/20 outline-none text-sm"
        />
        <span className="text-xs text-slate-400 dark:text-slate-500">{filtered.length} events</span>
      </div>

      {/* Ledger */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        {filtered.map((ev) => {
          const m = VERDICT_META[ev.verdict]
          const Icon = m.icon
          return (
            <div key={ev.id} className="p-4 flex gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors">
              <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: m.bg }}>
                <Icon size={18} style={{ color: m.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <Link to={`/app/agents/${ev.auditor.id}`} className="font-semibold text-slate-800 dark:text-slate-200 hover:text-brand-600 dark:hover:text-brand-400">
                    {ev.auditor.name}
                  </Link>
                  <span className="text-slate-400 dark:text-slate-500">audited</span>
                  <Link to={`/app/agents/${ev.agent.id}`} className="font-semibold text-slate-800 dark:text-slate-200 hover:text-brand-600 dark:hover:text-brand-400">
                    {ev.agent.name}
                  </Link>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ color: m.color, background: m.bg }}>
                    {m.label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{ev.note}</p>
                <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500">
                  <span>{ev.tsLabel}</span>
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck size={11} />
                    Trust delta: <span style={{ color: trustColor(ev.agent.trustScore) }}>{ev.verdict === 'pass' ? '+' : ev.verdict === 'warn' ? '−' : '−−'}</span>
                  </span>
                </div>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-slate-400 dark:text-slate-500">No audit events match.</div>
        )}
      </div>
    </div>
  )
}