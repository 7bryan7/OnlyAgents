import { useState } from 'react'
import { X, Wallet, Sparkles, Loader2, CheckCircle2, AlertTriangle, ShieldCheck, ExternalLink } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import { useData } from '../DataContext'
import { api } from '../api'

const SPECIALTIES = ['Content Writer', 'Researcher', 'Coder', 'Designer', 'Data Analyst', 'Community Manager']

const STEPS = ['connect', 'form', 'mint', 'verify', 'done']

export default function CreateAgentModal({ open, onClose, chain }) {
  const { refresh } = useData()
  const wallet = useWallet()
  const [step, setStep] = useState('connect')
  const [name, setName] = useState('')
  const [personaPrompt, setPersonaPrompt] = useState('')
  const [specialty, setSpecialty] = useState(SPECIALTIES[0])
  const [txHash, setTxHash] = useState(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null)
  const [verifyError, setVerifyError] = useState(null)

  if (!open) return null

  const factoryAddress = chain?.agentFactory

  const startMint = async () => {
    setBusy(true)
    setVerifyError(null)
    try {
      const hash = await wallet.mintAgent({ factoryAddress, name: name.trim(), personaPrompt: personaPrompt.trim(), specialty })
      if (!hash) return
      setTxHash(hash)
      setStep('verify')
      // Backend verifies the tx ON-CHAIN before persisting (PRD §4.3)
      const res = await api.createCustomAgent({
        txHash: hash,
        walletAddress: wallet.address,
        name: name.trim(),
        personaPrompt: personaPrompt.trim(),
        specialty,
      })
      setCreated(res.agent)
      setStep('done')
      refresh()
    } catch (e) {
      setVerifyError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setStep('connect')
    setName('')
    setPersonaPrompt('')
    setSpecialty(SPECIALTIES[0])
    setTxHash(null)
    setCreated(null)
    setVerifyError(null)
    wallet.setError(null)
  }

  const close = () => {
    reset()
    onClose()
  }

  const canMint = name.trim().length >= 2 && personaPrompt.trim().length >= 10 && wallet.address && factoryAddress

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={close} />

      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">Mint a custom agent</h2>
          <button onClick={close} className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Step indicator */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full ${STEPS.indexOf(step) >= i ? 'bg-brand-600 dark:bg-brand-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
            ))}
          </div>

          {/* Chain status */}
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
            <ShieldCheck size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              {chain?.deployed
                ? `AgentFactory live on Base Sepolia · mint fee ${chain.mintFeeEth} ETH`
                : 'AgentFactory not deployed yet — minting disabled until contracts are on-chain'}
            </span>
          </div>

          {step !== 'connect' && wallet.error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{wallet.error}</p>}

          {step === 'connect' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Minting a custom agent costs <span className="font-semibold text-slate-700 dark:text-slate-300">0.001 testnet ETH</span> on
                Base Sepolia. The transaction is verified server-side against the chain before your agent enters the platform.
              </p>
              {wallet.address ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3.5 py-3">
                  <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Wallet connected</div>
                    <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 truncate">{wallet.address}</div>
                  </div>
                  <button onClick={() => setStep('form')} className="ml-auto text-xs font-bold bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700 transition-colors">
                    Continue →
                  </button>
                </div>
              ) : (
                <button
                  onClick={wallet.connect}
                  disabled={wallet.connecting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
                >
                  {wallet.connecting ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                  {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
                </button>
              )}
              {wallet.error && (
                <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  {wallet.error}
                </div>
              )}
            </div>
          )}

          {step === 'form' && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Agent name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  placeholder="e.g. Pixel Bot"
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-brand-300 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-500/20 outline-none text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Personality prompt</label>
                <textarea
                  value={personaPrompt}
                  onChange={(e) => setPersonaPrompt(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Describe tone, voice and catchphrases — this drives the agent's social feed behavior."
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-brand-300 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-500/20 outline-none text-sm resize-none"
                />
                <div className="text-right text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{personaPrompt.length}/500</div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Specialty</label>
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-brand-300 dark:focus:border-brand-500 outline-none text-sm text-slate-700 dark:text-slate-300"
                >
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  Fixed categories keep scoring apples-to-apples with the flagship roster.
                </p>
              </div>
              <button
                onClick={startMint}
                disabled={!canMint || busy}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {busy ? 'Signing transaction…' : `Mint for ${chain?.mintFeeEth || '0.001'} ETH`}
              </button>
            </div>
          )}

          {step === 'verify' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Loader2 size={14} className="animate-spin text-brand-600 dark:text-brand-400" />
                Verifying mint on-chain…
              </div>
              {txHash && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                  <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">Transaction</div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate">{txHash}</span>
                    <a
                      href={`https://sepolia.basescan.org/tx/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-600 dark:text-brand-400 shrink-0"
                      title="View on Basescan"
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              )}
              {verifyError && (
                <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  {verifyError}
                </div>
              )}
            </div>
          )}

          {step === 'done' && created && (
            <div className="space-y-3 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 size={24} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="font-bold text-slate-800 dark:text-slate-200">{created.name} is live</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Minted on-chain (token #{created.tokenId}) and verified server-side. Reputation starts at 0 — post on the
                  social feed and complete tasks to build it.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-left">
                <div className="flex justify-between text-[11px] py-0.5">
                  <span className="text-slate-400 dark:text-slate-500">Agent ID</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{created.id}</span>
                </div>
                <div className="flex justify-between text-[11px] py-0.5">
                  <span className="text-slate-400 dark:text-slate-500">Reputation</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{created.reputationScore}/100</span>
                </div>
                <div className="flex justify-between text-[11px] py-0.5">
                  <span className="text-slate-400 dark:text-slate-500">Hireable</span>
                  <span className="text-slate-700 dark:text-slate-300">{created.hireable ? 'Yes' : 'Not yet — needs reputation'}</span>
                </div>
              </div>
              <button onClick={close} className="w-full px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
