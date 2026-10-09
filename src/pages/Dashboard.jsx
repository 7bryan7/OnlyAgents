import { fleetHistory, periodValue, periodChange } from '../fleetMetrics'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck, CheckCircle2, Timer, RefreshCw, Bot, ArrowRight,
} from 'lucide-react'
import KpiCard from '../components/KpiCard'
import AgentCard from '../components/AgentCard'
import Heatmap from '../components/Heatmap'
import NetworkGraph from '../components/NetworkGraph'
import TaskRunner from '../components/TaskRunner'
import { TrustTrendChart, CompletionAreaChart, ResponseBarChart, TrustDistributionChart } from '../components/Charts'
import { STATUS_META, trustColor } from '../agentMeta'
import { useData } from '../DataContext'

export default function Dashboard() {
  const [timeRange, setTimeRange] = useState('7d')
  const { agents, audits } = useData()

  const stats = useMemo(() => {
    if (agents.length === 0) return null
    const active = agents.filter((a) => a.status === 'active').length
    const degraded = agents.filter((a) => a.status === 'degraded').length
    const stalled = agents.filter((a) => a.status === 'stalled').length
    const avgTrust = agents.reduce((s, a) => s + a.trustScore, 0) / agents.length
    const avgResp = agents.reduce((s, a) => s + a.avgResponseTime, 0) / agents.length
    const avgCompletion = agents.reduce((s, a) => s + a.completionRate, 0) / agents.length
    const totalTasks = agents.reduce((s, a) => s + a.tasksCompleted, 0)
    const topAgents = [...agents].sort((a, b) => b.trustScore - a.trustScore).slice(0, 4)
    return { active, degraded, stalled, avgTrust, avgResp, avgCompletion, totalTasks, topAgents }
  }, [agents])

  if (!stats) {
    return <div className="text-center py-24 text-slate-400 dark:text-slate-500 text-sm">Loading reputation data…</div>
  }

  const days = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : 30
  const history = Object.fromEntries(['trust', 'completion', 'response', 'tasks'].map((metric) => [metric, fleetHistory(agents, metric)]))
  const period = Object.fromEntries(Object.entries(history).map(([key, values]) => [key, values.slice(-days)]))
  const value = (key) => periodValue(period[key], key)
  const display = (key, divisor = 1) => value(key) == null ? 'No data' : (value(key) / divisor).toFixed(1)
  const spark = period.trust.map((p) => p.value)
  const heatmap = agents[0].heatmap.map((row, i) => ({ day: row.day, hours: row.hours.map((_, h) => agents.reduce((sum, a) => sum + a.heatmap[i].hours[h], 0)) }))

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-sora text-2xl font-bold text-slate-900 dark:text-slate-100">Reputation Overview</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Recorded task and peer-review metrics across {agents.length} configured agents.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-1">
          {['24h', '7d', '30d'].map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                timeRange === r ? 'bg-brand-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Avg Trust Score"
          value={display('trust')}
          unit="/100"
          delta={periodChange(history.trust, 'trust', days)}
          deltaLabel="vs previous period"
          spark={spark}
          icon={ShieldCheck}
          accent="#3d6cec"
        />
        <KpiCard
          title="Avg Completion"
          value={display('completion')}
          unit="%"
          delta={periodChange(history.completion, 'completion', days)}
          deltaLabel="vs previous period"
          spark={period.completion.map((d) => d.value)}
          icon={CheckCircle2}
          accent="#10b981"
        />
        <KpiCard
          title="Avg Response"
          lowerIsBetter
          value={display('response', 1000)}
          unit="s"
          delta={periodChange(history.response, 'response', days)}
          deltaLabel="vs previous period"
          spark={period.response.map((d) => d.value)}
          icon={Timer}
          accent="#8b5cf6"
        />
        <KpiCard
          title="Tasks Completed"
          value={value('tasks').toLocaleString()}
          unit=""
          delta={periodChange(history.tasks, 'tasks', days)}
          deltaLabel="vs previous period"
          spark={period.tasks.map((d) => d.value)}
          icon={RefreshCw}
          accent="#f59e0b"
        />
      </div>

      {/* Fleet status strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(STATUS_META).map(([key, meta]) => {
          const count = key === 'active' ? stats.active : key === 'degraded' ? stats.degraded : key === 'stalled' ? stats.stalled : agents.filter((a) => a.status === 'idle').length
          return (
            <div key={key} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} />
              <div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-none">{count}</div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 font-medium capitalize">{key}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Trust trend — fleet average</h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">{timeRange}</span>
          </div>
          <TrustTrendChart data={period.trust} />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Completion rate — fleet average</h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">{timeRange}</span>
          </div>
          <CompletionAreaChart data={period.completion} />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Response time — fleet average</h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">{timeRange}</span>
          </div>
          <ResponseBarChart data={period.response} />
        </div>
      </div>

      {/* Network + heatmap */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Swarm topology & peer audits</h3>
            <Link to="/app/swarms" className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 inline-flex items-center gap-1">
              Explore swarms <ArrowRight size={12} />
            </Link>
          </div>
          <NetworkGraph height={420} />
        </div>
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <Heatmap data={heatmap} title="Fleet activity — 7 days × 24h" />
          </div>
          <TaskRunner />
        </div>
      </div>

      {/* Bottom row: distribution + top agents + audit feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Trust distribution</h3>
          <TrustDistributionChart agents={agents} />
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Top trusted agents</h3>
            <Link to="/app/marketplace" className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 inline-flex items-center gap-1">
              Marketplace <ArrowRight size={12} />
            </Link>
          </div>
          <div className="space-y-2.5">
            {stats.topAgents.map((a, i) => (
              <Link
                key={a.id}
                to={`/app/agents/${a.id}`}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: a.stage.color }}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{a.name}</div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500">{a.role}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold tabular-nums" style={{ color: trustColor(a.trustScore) }}>
                    {a.trustScore.toFixed(0)}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500">trust</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Live audit feed</h3>
            <Link to="/app/audits" className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 inline-flex items-center gap-1">
              Ledger <ArrowRight size={12} />
            </Link>
          </div>
          <div className="space-y-3">
            {audits.slice(0, 5).map((ev) => (
              <div key={ev.id} className="flex gap-2.5">
                <span
                  className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${
                    ev.verdict === 'pass' ? 'bg-emerald-500' : ev.verdict === 'warn' ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-xs text-slate-700 dark:text-slate-300 leading-snug">
                    <span className="font-semibold">{ev.auditor.name}</span> audited{' '}
                    <span className="font-semibold">{ev.agent.name}</span>
                    <span className={`ml-1 text-[10px] font-bold uppercase ${ev.verdict === 'pass' ? 'text-emerald-600' : ev.verdict === 'warn' ? 'text-amber-600' : 'text-red-500'}`}>
                      {ev.verdict}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{ev.note}</div>
                  <div className="text-[10px] text-slate-300 dark:text-slate-600">{ev.tsLabel}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Featured agents */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2">
            <Bot size={15} className="text-brand-600 dark:text-brand-400" /> Featured agents
          </h3>
          <Link to="/app/marketplace" className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300">
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.topAgents.map((a) => (
            <AgentCard key={a.id} agent={a} compact />
          ))}
        </div>
      </div>
    </div>
  )
}
