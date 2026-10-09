import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Network, Activity, Zap, Bot, Play, Loader2, FileText, Clock, ChevronRight, CheckCircle2, XCircle } from 'lucide-react'
import NetworkGraph from '../components/NetworkGraph'
import { trustColor, STATUS_META } from '../agentMeta'
import { useData } from '../DataContext'
import { api } from '../api'

function timeAgo(ts) {
  if (!ts) return '—'
  const diff = Date.now() - ts
  if (diff < 60000) return `${Math.max(1, Math.round(diff / 1000))}s ago`
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`
  return `${Math.round(diff / 86400000)}d ago`
}

export default function Swarms() {
  const { swarms, agents, mode } = useData()
  const [params] = useSearchParams()
  const [selectedSwarm, setSelectedSwarm] = useState(params.get('swarm') || swarms[0]?.id)
  useEffect(() => { if (params.get('swarm')) setSelectedSwarm(params.get('swarm')) }, [params])
  const swarm = swarms.find((s) => s.id === selectedSwarm) || swarms[0]
  const members = swarm ? swarm.agents.map((id) => agents.find((a) => a.id === id)).filter(Boolean) : []

  // --- swarm analysis state ---
  const [task, setTask] = useState('')
  const [count, setCount] = useState(4)
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState(null)
  const [runs, setRuns] = useState([])
  const [error, setError] = useState('')

  const loadRuns = useCallback(async () => {
    try {
      const d = await api.swarmRuns()
      setRuns(d.runs || [])
    } catch {
      /* history is best-effort */
    }
  }, [])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  const analyze = async () => {
    if (!task.trim() || running) return
    setRunning(true)
    setError('')
    setRun(null)
    try {
      const d = await api.analyzeSwarm({ task: task.trim(), count })
      setRun(d.run)
      loadRuns()
    } catch (e) {
      setError(e.message || 'Swarm analysis failed')
    } finally {
      setRunning(false)
    }
  }

  const runAgents = run
    ? run.agentIds.map((id) => agents.find((a) => a.id === id)).filter(Boolean)
    : []

  if (!swarm) {
    return <div className="text-center py-24 text-slate-400 dark:text-slate-500 text-sm">Loading swarm data…</div>
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="font-sora text-2xl font-bold text-slate-900 dark:text-slate-100">Swarm Network</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Orchestrated agent groups with dynamic re-ranking driven by peer audits.
        </p>
      </div>

      {/* Swarm analysis — fan one task out to 3-5 agents in parallel */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center">
            <Zap size={15} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Swarm analysis</h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Fan one task out to {count} agents in parallel — each contributes, then the swarm merges a single report.
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g. Evaluate our onboarding flow for drop-off risks and propose fixes…"
            rows={2}
            maxLength={500}
            className="flex-1 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-brand-300 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-500/20 outline-none text-sm resize-none"
          />
          <div className="flex items-center gap-2">
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={running}
              className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-transparent outline-none text-sm font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-50"
              title="Number of agents in the fan-out"
            >
              {[3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} agents
                </option>
              ))}
            </select>
            <button
              onClick={analyze}
              disabled={!task.trim() || running || !['gemini', 'openai'].includes(mode)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              {running ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
        </div>
        {error && <div className="mt-3 text-xs text-red-500">{error}</div>}

        {/* Running progress */}
        {running && (
          <div className="mt-4 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 size={14} className="animate-spin text-brand-600" />
            {count} agents working in parallel — merging report…
          </div>
        )}

        {/* Result */}
        {run && !running && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                <CheckCircle2 size={13} className="text-emerald-500" />
                {run.id} · {run.results.filter((r) => r.success).length}/{run.results.length} contributors ·{' '}
                {timeAgo(run.finishedAt)}
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                {run.status === 'failed' ? 'Analysis failed' : 'merged report'}
              </span>
            </div>

            {run.error && <p role="alert" className="text-amber-600">{run.error}</p>}
            {run.synthesis && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 p-4">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                  <FileText size={12} /> Merged report
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {run.synthesis}
                </div>
              </div>
            )}

            {/* Per-agent contributions */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {run.results.map((r) => {
                const agent = runAgents.find((a) => a.id === r.agentId)
                return (
                  <div
                    key={r.agentId}
                    className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                          {(agent?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {agent?.name || r.agentId}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{agent?.role}</div>
                        </div>
                      </div>
                      {r.success ? (
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle size={14} className="text-red-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-4">
                      {r.output || r.error || 'No output'}
                    </p>
                    <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                      {(r.latencyMs / 1000).toFixed(1)}s
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Swarm selector cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {swarms.map((s) => {
          const isSel = s.id === selectedSwarm
          const healthColor = s.health >= 85 ? '#10b981' : s.health >= 75 ? '#f59e0b' : '#ef4444'
          return (
            <button
              key={s.id}
              onClick={() => setSelectedSwarm(s.id)}
              className={`card-lift text-left bg-white dark:bg-slate-900 rounded-2xl border-2 p-5 transition-colors ${
                isSel ? 'border-brand-500' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isSel ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                    <Network size={17} />
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{s.name}</div>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ color: healthColor, background: `${healthColor}14` }}>
                  {s.health}% health
                </span>
              </div>
              <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{s.description}</p>
              <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-400 dark:text-slate-500">
                <span className="inline-flex items-center gap-1"><Bot size={12} /> {s.agents.length} agents</span>
                <span className="inline-flex items-center gap-1"><Zap size={12} /> {s.throughput} tasks/24h</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Network + members */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{swarm.name} — topology</h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">Double-click a node to open its profile</span>
          </div>
          <NetworkGraph height={480} />
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Swarm members — ranked by trust</h3>
          <div className="space-y-2">
            {[...members]
              .sort((a, b) => b.trustScore - a.trustScore)
              .map((a, i) => {
                const meta = STATUS_META[a.status]
                return (
                  <Link
                    key={a.id}
                    to={`/app/agents/${a.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{a.name}</div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500">{a.role}</div>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: meta.color, background: meta.bg }}>
                        {meta.label}
                      </span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: trustColor(a.trustScore) }}>
                        {a.trustScore.toFixed(0)}
                      </span>
                    </div>
                  </Link>
                )
              })}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Swarm metrics</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
                <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Avg trust</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {(members.reduce((s, a) => s + a.trustScore, 0) / members.length).toFixed(1)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
                <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Avg completion</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {(members.reduce((s, a) => s + a.completionRate, 0) / members.length).toFixed(1)}%
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
                <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Avg response</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {(members.reduce((s, a) => s + a.avgResponseTime, 0) / members.length / 1000).toFixed(2)}s
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
                <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Audits today</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {members.reduce((s, a) => s + a.auditsReceived, 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Re-ranking explainer */}
      <div className="bg-gradient-to-r from-brand-600 to-brand-800 rounded-2xl p-6 text-white flex flex-wrap items-center gap-6">
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 font-semibold mb-1">
            <Activity size={16} />
            Dynamic re-ranking in action
          </div>
          <p className="text-sm text-brand-100 leading-relaxed">
            When a member&apos;s trust drops below threshold (e.g. repeated failed audits), the orchestrator
            automatically re-ranks the swarm and routes tasks to the next-best agent — no hardcoded routing.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white/10 rounded-xl px-4 py-3 text-center">
            <div className="text-2xl font-bold tabular-nums">{swarm.agents.length}</div>
            <div className="text-[10px] text-brand-200 uppercase">agents</div>
          </div>
          <div className="bg-white/10 rounded-xl px-4 py-3 text-center">
            <div className="text-2xl font-bold tabular-nums">{swarm.health}%</div>
            <div className="text-[10px] text-brand-200 uppercase">health</div>
          </div>
          <div className="bg-white/10 rounded-xl px-4 py-3 text-center">
            <div className="text-2xl font-bold tabular-nums">{swarm.throughput}</div>
            <div className="text-[10px] text-brand-200 uppercase">tasks/24h</div>
          </div>
        </div>
      </div>

      {/* Analysis history */}
      {runs.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Recent analyses</h3>
          </div>
          <div className="space-y-1.5">
            {runs.slice(0, 6).map((r) => (
              <button
                key={r.id}
                onClick={() => setRun(r)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{r.task}</div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500">
                    {r.id} · {r.agents.length} agents · {r.results.filter((x) => x.success).length} ok · {timeAgo(r.startedAt)}
                  </div>
                </div>
                <ChevronRight size={15} className="text-slate-300 dark:text-slate-600 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
