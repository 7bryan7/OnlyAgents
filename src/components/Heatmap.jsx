import { useState } from 'react'

/**
 * Activity heatmap — 7 days x 24 hours.
 * Hover a cell to see the exact value; click to pin.
 */
export default function Heatmap({ data, title = 'Activity heatmap' }) {
  const [hovered, setHovered] = useState(null)
  const [pinned, setPinned] = useState(null)

  const max = Math.max(1, ...data.flatMap((row) => row.hours))
  const cellW = 100 / 24
  const cellH = 100 / 7

  const colorFor = (v) => {
    if (v >= 80) return '#1d4ed8'
    if (v >= 60) return '#3d6cec'
    if (v >= 40) return '#7ea2f2'
    if (v >= 20) return '#c0d4fb'
    return 'var(--heat-empty)'
  }

  const active = pinned || hovered

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
        <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
          <span>Low</span>
          {[0, 20, 40, 60, 80].map((v) => (
            <span key={v} className="w-3 h-3 rounded-sm" style={{ background: colorFor(v) }} />
          ))}
          <span>High</span>
        </div>
      </div>

      <div className="relative">
        <svg viewBox="0 0 100 100" className="w-full" style={{ aspectRatio: '100/100' }}>
          {data.map((row, ri) =>
            row.hours.map((v, hi) => {
              const key = `${ri}-${hi}`
              const isActive = active && active.key === key
              return (
                <rect
                  key={key}
                  x={hi * cellW}
                  y={ri * cellH}
                  width={cellW - 0.35}
                  height={cellH - 0.35}
                  rx={1.2}
                  fill={colorFor(v / max * 100)}
                  opacity={isActive ? 1 : 0.85}
                  stroke={isActive ? '#0f172a' : 'none'}
                  strokeWidth={isActive ? 0.5 : 0}
                  onMouseEnter={() => setHovered({ key, day: row.day, hour: hi, value: v })}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setPinned(isActive ? null : { key, day: row.day, hour: hi, value: v })}
                  style={{ cursor: 'pointer' }}
                />
              )
            })
          )}
        </svg>

        {active && (
          <div className="absolute top-2 right-2 bg-slate-900 text-white text-[11px] rounded-lg px-3 py-1.5 shadow-lg pointer-events-none">
            {active.day} · {String(active.hour).padStart(2, '0')}:00 —{' '}
            <span className="font-bold">{active.value} executions</span>
            {pinned && <span className="text-slate-400 dark:text-slate-500 ml-1">(pinned)</span>}
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
        <span>Mon</span>
        <span>Sun</span>
      </div>
    </div>
  )
}