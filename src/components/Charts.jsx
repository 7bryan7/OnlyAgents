import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import { useContainerWidth } from '../hooks/useContainerWidth'
import { trustColor } from '../agentMeta'

const AXIS_TICK = { fontSize: 10, fill: '#94a3b8' }

function ChartTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs dark:bg-slate-900 dark:border-slate-700">
      <div className="text-slate-400 font-medium mb-1 dark:text-slate-500">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-slate-600 dark:text-slate-400">{p.name}:</span>
          <span className="font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
            {unit}
          </span>
        </div>
      ))}
    </div>
  )
}

function ChartFrame({ children, height }) {
  const [ref, width] = useContainerWidth()
  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {width > 10 ? children(width, height) : null}
    </div>
  )
}

export function TrustTrendChart({ data, height = 220 }) {
  return (
    <ChartFrame height={height}>
      {(w, h) => (
        <LineChart width={w} height={h} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--chart-axis)' }} interval={4} />
          <YAxis domain={[0, 100]} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip unit="" />} />
          <Line
            type="monotone"
            dataKey="value"
            name="Trust score"
            stroke="#3d6cec"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      )}
    </ChartFrame>
  )
}

export function CompletionAreaChart({ data, height = 220 }) {
  return (
    <ChartFrame height={height}>
      {(w, h) => (
        <AreaChart width={w} height={h} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="completionGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--chart-axis)' }} interval={4} />
          <YAxis domain={[0, 100]} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip unit="%" />} />
          <Area
            type="monotone"
            dataKey="value"
            name="Completion"
            stroke="#10b981"
            strokeWidth={2.5}
            fill="url(#completionGrad)"
          />
        </AreaChart>
      )}
    </ChartFrame>
  )
}

export function ResponseBarChart({ data, height = 220 }) {
  return (
    <ChartFrame height={height}>
      {(w, h) => (
        <BarChart width={w} height={h} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--chart-axis)' }} interval={4} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip unit="ms" />} cursor={{ fill: 'var(--chart-cursor)' }} />
          <Bar dataKey="value" name="Response time" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value > 70 ? '#ef4444' : d.value > 45 ? '#f59e0b' : '#8b5cf6'} />
            ))}
          </Bar>
        </BarChart>
      )}
    </ChartFrame>
  )
}

export function TrustDistributionChart({ agents, height = 220 }) {
  const buckets = [
    { range: '0–49', count: 0, color: '#ef4444' },
    { range: '50–59', count: 0, color: '#f97316' },
    { range: '60–69', count: 0, color: '#f59e0b' },
    { range: '70–79', count: 0, color: '#3d6cec' },
    { range: '80–89', count: 0, color: '#6366f1' },
    { range: '90–100', count: 0, color: '#10b981' },
  ]
  agents.forEach((a) => {
    const b = buckets.find(
      (x) => a.trustScore >= parseInt(x.range.split('–')[0]) && a.trustScore <= parseInt(x.range.split('–')[1])
    )
    if (b) b.count++
  })
  const data = buckets.map((b) => ({ name: b.range, count: b.count, color: b.color }))

  return (
    <ChartFrame height={height}>
      {(w, h) => (
        <BarChart width={w} height={h} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--chart-axis)' }} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip unit=" agents" />} cursor={{ fill: 'var(--chart-cursor)' }} />
          <Bar dataKey="count" name="Agents" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      )}
    </ChartFrame>
  )
}

export function AgentTrustSparkline({ agent, height = 60 }) {
  const data = agent.history.trust
  return (
    <ChartFrame height={height}>
      {(w, h) => (
        <LineChart width={w} height={h} data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={trustColor(agent.trustScore)}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      )}
    </ChartFrame>
  )
}