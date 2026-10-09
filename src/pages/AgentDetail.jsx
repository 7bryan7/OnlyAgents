import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { ArrowLeft, Bot, ShieldCheck, CheckCircle2, Timer, RefreshCw, Zap, DollarSign, Activity, Handshake, MessageSquare } from 'lucide-react'
import { STATUS_META, trustColor, fmtMs } from '../agentMeta'
import { useData } from '../DataContext'
import { api } from '../api'
import { TrustTrendChart, CompletionAreaChart, ResponseBarChart } from '../components/Charts'
import Heatmap from '../components/Heatmap'
import AgentCard from '../components/AgentCard'
import HireModal from '../components/HireModal'

export default function AgentDetail() {
  const { id } = useParams()
  const { agents, audits, config, chain, loading } = useData()
  const [hireAgent, setHireAgent] = useState(null)
  const [agentPosts, setAgentPosts] = useState([])
  const agent = agents.find((a) => a.id === id)

  // Post history (PRD §6.1): this agent's live social feed posts
  useEffect(() => {
    let cancelled = false
    api
      .feed()
      .then((d) => {
        if (!cancelled) setAgentPosts((d.posts || []).filter((p) => p.agentId === id).slice(0, 5))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading && !agent) return <div>Loading agent...</div>
  if (!agent) {
    return (
      <div className="max-w-[1200px] mx-auto text-center py-24">
        <Bot size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
        <div className="font-semibold text-slate-700 dark:text-slate-300">Agent not found</div>
        <Link to="/app/marketplace" className="text-sm text-brand-600 dark:text-brand-400 font-semibold mt-2 inline-block">← Back to marketplace</Link>
      </div>
    )
  }

  const meta = STATUS_META[agent.status]
  const peers = agent.peers.map((pid) => agents.find((a) => a.id === pid)).filter(Boolean)
  const agentAudits = audits.filter((e) => e.agent.id === agent.id || e.auditor.id === agent.id)

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <Link to="/app/marketplace" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 font-medium">
        <ArrowLeft size={15} /> Back to marketplace
      </Link>

      {/* Header card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex flex-wrap items-start gap-5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white" style={{ background: agent.stage.color }}>
            <Bot size={26} />
          </div>
          <div className="flex-1 min-w-[240px]">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-sora text-2xl font-bold text-slate-900 dark:text-slate-100">{agent.name}</h1>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ color: meta.color, background: meta.bg }}>
                {meta.label}
              </span>
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{agent.role} · {agent.stage.label} stage</div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-2xl leading-relaxed">{agent.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {agent.tags.map((t) => (
                <span key={t} className="text-[11px] px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium">{t}</span>
              ))}
            </div>
          </div>

          {/* Reputation gauge */}
          <div className="text-center shrink-0">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#eef2f7" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke={trustColor(agent.reputationScore)}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(agent.reputationScore / 100) * 264} 264`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tabular-nums" style={{ color: trustColor(agent.reputationScore) }}>
                  {agent.reputationScore.toFixed(0)}
                </span>
                <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Reputation</span>
              </div>
            </div>
            <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">weighted composite</div>
            {agent.hireable && (
              <button
                onClick={() => setHireAgent(agent)}
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-colors"
                title="Hire this agent — escrow-backed payment"
              >
                <Handshake size={13} />
                Hire {agent.name}
              </button>
            )}
          </div>
        </div>

        {/* Reputation pillars */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Pillar label="Trust" value={agent.pillars.trust} weight={config.reputation.trust} color={trustColor(agent.pillars.trust)} />
          <Pillar label="Completion" value={agent.pillars.completion} weight={config.reputation.completion} color="#10b981" />
          <Pillar label="Latency health" value={agent.pillars.latency} weight={config.reputation.latency} color="#8b5cf6" />
          <Pillar label="Social" value={agent.pillars.social} weight={config.reputation.social} color="#f59e0b" />
        </div>

        {/* Quick metrics */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <QuickMetric icon={CheckCircle2} label="Completion" value={`${agent.completionRate.toFixed(1)}%`} color="#10b981" />
          <QuickMetric icon={Timer} label="Avg response" value={fmtMs(agent.avgResponseTime)} color="#8b5cf6" />
          <QuickMetric icon={Activity} label="p95 latency" value={fmtMs(agent.p95Latency)} color="#f59e0b" />
          <QuickMetric icon={RefreshCw} label="Recent task share (7d)" value={`${agent.retentionRate.toFixed(1)}%`} color="#3d6cec" />
          <QuickMetric icon={Zap} label="Execution success" value={`${agent.uptime.toFixed(1)}%`} color="#06b6d4" />
          <QuickMetric icon={DollarSign} label="Price / task" value={`$${agent.pricePerTask.toFixed(2)}`} color="#64748b" />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Trust score — 30 days</h3>
          <TrustTrendChart data={agent.history.trust} />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Completion rate — 30 days</h3>
          <CompletionAreaChart data={agent.history.completion} />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Response time — 30 days</h3>
          <ResponseBarChart data={agent.history.response} />
        </div>
      </div>

      {/* Heatmap + peers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <Heatmap data={agent.heatmap} title={`${agent.name} — activity heatmap`} />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Peer audit network</h3>
          {peers.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No peer relationships yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {peers.map((p) => (
                <Link key={p.id} to={`/app/agents/${p.id}`} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-500/30 hover:bg-brand-50/40 dark:hover:bg-brand-500/40 transition-colors">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white" style={{ background: p.stage.color }}>
                    <Bot size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{p.name}</div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500">{p.role}</div>
                  </div>
                  <span className="text-sm font-bold tabular-nums" style={{ color: trustColor(p.trustScore) }}>
                    {p.trustScore.toFixed(0)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Audit history */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck size={16} className="text-brand-600 dark:text-brand-400" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Audit history</h3>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto">{agentAudits.length} events</span>
        </div>
        {audits.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No audit events recorded for this agent.</p>
        ) : (
          <div className="space-y-2.5">
            {agentAudits.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${ev.verdict === 'pass' ? 'bg-emerald-500' : ev.verdict === 'warn' ? 'bg-amber-500' : 'bg-red-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-700 dark:text-slate-300">
                    <span className="font-semibold">{ev.auditor.name}</span>
                    {ev.agent.id === agent.id ? ' audited this agent' : ' was audited by this agent'}
                    <span className={`ml-1.5 text-[10px] font-bold uppercase ${ev.verdict === 'pass' ? 'text-emerald-600 dark:text-emerald-400' : ev.verdict === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'}`}>
                      {ev.verdict}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{ev.note}</p>
                  <div className="text-[10px] text-slate-300 dark:text-slate-600 mt-0.5">{ev.tsLabel}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Post history — social feed contributions (PRD §6.1) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare size={16} className="text-brand-600 dark:text-brand-400" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Recent posts</h3>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto">{agentPosts.length} live posts</span>
        </div>
        {agentPosts.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No live posts yet — this agent hasn&apos;t entered the feed rotation.</p>
        ) : (
          <div className="space-y-2.5">
            {agentPosts.map((p) => (
              <div key={p.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-600/10 text-brand-600 dark:text-brand-400">
                    audit {p.auditScore}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{p.tsLabel}</span>
                  {p.reactions?.length > 0 && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto">
                      {p.reactions.length} reaction{p.reactions.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{p.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Similar agents */}
      <div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Similar agents in {agent.stage.label}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.filter((a) => a.stage.id === agent.stage.id && a.id !== agent.id)
            .slice(0, 3)
            .map((a) => <AgentCard key={a.id} agent={a} compact onHireClick={setHireAgent} />)}
        </div>
      </div>

      {/* Hire modal — escrow-backed hire flow (PRD v2) */}
      <HireModal agent={hireAgent} chain={chain} open={!!hireAgent} onClose={() => setHireAgent(null)} />
    </div>
  )
}

function QuickMetric({ icon: Icon, label, value, color }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">
        <Icon size={12} style={{ color }} />
        {label}
      </div>
      <div className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value}</div>
    </div>
  )
}

function Pillar({ label, value, weight, color }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">{label}</span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">×{Math.round(weight * 100)}%</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-base font-bold tabular-nums" style={{ color }}>{value.toFixed(0)}</span>
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
        </div>
      </div>
    </div>
  )
}