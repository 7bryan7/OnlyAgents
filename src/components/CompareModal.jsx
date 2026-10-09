import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Bot, ArrowUpRight, Trash2, Crown } from 'lucide-react'
import { STATUS_META, trustColor, fmtMs } from '../agentMeta'

/**
 * Side-by-side agent comparison modal.
 * Highlights the best value per metric (emerald + "Best" chip).
 */
export default function CompareModal({ agents, onClose, onRemove }) {
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (agents.length < 2) return null

  const best = {
    trust: Math.max(...agents.map((a) => a.trustScore)),
    completion: Math.max(...agents.map((a) => a.completionRate)),
    response: Math.min(...agents.map((a) => a.avgResponseTime)),
    price: Math.min(...agents.map((a) => a.pricePerTask)),
    tasks: Math.max(...agents.map((a) => a.tasksCompleted)),
    audits: Math.max(...agents.map((a) => a.auditsReceived)),
  }
  const maxResponse = Math.max(1, ...agents.map((a) => a.avgResponseTime))
  const maxPrice = Math.max(...agents.map((a) => a.pricePerTask))

  const rows = [
    {
      key: 'trust',
      label: 'Trust score',
      value: (a) => a.trustScore.toFixed(1),
      bar: (a) => a.trustScore,
      barMax: 100,
      barColor: (a) => trustColor(a.trustScore),
      isBest: (a) => a.trustScore === best.trust,
    },
    {
      key: 'completion',
      label: 'Completion rate',
      value: (a) => `${a.completionRate.toFixed(1)}%`,
      bar: (a) => a.completionRate,
      barMax: 100,
      barColor: () => '#3d6cec',
      isBest: (a) => a.completionRate === best.completion,
    },
    {
      key: 'response',
      label: 'Response time',
      value: (a) => fmtMs(a.avgResponseTime),
      bar: (a) => a.avgResponseTime,
      barMax: maxResponse,
      barColor: () => '#8b5cf6',
      isBest: (a) => a.avgResponseTime === best.response,
    },
    {
      key: 'price',
      label: 'Price / task',
      value: (a) => `$${a.pricePerTask.toFixed(2)}`,
      bar: (a) => a.pricePerTask,
      barMax: maxPrice,
      barColor: () => '#f59e0b',
      isBest: (a) => a.pricePerTask === best.price,
    },
    {
      key: 'tasks',
      label: 'Tasks completed',
      value: (a) => a.tasksCompleted.toLocaleString(),
      isBest: (a) => a.tasksCompleted === best.tasks,
    },
    {
      key: 'audits',
      label: 'Audits received',
      value: (a) => a.auditsReceived.toLocaleString(),
      isBest: (a) => a.auditsReceived === best.audits,
    },
  ]

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <Crown size={16} className="text-brand-600 dark:text-brand-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Agent comparison</h2>
            <span className="text-[10px] font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 px-2 py-0.5 rounded-full">
              {agents.length} agents
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Agent headers */}
          <div className="grid grid-cols-[110px_repeat(3,1fr)] sm:grid-cols-[140px_repeat(3,1fr)] gap-3 px-6 pt-5">
            <div />
            {agents.map((a) => {
              const meta = STATUS_META[a.status]
              return (
                <div key={a.id} className="text-center">
                  <div
                    className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center text-white"
                    style={{ background: a.stage.color }}
                  >
                    <Bot size={22} />
                  </div>
                  <div className="mt-2 font-bold text-slate-900 dark:text-slate-100 text-sm leading-tight">{a.name}</div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500">{a.role}</div>
                  <div className="mt-1.5 flex items-center justify-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ color: meta.color, background: meta.bg }}
                    >
                      {meta.label}
                    </span>
                    <span
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ color: a.stage.color, background: `${a.stage.color}14` }}
                    >
                      {a.stage.label}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3 min-h-[3rem]">
                    {a.description}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Metric rows */}
          <div className="px-6 py-4 space-y-1">
            {rows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[110px_repeat(3,1fr)] sm:grid-cols-[140px_repeat(3,1fr)] gap-3 items-center py-2.5 border-b border-slate-50 last:border-0"
              >
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{row.label}</div>
                {agents.map((a) => {
                  const isBest = row.isBest(a)
                  return (
                    <div key={a.id} className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span
                          className={`text-sm font-bold tabular-nums ${isBest ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}`}
                        >
                          {row.value(a)}
                        </span>
                        {isBest && (
                          <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 px-1 py-0.5 rounded-full">
                            <Crown size={8} /> Best
                          </span>
                        )}
                      </div>
                      {row.bar && (
                        <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.max(4, (row.bar(a) / row.barMax) * 100)}%`,
                              background: row.barColor(a),
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 flex flex-wrap items-center gap-2 shrink-0">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  onClose()
                  navigate(`/app/agents/${a.id}`)
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 transition-colors"
              >
                {a.name} <ArrowUpRight size={12} />
              </button>
              <button
                onClick={() => onRemove(a.id)}
                className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                title={`Remove ${a.name}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
            Best value per metric is highlighted in green
          </span>
        </div>
      </div>
    </div>
  )
}