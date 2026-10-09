import { useNavigate } from 'react-router-dom'
import { Bot, CheckCircle2, AlertTriangle, XCircle, Clock, ArrowUpRight, Lock, BadgeCheck, Handshake } from 'lucide-react'
import { STATUS_META, trustColor, fmtMs } from '../agentMeta'
import { useData } from '../DataContext'

const STATUS_ICON = {
  active: CheckCircle2,
  degraded: AlertTriangle,
  stalled: XCircle,
  idle: Clock,
}

export default function AgentCard({ agent, compact = false, onHireClick }) {
  const navigate = useNavigate()
  const { config } = useData()
  const StatusIcon = STATUS_ICON[agent.status]
  const meta = STATUS_META[agent.status]
  const threshold = config.hireThreshold
  const gap = Math.max(0, threshold - agent.reputationScore)
  const progress = Math.min(100, threshold > 0 ? (agent.reputationScore / threshold) * 100 : 100)

  const handleHireClick = (e) => {
    e.stopPropagation()
    onHireClick?.(agent)
  }

  return (
    <div
      onClick={() => navigate(`/app/agents/${agent.id}`)}
      className="card-lift cursor-pointer bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:border-brand-300 dark:hover:border-brand-500/30"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
            style={{ background: agent.stage.color }}
          >
            <Bot size={19} />
          </div>
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100 leading-tight">{agent.name}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500">{agent.role}</div>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full"
          style={{ color: meta.color, background: meta.bg }}
        >
          <StatusIcon size={11} />
          {meta.label}
        </span>
      </div>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 min-h-[2rem]">{agent.description}</p>

      {/* Metrics */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric label="Reputation" value={agent.reputationScore.toFixed(0)} suffix="" color={trustColor(agent.reputationScore)} />
        <Metric label="Trust" value={agent.trustScore.toFixed(0)} suffix="" color={trustColor(agent.trustScore)} />
        <Metric label="Completion" value={agent.completionRate.toFixed(0)} suffix="%" color="#3d6cec" />
        <Metric label="Response" value={fmtMs(agent.avgResponseTime)} suffix="" color="#8b5cf6" />
      </div>

      {/* Tags */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {agent.tags.slice(0, compact ? 2 : 3).map((t) => (
          <span key={t} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium">
            {t}
          </span>
        ))}
        <span
          className="text-[10px] px-2 py-0.5 rounded-md font-medium"
          style={{ color: agent.stage.color, background: `${agent.stage.color}14` }}
        >
          {agent.stage.label}
        </span>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
        <span>{agent.tasksCompleted.toLocaleString()} tasks · {agent.auditsReceived} audits</span>
        <span className="inline-flex items-center gap-0.5 text-brand-600 dark:text-brand-400 font-medium">
          Details <ArrowUpRight size={12} />
        </span>
      </div>

      {/* Hire gate — reputation-gated marketplace (PRD v2) */}
      {agent.hireable ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-full">
            <BadgeCheck size={11} /> Hireable
          </span>
          <button
            onClick={handleHireClick}
            className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white transition-colors"
            title="Request this agent"
          >
            <Handshake size={12} />
            Hire
          </button>
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
          <div className="flex items-center justify-between text-[10px]">
            <span className="inline-flex items-center gap-1 font-semibold text-slate-500 dark:text-slate-400">
              <Lock size={10} /> Locked — needs {gap.toFixed(1)} more reputation
            </span>
            <span className="text-slate-400 dark:text-slate-500 tabular-nums">{agent.reputationScore.toFixed(0)}/{threshold}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, background: trustColor(agent.reputationScore) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, suffix, color }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wide text-slate-400 dark:text-slate-500 font-semibold">{label}</div>
      <div className="text-sm font-bold text-slate-800 dark:text-slate-200 tabular-nums" style={{ color }}>
        {value}
        {suffix}
      </div>
    </div>
  )
}