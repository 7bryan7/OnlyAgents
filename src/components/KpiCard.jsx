import { useState } from 'react'
import { TrendingUp, TrendingDown, ArrowUpRight } from 'lucide-react'

/**
 * Interactive KPI card — click to cycle through metric detail modes.
 * Modes: value → delta → sparkline
 */
export default function KpiCard({ title, value, unit, delta, deltaLabel, spark, icon: Icon, accent = '#3d6cec', onClick, lowerIsBetter = false }) {
  const [mode, setMode] = useState(0)
  const modes = ['value', 'delta', 'spark']
  const up = delta >= 0
  const points = (spark || []).filter((v) => v != null)
  const min = Math.min(0, ...points)
  const range = Math.max(1, ...points) - min

  const cycle = () => {
    setMode((m) => (m + 1) % modes.length)
    onClick?.()
  }

  return (
    <button
      onClick={cycle}
      className="card-lift w-full text-left bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 group"
      title="Click to cycle: value → change → trend"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide">
          {Icon && <Icon size={14} style={{ color: accent }} />}
          {title}
        </div>
        <ArrowUpRight size={14} className="text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors" />
      </div>

      {mode === 0 && (
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value}</span>
          {unit && <span className="text-sm text-slate-400 dark:text-slate-500 font-medium">{unit}</span>}
        </div>
      )}

      {mode === 1 && (
        <div className="mt-3 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 text-sm font-bold tabular-nums ${
              (lowerIsBetter ? !up : up) ? 'text-emerald-600' : 'text-red-500'
            }`}
          >
            {up ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            {delta == null ? 'No prior data' : (up ? '+' : '') + delta + '%'}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">{deltaLabel}</span>
        </div>
      )}

      {mode === 2 && spark && (
        <div className="mt-3 h-10">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-full">
            <polyline
              points={points.map((v, i) => `${(i / Math.max(1, points.length - 1)) * 100},${40 - ((v - min) / range) * 38}`).join(' ')}
              fill="none"
              stroke={accent}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
        {mode === 0 ? 'Click for change' : mode === 1 ? 'Click for trend' : 'Click for value'}
      </div>
    </button>
  )
}
