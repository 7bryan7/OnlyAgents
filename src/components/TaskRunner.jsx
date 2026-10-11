import { useState } from 'react'
import { Play, ShieldCheck, Loader2, Bot, ArrowRight, CheckCircle2, AlertTriangle, XCircle, Zap } from 'lucide-react'
import { useData } from '../DataContext'
import { trustColor, LIFECYCLE_STAGES } from '../agentMeta'

const SUGGESTIONS = [
  'Implement dark mode toggle for settings page',
  'Audit the new file upload endpoint for vulnerabilities',
  'Write test plan for the payments v2 flow',
  'Draft PRD for the onboarding revamp',
  'Profile dashboard bundle size and suggest fixes',
  'Triage 14 support tickets from this morning',
]

const VERDICT_META = {
  pass: { icon: CheckCircle2, color: '#10b981', label: 'Pass' },
  warn: { icon: AlertTriangle, color: '#f59e0b', label: 'Warning' },
  fail: { icon: XCircle, color: '#ef4444', label: 'Failed' },
}

export default function TaskRunner() {
  const { runTask, auditTask, mode } = useData()
  const [task, setTask] = useState('')
  const [stage, setStage] = useState('')
  const [running, setRunning] = useState(false)
  const [auditing, setAuditing] = useState(false)
  const [result, setResult] = useState(null)
  const [audit, setAudit] = useState(null)
  const [error, setError] = useState(null)

  const execute = async () => {
    if (!task.trim() || running || auditing) return
    setRunning(true)
    setError(null)
    setResult(null)
    setAudit(null)
    try {
      const r = await runTask(task.trim(), stage ? { stage } : {})
      setResult(r)
      if (r.execution.success) {
        setAuditing(true)
        try { setAudit(await auditTask(r.task.id)) } catch (e) { setError(e.message) } finally { setAuditing(false) }
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  const auditNow = async () => {
    if (!result?.execution.success || auditing || audit) return
    setError(null)
    setAuditing(true)
    try {
      const a = await auditTask(result.task.id)
      setAudit(a)
    } catch (e) {
      setError(e.message)
    } finally {
      setAuditing(false)
    }
  }

  const busy = running || auditing
  const executionStep = running ? 2 : auditing ? 4 : result ? (audit ? 5 : 3) : 1
  const steps = [
    { label: 'Submitted', icon: Play },
    { label: 'Routed', icon: ArrowRight },
    { label: 'Executed', icon: Bot },
    { label: 'Peer audit', icon: ShieldCheck },
    { label: 'Verified', icon: CheckCircle2 },
  ]

  return (
    <div className="ui-panel bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Zap size={16} className="text-brand-600 dark:text-brand-400" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Live task runner</h3>
        <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
          {mode === 'gemini' ? 'Gemini runtime' : mode === 'unconfigured' ? 'AI key required' : 'Backend offline'}
        </span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Submit a task — the orchestrator routes it to the highest-trust agent, then a peer audits the output.
      </p>

      <div className="flex flex-wrap gap-2">
        <input
          maxLength={500}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && execute()}
          placeholder="Describe a task for the swarm…"
          className="min-w-0 w-full sm:flex-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-brand-300 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-500/20 outline-none text-sm"
        />
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="min-w-0 flex-1 sm:flex-none px-2.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent outline-none text-xs text-slate-600 dark:text-slate-400"
          title="Route to a specific lifecycle stage (empty = auto)"
        >
          <option value="">Auto-route</option>
          {LIFECYCLE_STAGES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <button
          onClick={execute}
          disabled={busy || !task.trim() || mode !== 'gemini'}
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          Run
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setTask(s)}
            className="text-[10px] px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
          >
            {s.length > 42 ? s.slice(0, 42) + '…' : s}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{error}</div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              {steps.map((step, index) => {
                const Icon = step.icon
                const complete = index < executionStep
                const current = index === executionStep - 1
                return (
                  <div key={step.label} className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${complete ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'} ${current ? 'ring-2 ring-brand-200 dark:ring-brand-500/30' : ''}`}>
                      <Icon size={11} />
                    </span>
                    <span className={`hidden sm:block text-[10px] font-semibold ${complete ? 'text-brand-700 dark:text-brand-300' : 'text-slate-400'}`}>{step.label}</span>
                    {index < steps.length - 1 && <span className={`hidden md:block w-4 lg:w-8 h-px ${index < executionStep - 1 ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-700'}`} />}
                  </div>
                )
              })}
            </div>
          </div>
          {/* Routing + execution */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
              <Bot size={13} className="text-brand-600 dark:text-brand-400" />
              Routed to
              <ArrowRight size={11} />
              <span className="font-bold text-slate-800 dark:text-slate-200">{result.routedTo.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: trustColor(result.routedTo.trustScore), background: `${trustColor(result.routedTo.trustScore)}14` }}>
                trust {result.routedTo.trustScore.toFixed(0)}
              </span>
              <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">{result.execution.latencyMs}ms · {result.execution.success ? 'success' : 'failed'}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
              “{result.execution.output}”
            </p>
          </div>

          {/* Audit */}
          {!audit ? (
            <button
              onClick={auditNow}
              disabled={auditing || !result.execution.success}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-dashed border-brand-300 dark:border-brand-500/30 text-brand-700 dark:text-brand-300 text-sm font-semibold hover:bg-brand-50 dark:hover:bg-brand-500/10 disabled:opacity-40 transition-colors"
            >
              {auditing ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
              {auditing ? 'Peer auditing…' : 'Trigger peer audit'}
            </button>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                <ShieldCheck size={13} className="text-brand-600 dark:text-brand-400" />
                <span className="font-bold text-slate-800 dark:text-slate-200">{audit.audit.auditor.name}</span>
                audited
                <span className="font-bold text-slate-800 dark:text-slate-200">{audit.audit.agent.name}</span>
                {(() => {
                  const m = VERDICT_META[audit.audit.verdict]
                  const Icon = m.icon
                  return (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ color: m.color, background: `${m.color}14` }}>
                      <Icon size={11} /> {m.label}
                    </span>
                  )
                })()}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">{audit.audit.note}</p>
              <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                Trust updated:{' '}
                <span className="font-bold" style={{ color: trustColor(audit.updatedAgent.trustScore) }}>
                  {audit.updatedAgent.trustScore.toFixed(1)}
                </span>{' '}
                <span className="text-slate-300 dark:text-slate-600">(was {result.routedTo.trustScore.toFixed(1)})</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
