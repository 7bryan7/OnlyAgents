import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Store, Network, ShieldCheck, Settings, LogOut, Cpu, Sun, Moon, MessageSquare, ChevronDown, Search, Wallet } from 'lucide-react'
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
  { to: '/app/tasks', label: 'Task Runner', icon: ShieldCheck },
  { to: '/app/swarms', label: 'Swarm Network', icon: Network },
  { to: '/app/audits', label: 'Audit Ledger', icon: ShieldCheck },
  { to: '/app/connections', label: 'AI Models', icon: Cpu },
  { to: '/app/wallet', label: 'Wallet', icon: Wallet },
]

const MODE_META = {
  loading: { label: 'Connecting…', color: '#94a3b8', bg: '#f1f5f9', darkColor: '#94a3b8', darkBg: '#203747' },
  unconfigured: { label: 'AI key required', color: '#f59e0b', bg: '#fffbeb', darkColor: '#fbbf24', darkBg: '#493820' },
  gemini: { label: 'Live data', color: '#10b981', bg: '#ecfdf5', darkColor: '#34d399', darkBg: '#103e38' },
  offline: { label: 'Backend offline', color: '#ef4444', bg: '#fef2f2', darkColor: '#f87171', darkBg: '#462c39' },
}

export default function Layout() {
  const { refresh, mode } = useData()
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isDark = theme === 'dark'
  const meta = MODE_META[mode] || MODE_META.offline
  const badgeStyle = isDark
    ? { color: meta.darkColor, background: meta.darkBg }
    : { color: meta.color, background: meta.bg }
  const [servicesOpen, setServicesOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const servicesRef = useRef(null)
  const headerRef = useRef(null)
  const searchRef = useRef(null)
  const servicesButtonRef = useRef(null)
  const searchButtonRef = useRef(null)
  const location = useLocation()
  const currentSection = NAV.find(({ to, end }) => end
    ? location.pathname === to
    : location.pathname === to || location.pathname.startsWith(`${to}/`))
    || NAV.find(({ to }) => to === '/app/marketplace')
  const SectionIcon = currentSection.icon

  useEffect(() => {
    const header = headerRef.current
    const measure = () => header.parentElement.style.setProperty('--app-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setServicesOpen(false)
    setSearchOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!servicesRef.current?.contains(event.target)) setServicesOpen(false)
      if (!searchRef.current?.contains(event.target)) setSearchOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      if (servicesOpen) {
        setServicesOpen(false)
        servicesButtonRef.current?.focus()
      } else if (searchOpen) {
        setSearchOpen(false)
        searchButtonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [servicesOpen, searchOpen])

  return (
    <div className={`app-shell flex h-full flex-col ${isDark ? 'dark' : ''}`}>
      <header ref={headerRef} className="app-header shrink-0">
        <div className="app-header-brand">
          <NavLink to="/app" end className="flex items-center gap-2.5 shrink-0" aria-label="OnlyAgents dashboard">
            <img src="/logo.png" alt="" className="w-8 h-8 object-cover object-center" />
            <div>
              <div className="font-bold text-slate-950 dark:text-slate-100 leading-tight">OnlyAgents</div>
              <div className="brand-subtitle text-slate-500 dark:text-slate-400 uppercase">Reputation Engine</div>
            </div>
          </NavLink>
        </div>
        <div className="app-navbar">
          <div ref={servicesRef} className="relative shrink-0">
            <button
              ref={servicesButtonRef}
              onClick={() => { setServicesOpen(!servicesOpen); setSearchOpen(false) }}
              aria-expanded={servicesOpen}
              aria-controls="services-navigation"
              className="services-toggle flex h-14 items-center justify-between gap-3 rounded-xl px-5 py-3 text-base font-semibold transition-colors"
            >
              <SectionIcon size={20} className="shrink-0" /> <span className="whitespace-nowrap">{currentSection.label}</span>
              <ChevronDown size={18} className={`shrink-0 transition-transform ${servicesOpen ? 'rotate-180' : ''}`} />
            </button>
            {servicesOpen && (
              <nav id="services-navigation" aria-label="Services" className="services-dropdown absolute left-0 top-full z-50 mt-3 w-[272px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 p-2 shadow-xl shadow-slate-900/10">
                {NAV.map(({ to, label, icon: Icon, end }) => (
                  <NavLink key={to} to={to} end={end} onClick={() => setServicesOpen(false)}
                    className={({ isActive }) => `flex min-h-12 items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-colors ${isActive
                      ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300'
                      : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                  ><Icon size={20} className="shrink-0" />{label}</NavLink>
                ))}
              </nav>
            )}
          </div>
        <div className="app-header-controls flex items-center gap-3">
          <span className="runtime-badge inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5" style={badgeStyle}>
            <span className={`w-2 h-2 rounded-full ${mode === 'gemini' ? 'pulse-dot' : ''}`} style={{ background: badgeStyle.color }} />
            {meta.label}
          </span>
          <div ref={searchRef} className="header-search-anchor relative">
            <button ref={searchButtonRef} onClick={() => { setSearchOpen(!searchOpen); setServicesOpen(false) }} aria-label="Search" aria-expanded={searchOpen} aria-controls="header-search" className="header-icon"><Search size={17} /></button>
            {searchOpen && <div id="header-search" className="header-search absolute right-0 top-full mt-3 z-50 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-xl"><GlobalSearch autoFocus /></div>}
          </div>
          <button onClick={toggle} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} className="header-icon">
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <NotificationsPanel />
          {user?.picture ? <img src={user.picture} alt={user.name || 'user'} className="w-9 h-9 rounded-full" referrerPolicy="no-referrer" /> : (
            <div className="header-avatar w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white text-xs font-bold">{(user?.name || 'U').slice(0, 2).toUpperCase()}</div>
          )}
          <button onClick={() => { signOut(); navigate('/') }} title="Sign out" aria-label="Sign out" className="header-icon"><LogOut size={16} /></button>
          <button onClick={() => setSettingsOpen(true)} aria-label="Settings" className="header-settings flex items-center gap-2 text-sm font-semibold"><Settings size={17} /><span>Settings</span></button>
        </div>
        </div>
      </header>
      <main className="app-main flex-1 min-h-0 overflow-y-auto">
        <div className="app-content">
          {mode === 'offline' ? <div role="alert">Backend unavailable. Start the API and retry. <button onClick={refresh}>Retry</button></div> : <Outlet />}
        </div>
      </main>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
