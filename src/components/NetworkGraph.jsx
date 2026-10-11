import { useEffect, useMemo, useRef, useState } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force'
import { trustColor, STATUS_META } from '../agentMeta'
import { useData } from '../DataContext'
import { useNavigate } from 'react-router-dom'

/**
 * Swarm network graph — force-directed layout of agents and their peer-audit edges.
 * Node size and ring color reflect trust; center color reflects runtime status.
 * Each recorded peer relationship appears once, without inferring audit recency.
 */
export default function NetworkGraph({ height = 460 }) {
  const svgRef = useRef(null)
  const [selectedId, setSelectedId] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const navigate = useNavigate()
  const { agents } = useData()

  const selected = agents.find((agent) => agent.id === selectedId)
  const hovered = agents.find((agent) => agent.id === hoveredId)
  const links = useMemo(() => {
    const ids = new Set(agents.map((agent) => agent.id))
    const relationships = new Map()
    for (const agent of agents) {
      for (const peerId of agent.peers || []) {
        if (peerId === agent.id || !ids.has(peerId)) continue
        const [source, target] = [agent.id, peerId].sort()
        const key = JSON.stringify([source, target])
        if (!relationships.has(key)) relationships.set(key, { source, target, key })
      }
    }
    return [...relationships.values()]
  }, [agents])
  const neighbors = new Set(links.filter((link) => link.source === selectedId || link.target === selectedId).flatMap((link) => [link.source, link.target]))

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || agents.length === 0) return

    let sim = null

    const layout = () => {
      // getBoundingClientRect is reliable for SVG; clientWidth can be 0.
      const width = svg.getBoundingClientRect().width
      if (width <= 0) return // container not laid out yet — ResizeObserver will retry
      const h = height

      const nodes = agents.map((agent, index) => ({
        id: agent.id,
        x: width / 2 + Math.cos(index * 2.39996) * Math.sqrt(index + 1) * 18,
        y: h / 2 + Math.sin(index * 2.39996) * Math.sqrt(index + 1) * 18,
      }))
      // d3 mutates link endpoints; keep the React relationship data immutable.
      const layoutLinks = links.map((link) => ({ ...link }))

      if (sim) sim.stop()
      sim = forceSimulation(nodes)
        .force('link', forceLink(layoutLinks).id((d) => d.id).distance(70).strength(0.5))
        .force('charge', forceManyBody().strength(-260))
        .force('center', forceCenter(width / 2, h / 2))
        // Weak centering keeps the cluster inside the viewport after ticks.
        .force('x', forceX(width / 2).strength(0.1))
        .force('y', forceY(h / 2).strength(0.1))
        .force('collide', forceCollide(26))
        .stop()

      // Run a fixed number of ticks for a stable layout
      for (let i = 0; i < 220; i++) sim.tick()

      // Keep node rings and labels inside narrow viewports.
      for (const node of nodes) {
        node.x = Math.max(Math.min(56, width / 2), Math.min(width - Math.min(56, width / 2), node.x))
        node.y = Math.max(32, Math.min(h - 48, node.y))
      }

      const g = svg.querySelector('g.network')
      if (!g) return

      // Edges
      const edgeSel = g.querySelectorAll('line.edge')
      edgeSel.forEach((el, i) => {
        const l = layoutLinks[i]
        el.setAttribute('x1', l.source.x)
        el.setAttribute('y1', l.source.y)
        el.setAttribute('x2', l.target.x)
        el.setAttribute('y2', l.target.y)
      })

      // Nodes
      const nodeSel = g.querySelectorAll('g.node')
      nodeSel.forEach((el, i) => {
        const n = nodes[i]
        el.setAttribute('transform', `translate(${n.x},${n.y})`)
      })
    }

    layout()

    // Re-layout when the container gains width or resizes (e.g. narrow panels,
    // header wrapping, window resize) — the old code measured once at mount
    // and stayed broken forever if the width was 0 at that moment.
    const ro = new ResizeObserver(() => layout())
    ro.observe(svg)

    return () => {
      ro.disconnect()
      if (sim) sim.stop()
    }
  }, [height, agents, links])

  const nodeRadius = (a) => 10 + (Math.max(0, Math.min(100, a.trustScore)) / 100) * 14

  return (
    <div className="relative" style={{ height }}>
      <svg ref={svgRef} width="100%" height={height} className="block" aria-label="Agent peer-audit network" onClick={() => setSelectedId(null)}>
        <g className="network">
          {links.map(({ source, target, key }) => {
            const isHot = selected && (selected.id === source || selected.id === target)
            return (
              <line
                key={key}
                className="edge"
                data-source={source}
                data-target={target}
                stroke={isHot ? '#3d6cec' : 'var(--graph-edge)'}
                strokeWidth={isHot ? 2 : 1}
                strokeOpacity={isHot ? 0.9 : 0.5}
              />
            )
          })}
          {agents.map((a) => {
            const r = nodeRadius(a)
            const isSel = selected && selected.id === a.id
            const isNeighbor = selected && neighbors.has(a.id)
            const dim = selected && !isSel && !isNeighbor
            const meta = STATUS_META[a.status] || STATUS_META.idle
            return (
              <g
                key={a.id}
                className="node"
                data-agent-id={a.id}
                role="button"
                tabIndex={0}
                aria-label={`${a.name}: trust ${a.trustScore.toFixed(0)}, ${meta.label}`}
                aria-pressed={Boolean(isSel)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedId(isSel ? null : a.id)
                  }
                }}
                style={{ cursor: 'pointer', opacity: dim ? 0.25 : 1, transition: 'opacity 0.2s' }}
                onMouseEnter={() => setHoveredId(a.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedId(isSel ? null : a.id)
                }}
                onDoubleClick={() => navigate(`/app/agents/${a.id}`)}
              >
                <circle r={r + 4} fill={trustColor(a.trustScore)} opacity={0.15} />
                <circle r={r} fill="var(--graph-node)" stroke={trustColor(a.trustScore)} strokeWidth={2.5} />
                <circle r={3.5} fill={meta.color} />
                <text y={r + 14} textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="600">
                  {a.name.length > 14 ? a.name.slice(0, 13) + '…' : a.name}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute top-3 left-3 bg-white/90 backdrop-blur rounded-lg border border-slate-200 px-3 py-2 text-[10px] text-slate-500 shadow-sm dark:bg-slate-900/90 dark:border-slate-700 dark:text-slate-400">
        <div className="font-semibold text-slate-700 mb-1 dark:text-slate-200">Peer-audit network</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Active</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Degraded</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Stalled</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400" /> Idle</div>
        <div className="mt-1.5 text-slate-500 dark:text-slate-400">Size &amp; ring: trust · Dot: status<br />Lines: recorded peer audits</div>
        <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-slate-400 dark:border-slate-700 dark:text-slate-500">Click: select · Double-click: open</div>
      </div>

      {/* Hover / selection panel */}
      {(hovered || selected) && (
        <div className="absolute bottom-3 right-3 bg-white rounded-xl border border-slate-200 shadow-lg px-4 py-3 w-64 dark:bg-slate-900 dark:border-slate-700">
          {(() => {
            const a = selected || hovered
            const meta = STATUS_META[a.status] || STATUS_META.idle
            return (
              <>
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{a.name}</div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: meta.color, background: meta.bg }}>
                    {meta.label}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mb-2 dark:text-slate-500">{a.role} · {a.stage.label}</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase dark:text-slate-500">Trust</div>
                    <div className="text-sm font-bold" style={{ color: trustColor(a.trustScore) }}>{a.trustScore.toFixed(0)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase dark:text-slate-500">Complete</div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{a.completionRate.toFixed(0)}%</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase dark:text-slate-500">Audits</div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{a.auditsReceived}</div>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/app/agents/${a.id}`)}
                  className="mt-2.5 w-full text-[11px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                >
                  Open agent profile →
                </button>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
