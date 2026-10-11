import { useCallback, useEffect, useState } from 'react'
import { Zap, Play, Loader2, FileText, Clock, ChevronRight, CheckCircle2, XCircle } from 'lucide-react'
import NetworkGraph from '../components/NetworkGraph'
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
  const { agents, mode, loading } = useData()
  // --- swarm analysis state ---
  const [task, setTask] = useState('')
  const [count, setCount] = useState(4)
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState(null)
  const [runs, setRuns] = useState([])
  const [error, setError] = useState('')
  const [workspace, setWorkspace] = useState('public')
  const [selectedAgentIds, setSelectedAgentIds] = useState([])
  const selectedAgents = agents.filter((agent) => selectedAgentIds.includes(agent.id))
  const customSelectionValid = selectedAgentIds.length === 0 || (selectedAgentIds.length >= 3 && selectedAgents.length === selectedAgentIds.length && selectedAgents.every((agent) => agent.status !== 'stalled'))
  const contributorCount = selectedAgentIds.length || count
  const toggleAgent = (id) => setSelectedAgentIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : ids.length < 5 ? [...ids, id] : ids)

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
    if (!task.trim() || running || !customSelectionValid) return
    setRunning(true)
    setError('')
    setRun(null)
    try {
      const d = await api.analyzeSwarm({ task: task.trim(), count: contributorCount, ...(selectedAgentIds.length ? { agentIds: selectedAgentIds } : {}) })
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

  if (loading) {
    return <div className="text-center py-24 text-slate-400 dark:text-slate-500 text-sm">Loading swarm data…</div>
  }

  return (
    <div className="ui-section swarms-section max-w-[1452px] mx-auto space-y-6">
      <div>
        <span className="ui-eyebrow">Connected intelligence</span>
          <h1 className="font-sora text-2xl font-bold text-slate-900 dark:text-slate-100">Swarm Network</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Recorded peer relationships across the fleet, with private analyses using your chosen agents.
        </p>
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
        <button onClick={() => setWorkspace('public')} aria-pressed={workspace === 'public'} className={`px-4 py-2 rounded-lg text-xs font-semibold ${workspace === 'public' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>Public network</button>
        <button onClick={() => setWorkspace('private')} aria-pressed={workspace === 'private'} className={`px-4 py-2 rounded-lg text-xs font-semibold ${workspace === 'private' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>My private analyses</button>
      </div>

      {/* Swarm analysis — fan one task out to 3-5 agents in parallel */}
      {workspace === 'private' && <div className="ui-panel bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center">
            <Zap size={15} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Swarm analysis</h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Fan one task out to {contributorCount} agents in parallel — each contributes, then the swarm merges a single report.
            </p>
          </div>
        </div>

        <fieldset disabled={running} className="mb-4 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-200">Choose swarm agents</legend>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <button type="button" onClick={() => setSelectedAgentIds([])} disabled={!selectedAgentIds.length || running} className="text-xs font-semibold text-brand-600 dark:text-brand-400 disabled:opacity-40">Use automatic selection</button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Choose 3–5 available agents, including your custom agents, or leave the selection empty for automatic selection.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {agents.map((agent) => (
              <label key={agent.id} className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${selectedAgentIds.includes(agent.id) ? 'border-brand-300 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10' : 'border-slate-100 dark:border-slate-800'}`}>
                <input type="checkbox" className="mt-1 accent-brand-600" checked={selectedAgentIds.includes(agent.id)} onChange={() => toggleAgent(agent.id)} disabled={running || (agent.status === 'stalled' && !selectedAgentIds.includes(agent.id)) || (!selectedAgentIds.includes(agent.id) && selectedAgentIds.length >= 5)} />
                <span className="min-w-0"><span className="block font-medium text-slate-800 dark:text-slate-200">{agent.name}</span><span className="block text-xs text-slate-500 dark:text-slate-400">{agent.role}{agent.isCustomAgent ? ' · Custom agent' : ''}{agent.status === 'stalled' ? ' · Unavailable' : ''}</span></span>
              </label>
            ))}
          </div>
          <p aria-live="polite" className="mt-3 text-xs text-slate-500 dark:text-slate-400">{selectedAgentIds.length ? `${selectedAgentIds.length}/5 selected${customSelectionValid ? '' : ' — select 3–5 available agents to analyze'}` : `Automatic selection: ${count} agents`}</p>
        </fieldset>

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
              aria-label="Automatic swarm size"
              value={selectedAgentIds.length >= 3 ? contributorCount : count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={running || selectedAgentIds.length > 0}
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
              disabled={!task.trim() || running || !customSelectionValid || mode !== 'gemini'}
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
            {contributorCount} agents working in parallel — merging report…
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
                    className="ui-panel rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5"
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
      </div>}

      {workspace === 'public' && <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ['Registered agents', agents.length],
            ['Active agents', agents.filter((agent) => agent.status === 'active').length],
            ['Recorded executions', agents.reduce((total, agent) => total + agent.executionsCount, 0)],
            ['Peer audits', agents.reduce((total, agent) => total + agent.auditsReceived, 0)],
          ].map(([label, value]) => <div key={label} className="ui-stat rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"><div className="text-xs text-slate-500 dark:text-slate-400">{label}</div><div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value}</div></div>)}
        </div>
        <div className="ui-panel bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Public peer-audit network</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">All agents · Recorded audit relationships</span>
          </div>
          <div className="ui-network-canvas"><NetworkGraph height={560} /></div>
        </div>
      </div>}

      {/* Analysis history */}
      {workspace === 'private' && runs.length > 0 && (
        <div className="ui-panel bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
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
