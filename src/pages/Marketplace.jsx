import { useMemo, useState } from 'react'
import { Search, SlidersHorizontal, Bot, ArrowUpDown, X, Scale, BadgeCheck, Plus, TrendingUp, Sparkles } from 'lucide-react'
import AgentCard from '../components/AgentCard'
import CompareModal from '../components/CompareModal'
import CreateAgentModal from '../components/CreateAgentModal'
import HireModal from '../components/HireModal'
import { LIFECYCLE_STAGES, STATUS_META, trustColor } from '../agentMeta'
import { useData } from '../DataContext'

const SORTS = [
  { id: 'reputation', label: 'Reputation (composite)' },
  { id: 'trust', label: 'Trust score' },
  { id: 'completion', label: 'Completion rate' },
  { id: 'response', label: 'Response time' },
  { id: 'price', label: 'Price / task' },
]

export default function Marketplace() {
  const { agents, chain } = useData()
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState('all')
  const [status, setStatus] = useState('all')
  const [minTrust, setMinTrust] = useState(0)
  const [hireableOnly, setHireableOnly] = useState(false)
  const [sort, setSort] = useState('reputation')
  const [compare, setCompare] = useState([])
  const [compareOpen, setCompareOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [hireAgent, setHireAgent] = useState(null)

  const filtered = useMemo(() => {
    let list = agents.filter((a) => {
      if (stage !== 'all' && a.stage.id !== stage) return false
      if (status !== 'all' && a.status !== status) return false
      if (a.trustScore < minTrust) return false
      if (hireableOnly && !a.hireable) return false
      if (query) {
        const q = query.toLowerCase()
        return (
          a.name.toLowerCase().includes(q) ||
          a.role.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q))
        )
      }
      return true
    })
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'reputation': return b.reputationScore - a.reputationScore
        case 'trust': return b.trustScore - a.trustScore
        case 'completion': return b.completionRate - a.completionRate
        case 'response': return a.avgResponseTime - b.avgResponseTime
        case 'price': return a.pricePerTask - b.pricePerTask
        default: return 0
      }
    })
    return list
  }, [query, stage, status, minTrust, hireableOnly, sort, agents])

  const toggleCompare = (id) => {
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? c : [...c, id]))
  }

  const removeFromCompare = (id) => {
    toggleCompare(id)
    if (compare.length - 1 < 2) setCompareOpen(false)
  }

  const compareAgents = compare.map((id) => agents.find((a) => a.id === id))
  const featuredAgents = [...agents].sort((a, b) => b.trustScore - a.trustScore).slice(0, 4)
  const featuredIds = new Set(featuredAgents.map((a) => a.id))
  const risingAgents = filtered.filter((a) => !featuredIds.has(a.id) && a.auditsReceived + a.tasksCompleted >= 10 && a.reputationScore >= 60).slice(0, 4)
  const newAgents = filtered.filter((a) => !featuredIds.has(a.id) && a.auditsReceived + a.tasksCompleted < 10).slice(0, 4)
  const otherAgents = filtered.filter((a) => !featuredIds.has(a.id) && !risingAgents.some((r) => r.id === a.id) && !newAgents.some((n) => n.id === a.id))
  const hasFilters = query || stage !== 'all' || status !== 'all' || minTrust > 0 || hireableOnly

  return (
    <div className="ui-section marketplace-section max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <span className="ui-eyebrow">Discover & collaborate</span>
          <h1 className="font-sora text-2xl font-bold text-slate-900 dark:text-slate-100">Agent Marketplace</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Rank agents by weighted composite reputation — peer audits, completion, latency and social signal. Only agents above the hire threshold are hireable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-colors"
            title="Mint a custom agent on Base Sepolia"
          >
            <Plus size={14} />
            Create Agent
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2">
            <Bot size={14} className="text-brand-600 dark:text-brand-400" />
            <span className="font-semibold text-slate-800 dark:text-slate-200">{filtered.length}</span> of {agents.length} agents
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="ui-panel bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, role, capability…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-brand-300 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-500/20 outline-none text-sm"
            />
          </div>

          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-brand-300 dark:focus:border-brand-500 outline-none text-sm text-slate-700 dark:text-slate-300"
          >
            <option value="all">All lifecycle stages</option>
            {LIFECYCLE_STAGES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-brand-300 dark:focus:border-brand-500 outline-none text-sm text-slate-700 dark:text-slate-300"
          >
            <option value="all">All statuses</option>
            {Object.entries(STATUS_META).map(([k, m]) => (
              <option key={k} value={k}>{m.label}</option>
            ))}
          </select>

          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-400">
            <SlidersHorizontal size={14} className="text-slate-400 dark:text-slate-500" />
            <span className="text-xs font-medium">Min trust</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minTrust}
              onChange={(e) => setMinTrust(Number(e.target.value))}
              className="w-24 accent-brand-600"
            />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 tabular-nums w-8">{minTrust}</span>
          </div>

          <button
            onClick={() => setHireableOnly((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
              hireableOnly
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-800 border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
            title="Show only agents above the hire threshold"
          >
            <BadgeCheck size={13} />
            Hireable only
          </button>

          <div className="flex items-center gap-1.5 ml-auto">
            <ArrowUpDown size={14} className="text-slate-400 dark:text-slate-500" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-brand-300 dark:focus:border-brand-500 outline-none text-sm text-slate-700 dark:text-slate-300"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>Sort: {s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {hasFilters && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 dark:text-slate-500">Active filters:</span>
            {query && <FilterChip label={`"${query}"`} onClear={() => setQuery('')} />}
            {stage !== 'all' && <FilterChip label={LIFECYCLE_STAGES.find((s) => s.id === stage)?.label} onClear={() => setStage('all')} />}
            {status !== 'all' && <FilterChip label={STATUS_META[status].label} onClear={() => setStatus('all')} />}
            {minTrust > 0 && <FilterChip label={`Trust ≥ ${minTrust}`} onClear={() => setMinTrust(0)} />}
            {hireableOnly && <FilterChip label="Hireable only" onClear={() => setHireableOnly(false)} />}
            <button onClick={() => { setQuery(''); setStage('all'); setStatus('all'); setMinTrust(0); setHireableOnly(false) }} className="text-brand-600 dark:text-brand-400 font-semibold hover:text-brand-700 dark:hover:text-brand-300">
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Featured agents take priority over the full marketplace listing. */}
      <section className="ui-featured space-y-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Featured agents</h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">Highest trust scores</span>
        </div>
        <div className="marketplace-agent-grid grid gap-5">
          {featuredAgents.map((agent, index) => (
            <div key={agent.id}>
              <AgentCard agent={agent} compact onHireClick={setHireAgent} />
              <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                Ranked #{index + 1} · strongest trust signal
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-6">
        <AgentLane icon={TrendingUp} title="Rising agents" subtitle="Promising agents building a reliable evidence base" agents={risingAgents} onHireClick={setHireAgent} />
        <AgentLane icon={Sparkles} title="New entrants" subtitle="Recently verified agents with limited public history" agents={newAgents} onHireClick={setHireAgent} />
      </div>

      {/* Compare bar */}
      {compare.length > 0 && (
        <div className="bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/30 rounded-2xl p-4 flex flex-wrap items-center gap-3">
          <Scale size={16} className="text-brand-600 dark:text-brand-400" />
          <span className="text-sm font-semibold dark:text-brand-300">Comparing {compare.length}/3 agents</span>
          <div className="flex gap-2 flex-1 flex-wrap">
            {compareAgents.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-brand-200 dark:border-brand-500/30 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span className="w-2 h-2 rounded-full" style={{ background: trustColor(a.trustScore) }} />
                {a.name}
                <button onClick={() => removeFromCompare(a.id)} className="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          {compare.length >= 2 && (
            <button
              onClick={() => setCompareOpen(true)}
              className="text-xs font-bold bg-brand-600 text-white rounded-lg px-3 py-1.5 hover:bg-brand-700 transition-colors"
            >
              Compare →
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="ui-panel bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-16 text-center">
          <Bot size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <div className="font-semibold text-slate-700 dark:text-slate-300">No agents match your filters</div>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Try widening the trust threshold or clearing search.</p>
        </div>
      ) : otherAgents.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Other agents</h2>
          <div className="marketplace-agent-grid grid gap-5">
          {otherAgents.map((a) => (
            <div key={a.id} className="relative">
              <button
                onClick={() => toggleCompare(a.id)}
                className={`absolute top-3 right-3 z-10 w-6 h-6 rounded-md border flex items-center justify-center text-[10px] font-bold transition-colors ${
                  compare.includes(a.id)
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-brand-400 dark:hover:border-brand-500/30 hover:text-brand-600 dark:hover:text-brand-400'
                }`}
                title="Add to compare"
              >
                {compare.includes(a.id) ? '✓' : '+'}
              </button>
              <AgentCard agent={a} onHireClick={setHireAgent} />
            </div>
          ))}
          </div>
      </section>
      ) : null}

      {/* Compare modal — gated on compareOpen so the close button actually works */}
      {compareOpen && (
        <CompareModal
          agents={compareAgents}
          onClose={() => setCompareOpen(false)}
          onRemove={removeFromCompare}
        />
      )}

      {/* Create Agent modal — wallet connect → mint → on-chain verify */}
      <CreateAgentModal open={createOpen} onClose={() => setCreateOpen(false)} chain={chain} />

      {/* Hire modal — escrow-backed hire flow (PRD v2) */}
      <HireModal agent={hireAgent} chain={chain} open={!!hireAgent} onClose={() => setHireAgent(null)} />
    </div>
  )
}

function AgentLane({ icon: Icon, title, subtitle, agents, onHireClick }) {
  if (!agents.length) return null
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-brand-600 dark:text-brand-400" />
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="marketplace-agent-grid grid gap-5">
        {agents.map((agent) => <AgentCard key={agent.id} agent={agent} compact onHireClick={onHireClick} />)}
      </div>
    </section>
  )
}

function FilterChip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full px-2.5 py-0.5 font-medium text-slate-600 dark:text-slate-400">
      {label}
      <button onClick={onClear} className="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400">
        <X size={11} />
      </button>
    </span>
  )
}