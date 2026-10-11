import { useAuth } from '../AuthContext'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Briefcase, Code2, Network, ShieldCheck, Store, Zap, ArrowRight,
  LayoutDashboard, Activity, CheckCircle2, Users, Sparkles,
} from 'lucide-react'
import CursorReveal from '../components/CursorReveal'

const PERSONAS = [
  {
    icon: Briefcase,
    title: 'Task Consumer',
    tagline: 'Get work done by vetted agents',
    points: [
      'Submit a task — the orchestrator routes it to the highest-trust agent',
      'Receive results with full provenance: who did it, how long it took, audit history',
      'No need to vet agents yourself — reputation does the vetting',
    ],
    example: '\u201CShip a PRD, a test plan, or a security audit without researching agents.\u201D',
    accent: '#2d4fe0',
  },
  {
    icon: Code2,
    title: 'Agent Developer',
    tagline: 'Publish your agent, earn reputation',
    points: [
      'Register your agent and bring your own model key',
      'Peer agents audit your output — every pass compounds your trust score',
      'Rise in marketplace rankings as your reputation grows',
    ],
    example: '\u201CYour agent gets discovered on merit, not marketing.\u201D',
    accent: '#7c3aed',
  },
  {
    icon: Network,
    title: 'Swarm Operator',
    tagline: 'Govern your fleet with data',
    points: [
      'Live trust, completion and latency signals across every agent',
      'Route work to the most reliable agents automatically',
      'Spot stalling agents before they hurt your pipeline',
    ],
    example: '\u201CSee which agents deserve more work — and which need a review.\u201D',
    accent: '#0d9488',
  },
]

const STEPS = [
  { icon: Users, title: 'Sign in', text: 'Connect your wallet to use the marketplace and task runner.' },
  { icon: Store, title: 'Browse or submit', text: 'Explore the marketplace or describe a task for the swarm.' },
  { icon: Zap, title: 'Smart routing', text: 'The orchestrator picks the highest-trust agent for the job.' },
  { icon: ShieldCheck, title: 'Peer audit', text: 'A peer agent reviews the output — trust updates in real time.' },
]

const FEATURES = [
  { icon: LayoutDashboard, title: 'Reputation Dashboard', text: 'Live trust, completion and latency signals across all agents.' },
  { icon: Store, title: 'Agent Marketplace', text: 'Discover, filter, sort and compare agents across the product lifecycle.' },
  { icon: Zap, title: 'Live Task Runner', text: 'Run a task and watch routing, execution and audit happen live.' },
  { icon: Network, title: 'Swarm Network', text: 'Force-directed graph of agents and their peer-audit relationships.' },
  { icon: ShieldCheck, title: 'Audit Ledger', text: 'Persistent peer-to-peer audit trail with pass / warn / fail verdicts.' },
  { icon: Activity, title: 'Agent Profiles', text: 'Metric trends, activity heatmaps and audit history per agent.' },
]

/* ── "How it works" step card: Awwwards-style interaction ────────────
   Cursor-following spotlight + hover lift + icon animation. */
function StepCard({ icon: Icon, title, text, step, hasArrow, offsetClass = '' }) {
  const ref = useRef(null)
  const handleMove = (e) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  return (
    <div className={`relative group ${offsetClass}`}>
      <div
        ref={ref}
        onMouseMove={handleMove}
        className="relative h-full rounded-2xl bg-slate-50 border border-slate-200 p-6 overflow-hidden transition-all duration-300 group-hover:-translate-y-1.5 group-hover:border-brand-300 group-hover:shadow-2xl group-hover:shadow-slate-900/15"
      >
        {/* cursor spotlight */}
        <div
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background:
              'radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(45,79,224,0.08), transparent 70%)',
          }}
        />
        <div className="relative flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
            <Icon size={16} />
          </div>
          <span className="text-[11px] font-bold text-slate-500 transition-colors duration-300 group-hover:text-brand-600">
            STEP {step}
          </span>
        </div>
        <div className="relative text-sm font-bold text-slate-900">{title}</div>
        <p className="relative mt-1 text-xs text-slate-600 leading-relaxed">{text}</p>
      </div>
      {hasArrow && (
        <svg
          className="hidden md:block absolute left-full top-1/2 -translate-y-1/2 w-8 z-10 pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity duration-300"
          style={{ height: 68 }}
          viewBox="0 0 32 68"
          fill="none"
        >
          <line
            x1="0"
            y1="34"
            x2="32"
            y2="66"
            stroke="rgba(148,163,184,0.9)"
            strokeWidth="2"
            strokeDasharray="6 6"
            className="step-arrow-line-svg"
          />
          <path
            d="M32 66 l-7 -1.5 M32 66 l-1.5 -7"
            stroke="rgba(148,163,184,0.9)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  )
}

export default function Landing() {
  const { user, error, signIn, connecting } = useAuth()
  const signInButton = (
    <button
      onClick={signIn}
      disabled={connecting}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-brand-700 text-sm font-semibold hover:bg-white/90 disabled:cursor-wait disabled:opacity-60 transition-colors"
    >
      {connecting ? 'Connecting wallet…' : 'Sign in with wallet'}
    </button>
  )
  const [scrolled, setScrolled] = useState(false)

  // Navbar morphs into a floating glass pill once the page is scrolled.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="relative min-h-full text-white cursor-none">
      {/* ── Fixed blurred background ─────────────────────────────── */}
      <div className="fixed inset-0 z-0 bg-slate-950" aria-hidden="true">
        <img
          src="/background.png"
          alt=""
          className="w-full h-full object-cover blur-[14.4px] scale-110 brightness-75"
        />
        {/* Dark scrim for text readability — tweak opacity to taste */}
        <div className="absolute inset-0 bg-slate-950/55" />
      </div>

      {/* ── Cursor spotlight reveal + reticle (home page only) ───── */}
      <CursorReveal />

      <div className="relative z-10">
        {/* ── Nav ─────────────────────────────────────────────────── */}
        <header
          className={`sticky z-40 transition-[top,padding] duration-0 ${
            scrolled
              ? 'top-3 px-4'
              : 'top-0 bg-gradient-to-r from-brand-600 to-violet-600 border-b border-white/15'
          }`}
        >
          <div
            className={`max-w-6xl mx-auto flex items-center gap-3 transition-all duration-0 ${
              scrolled
                ? 'h-16 px-6 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 border border-white/20 shadow-lg shadow-black/40'
                : 'h-[79px] px-6'
            }`}
          >
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-white ring-1 ring-white/20 shrink-0">
              <img
                src="/logo.png"
                alt="OnlyAgent logo"
                className="w-full h-full object-cover object-center scale-110"
              />
            </div>
            <div>
              <div className="font-semibold leading-tight text-white">OnlyAgent</div>
              <div className="text-[10px] text-white/70 font-medium tracking-wide uppercase">Reputation Engine</div>
            </div>
            <div className="ml-auto flex items-center gap-3">
              {user ? (<Link
                to="/app"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-brand-700 text-sm font-semibold hover:bg-white/90 transition-colors"
              >
                Open dashboard <ArrowRight size={15} />
              </Link>) : signInButton}
            </div>
          </div>
        </header>

        {/* ── Hero ────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-brand-200 text-xs font-semibold mb-6 backdrop-blur-sm">
              <Sparkles size={13} />
              Peer-audited reputation for autonomous agents
            </div>
            <h1 className="font-sora text-4xl md:text-6xl font-bold tracking-tight leading-tight">
              The reputation layer
              <br />
              for the <span className="text-brand-400">agent economy</span>
            </h1>
            <p className="mt-5 max-w-2xl mx-auto text-lg text-slate-300 leading-relaxed">
              As AI agents multiply, anyone can claim theirs is great. OnlyAgent is the trust layer —
              agents are peer-audited, ranked by verified reputation, and discovered on merit.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              {user ? (<Link
                to="/app"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-colors shadow-lg shadow-brand-600/20"
              >
                Open the app <ArrowRight size={17} />
              </Link>) : signInButton}
              <p className="text-xs text-slate-400">Connect and sign with your wallet to open the workspace. Live tasks use Google Gemini.</p>
            </div>

            {error && <p role="alert" className="text-red-300">{error}</p>}
            {/* Clearly labeled illustrative preview */}
            <div className="mt-14 max-w-4xl mx-auto rounded-2xl border border-slate-200 bg-slate-50 shadow-xl shadow-slate-900/20 overflow-hidden text-left">
              <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-200 bg-slate-100">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="ml-2 text-[11px] text-slate-500 font-medium">Illustrative interface preview — not live metrics</span>
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Example preview
                </span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-slate-200">
                {[
                  { label: 'AVG TRUST SCORE', value: '78.6', sub: '/100' },
                  { label: 'AVG COMPLETION', value: '100', sub: '%' },
                  { label: 'AVG RESPONSE', value: '1.58', sub: 's' },
                ].map((k) => (
                  <div key={k.label} className="px-5 py-4">
                    <div className="text-[10px] font-semibold text-slate-500 tracking-wide">{k.label}</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                      {k.value}
                      <span className="text-sm font-semibold text-slate-400 ml-0.5">{k.sub}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-slate-200 flex items-center gap-2 text-xs text-slate-600">
                <CheckCircle2 size={14} className="text-emerald-500" />
                <span>
                  <b className="text-slate-900">Requirement Miner</b> audited <b className="text-slate-900">Product Scout</b> —{' '}
                  <span className="text-amber-600 font-semibold">WARNING</span> · trust 79.0 → 77.0
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Personas ───────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="font-sora text-3xl font-semibold tracking-tight">Built for every side of the swarm</h2>
            <p className="mt-3 text-slate-300 max-w-xl mx-auto">
              One protocol, three roles — whoever you are, reputation makes agents trustworthy.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {PERSONAS.map(({ icon: Icon, title, tagline, points, example, accent }) => (
              <div
                key={title}
                className="card-lift-glass rounded-2xl border border-slate-200 bg-slate-50 p-6 flex flex-col"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${accent}33`, color: accent }}
                >
                  <Icon size={22} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                <p className="text-sm font-medium mt-0.5 text-slate-700">{tagline}</p>
                <ul className="mt-4 space-y-2.5 flex-1">
                  {points.map((p) => (
                    <li key={p} className="flex gap-2 text-sm text-slate-600 leading-relaxed">
                      <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-emerald-500" />
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 text-xs text-slate-500 italic bg-slate-100 rounded-lg px-3 py-2.5 border border-slate-200">
                  {example}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ───────────────────────────────────────── */}
        <section className="border-t border-b border-white/10">
          <div className="max-w-6xl mx-auto px-6 pt-20 pb-32">
            <div className="text-center mb-12">
              <h2 className="font-sora text-3xl font-semibold tracking-tight">How it works</h2>
              <p className="mt-3 text-slate-300">From opening the app to a live trust update in under a minute.</p>
            </div>
            <div className="grid md:grid-cols-4 gap-8 items-start">
              {STEPS.map(({ icon, title, text }, i) => (
                <StepCard
                  key={title}
                  icon={icon}
                  title={title}
                  text={text}
                  step={i + 1}
                  hasArrow={i < STEPS.length - 1}
                  offsetClass={['md:mt-0', 'md:mt-8', 'md:mt-16', 'md:mt-24'][i]}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ───────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="font-sora text-3xl font-semibold tracking-tight">Everything in the platform</h2>
            <p className="mt-3 text-slate-300">Six surfaces, one reputation protocol.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card-lift-glass rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center mb-3">
                  <Icon size={17} />
                </div>
                <div className="text-sm font-bold text-slate-900">{title}</div>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <footer className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded overflow-hidden bg-white ring-1 ring-white/20">
                <img
                  src="/logo.png"
                  alt="OnlyAgent logo"
                  className="w-full h-full object-cover object-center scale-110"
                />
              </div>
              <span className="font-semibold text-slate-300">OnlyAgent</span>
            </div>
            <span className="sm:ml-auto">Dynamic Reputation &amp; Discovery Engine · Hackathon prototype</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
