import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Store, Network, ShieldCheck, Settings, LogOut, Cpu, Sun, Moon, MessageSquare } from 'lucide-react'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { useTheme } from '../ThemeContext'
import SettingsModal from './SettingsModal'
import GlobalSearch from './GlobalSearch'
import NotificationsPanel from './NotificationsPanel'

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/marketplace', label: 'Agent Marketplace', icon: Store },
  { to: '/app/feed', label: 'Social Feed', icon: MessageSquare },
  { to: '/app/tasks', label: 'Task History', icon: ShieldCheck },
  { to: '/app/swarms', label: 'Swarm Network', icon: Network },
  { to: '/app/audits', label: 'Audit Ledger', icon: ShieldCheck },
  { to: '/app/connections', label: 'AI Models', icon: Cpu },
]

const MODE_META = {
  loading: { label: 'Connecting…', color: '#94a3b8', bg: '#f1f5f9', darkColor: '#94a3b8', darkBg: 'rgba(148,163,184,0.15)' },
  unconfigured: { label: 'AI key required', color: '#f59e0b', bg: '#fffbeb', darkColor: '#fbbf24', darkBg: 'rgba(245,158,11,0.15)' },
  gemini: { label: 'Gemini configured', color: '#10b981', bg: '#ecfdf5', darkColor: '#34d399', darkBg: 'rgba(16,185,129,0.15)' },
  openai: { label: 'OpenAI configured', color: '#10b981', bg: '#ecfdf5', darkColor: '#34d399', darkBg: 'rgba(16,185,129,0.15)' },
  offline: { label: 'Backend offline', color: '#ef4444', bg: '#fef2f2', darkColor: '#f87171', darkBg: 'rgba(239,68,68,0.15)' },
}

export default function Layout() {
  const { refresh, mode, agents, swarms, auditTotal } = useData()
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isDark = theme === 'dark'
  const meta = MODE_META[mode] || MODE_META.offline
  const badgeStyle = isDark
    ? { color: meta.darkColor, background: meta.darkBg }
    : { color: meta.color, background: meta.bg }
  return (
    <div className={`flex h-full ${isDark ? 'dark' : ''}`}>
      {/* Sidebar */}
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 dark:bg-slate-900 dark:border-slate-800 flex flex-col">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-100 dark:border-slate-800">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 shrink-0">
            <img
              src="/logo.png"
              alt="OnlyAgent logo"
              className="w-full h-full object-cover object-center scale-110"
            />
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-slate-100 leading-tight">OnlyAgent</div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-wide uppercase">Reputation Engine</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-100 dark:border-slate-800">
          <div className="rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white">
            <div className="text-xs font-semibold mb-1">Protocol v2.4</div>
            <p className="text-[11px] text-brand-100 leading-relaxed">
              Peer-audited reputation layer. {agents.length} agents · {swarms.length} swarms ·{' '}
              {auditTotal} audits.
            </p>
          </div>
          <button
              onClick={() => setSettingsOpen(true)}
              className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <Settings size={16} />
              Settings
            </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 bg-white/80 backdrop-blur border-b border-slate-200 dark:bg-slate-900/80 dark:border-slate-800 flex items-center gap-4 px-6">
          <div className="flex-1 max-w-md relative">
            <GlobalSearch />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5"
              style={badgeStyle}
              title={
                ['gemini', 'openai'].includes(mode)
                  ? `Runtime: real ${mode} calls`
                  : mode === 'unconfigured'
                    ? 'Configure the selected AI provider key in the server .env to run tasks'
                    : 'Backend unavailable; no offline data is substituted'
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${mode === 'gemini' ? 'pulse-dot' : ''}`}
                style={{ background: badgeStyle.color }}
              />
              {meta.label}
            </span>
            <button
              onClick={toggle}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <NotificationsPanel />
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt={user.name || 'user'}
                  className="w-8 h-8 rounded-full ring-2 ring-white dark:ring-slate-900"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-brand-600 flex items-center justify-center text-white text-xs font-bold">
                  {(user?.name || 'U').slice(0, 2).toUpperCase()}
                </div>
              )}
              <button
                onClick={() => {
                  signOut()
                  navigate('/')
                }}
                title="Sign out"
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 dark:bg-slate-950">
          {mode === 'offline' ? <div role="alert">Backend unavailable. Start the API and retry. <button onClick={refresh}>Retry</button></div> : <><p className="text-xs text-slate-500 mb-4">Metrics use recorded executions and peer audits. Zero means no evidence when history is empty.</p><Outlet /></>}
        </main>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
