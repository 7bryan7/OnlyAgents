import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import Layout from './components/Layout'
import { DataProvider } from './DataContext'
import { AuthProvider, useAuth } from './AuthContext'
import { ThemeProvider } from './ThemeContext'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Marketplace from './pages/Marketplace'
import Swarms from './pages/Swarms'
import Audits from './pages/Audits'
import AgentDetail from './pages/AgentDetail'
import Connections from './pages/Connections'
import WalletPage from './pages/Wallet'
import Feed from './pages/Feed'
import Tasks from './pages/Tasks'
import { WalletProvider } from './hooks/useWallet'
import { useWallet } from './hooks/useWallet'

function WalletGate({ children }) {
  const { address, connect, connecting, error } = useWallet()
  const attempted = useRef(false)

  useEffect(() => {
    if (!attempted.current) {
      attempted.current = true
      connect()
    }
  }, [connect])

  if (address) return children

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
          <Wallet size={26} />
        </div>
        <h1 className="font-sora text-xl font-bold text-slate-900 dark:text-slate-100">Connect your wallet</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Connect MetaMask to continue to OnlyAgent. Your wallet is required for this account before accessing the platform.
        </p>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-left text-xs text-red-600 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        <button
          onClick={() => connect()}
          disabled={connecting}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Wallet size={15} />
          {connecting ? 'Waiting for wallet…' : 'Connect wallet'}
        </button>
      </div>
    </div>
  )
}

function ProtectedApp() {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-10">Checking your session...</div>
  if (!user) return <Navigate to="/" replace />
  return (
    <WalletProvider key={user.walletAddress}>
      <WalletGate>
        <DataProvider key={user.walletAddress}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="marketplace" element={<Marketplace />} />
              <Route path="feed" element={<Feed />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="swarms" element={<Swarms />} />
              <Route path="audits" element={<Audits />} />
              <Route path="connections" element={<Connections />} />
              <Route path="wallet" element={<WalletPage />} />
              <Route path="agents/:id" element={<AgentDetail />} />
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Route>
          </Routes>
        </DataProvider>
      </WalletGate>
    </WalletProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app/*" element={<ProtectedApp />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
