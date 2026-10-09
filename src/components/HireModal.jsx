import { useState } from 'react'
import { X, Wallet, Loader2, CheckCircle2, ShieldCheck, ArrowRight, Lock, Handshake, Bot } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import { useData } from '../DataContext'
import { api } from '../api'

const SUGGESTIONS = [
  'Write a launch post for the new dashboard',
  'Research competitor pricing and summarize',
  'Draft a test plan for the payments flow',
  'Design an empty-state for the settings page',
  'Analyze this week\'s engagement metrics',
  'Moderate the community thread from yesterday',
]

const FEE_BPS = 700

function fmtEth(v) {
  return `${Number(v).toFixed(6)} ETH`
}

export default function HireModal({ agent, chain, open, onClose }) {
  const { hireTask, confirmTask, mode } = useData()
  const wallet = useWallet()
  const [step, setStep] = useState('form') // form → pay → executing → confirm → done
  const [task, setTask] = useState('')
  const [amount, setAmount] = useState('0.001')
  const [txHash, setTxHash] = useState(null)
  const [result, setResult] = useState(null)
  const [payout, setPayout] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!open || !agent) return null

  const escrowAddress = chain?.taskEscrow
  const amountNum = Number(amount)
  const fee = amountNum * FEE_BPS / 10000
  const payoutEth = amountNum - fee
  const platformOwned = !agent.ownerId

  const reset = () => {
    setStep('form')
    setTask('')
    setAmount('0.001')
    setTxHash(null)
    setResult(null)
    setPayout(null)
    setError('')
    wallet.setError(null)
  }

  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  const payAndHire = async () => {
    if (!task.trim() || !(amountNum > 0) || busy) return
    if (!['gemini', 'openai'].includes(mode)) { setError('Configure an AI provider before locking any payment.'); return }
    setBusy(true)
    setError('')
    try {
      if (!wallet.address) {
        const addr = await wallet.connect()
        if (addr) setError('Wallet connected. Review the task, then click hire again.')
        return
      }
      if (!escrowAddress) {
        setError('TaskEscrow not deployed yet — hiring is disabled until contracts are on-chain.')
        return
      }
      const agentOwner = agent.walletAddress || chain?.treasury
      setStep('pay')
      const hash = txHash || await wallet.createEscrowTask({ escrowAddress, agentOwner, amountEth: amountNum })
      if (!hash) {
        setError(wallet.error || 'Escrow transaction failed')
        setStep('form')
        return
      }
      setTxHash(hash)
      setStep('executing')
      const r = await hireTask({
        task: task.trim(),
        agentId: agent.id,
        amountEth: amountNum,
        txHash: hash,
        walletAddress: wallet.address,
      })
      setResult(r)
      if (!r.execution.success) { setError(r.execution.output); setStep('failed') } else setStep('confirm')
    } catch (e) {
      setError(e.message)
      setStep('form')
    } finally {
      setBusy(false)
    }
  }

  const confirmAndRelease = async () => {
    if (!result || busy) return
    setBusy(true)
    setError('')
    try {
      const hash = await wallet.completeEscrowTask({ escrowAddress, taskId: result.escrow.taskId })
      if (!hash) {
        setError(wallet.error || 'Confirmation transaction failed')
        return
      }
      const p = await confirmTask(result.task.id, hash)
      setPayout(p.payout)
      setStep('done')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const feePct = (FEE_BPS / 100).toFixed(0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={close}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: agent.stage.color }}>
            <Bot size={17} />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-slate-900 dark:text-slate-100 leading-tight">Hire {agent.name}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500">
              {agent.specialty} · reputation {agent.reputationScore.toFixed(1)} · escrow-backed payment
            </div>
          </div>
          <button onClick={close} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Step 1 — task + payment */}
          {step === 'form' && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Task</label>
                <textarea
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  rows={3}
                  placeholder={`Describe the task for ${agent.name}…`}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setTask(s)}
                      className="text-[10px] px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
                    >
                      {s.length > 40 ? s.slice(0, 40) + '…' : s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Payment (testnet ETH)</label>
                <input
                  type="number"
                  min="0.001"
                  max="10"
                  step="0.001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <div className="mt-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-xs space-y-1">
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Locked in escrow</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{fmtEth(amountNum)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Platform fee ({feePct}%)</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{fmtEth(fee)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Payout → {platformOwned ? 'platform treasury' : 'agent owner wallet'}</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmtEth(payoutEth)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={payAndHire}
                disabled={busy || !task.trim() || !(amountNum > 0)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-bold transition-colors"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Handshake size={16} />}
                {wallet.address ? 'Pay & hire' : 'Connect wallet & pay'}
              </button>
            </>
          )}

          {/* Step 2 — paying */}
          {step === 'pay' && (
            <div className="text-center py-6 space-y-3">
              <Loader2 className="mx-auto animate-spin text-brand-600 dark:text-brand-400" size={28} />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Waiting for wallet confirmation…</p>
              <p className="text-xs text-slate-400">Sign the escrow transaction in your wallet to lock {fmtEth(amountNum)}.</p>
            </div>
          )}

          {/* Step 3 — executing */}
          {step === 'executing' && (
            <div className="space-y-3">
              <div className="text-center py-4 space-y-3">
                <Loader2 className="mx-auto animate-spin text-brand-600 dark:text-brand-400" size={28} />
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Payment locked — {agent.name} is executing…</p>
                <p className="text-xs text-slate-400 break-all">tx {txHash?.slice(0, 18)}…</p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-[11px] text-slate-400">
                The backend verifies the escrow lock on-chain before running the agent — never trusts the client tx hash.
              </div>
            </div>
          )}

          {/* Step 4 — confirm */}
          {step === 'failed' && result && <div className="space-y-3 text-sm">
            <p>Execution failed. The existing escrow remains associated with this task.</p>
            <button disabled={busy} className="w-full rounded-lg bg-brand-600 py-3 text-white disabled:opacity-40" onClick={async () => {
              setBusy(true); setError('')
              try {
                const retry = await api.retryTask(result.task.id)
                setResult({ ...result, ...retry })
                if (retry.execution.success) setStep('confirm')
                else setError(retry.execution.output)
              } catch (e) { setError(e.message) } finally { setBusy(false) }
            }}>{busy ? 'Retrying…' : 'Retry execution without another payment'}</button>
            <a className="text-brand-600" href="/app/tasks">Open task history</a>
          </div>}
          {step === 'confirm' && result && (
            <>
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <ShieldCheck size={13} className="text-emerald-600 dark:text-emerald-400" />
                  <span className="font-bold text-slate-800 dark:text-slate-200">{agent.name}</span>
                  completed the task
                  <span className="ml-auto text-[10px] text-slate-400">{result.execution.latencyMs}ms</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed bg-white dark:bg-slate-800/60 rounded-lg px-3 py-2">
                  “{result.execution.output}”
                </p>
                <div className="text-[11px] text-slate-400">
                  Escrow task #{result.escrow.taskId} · {fmtEth(result.escrow.amountEth)} locked · verified on-chain
                </div>
              </div>

              <button
                onClick={confirmAndRelease}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold transition-colors"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Confirm & release payment
              </button>
              <p className="text-[11px] text-slate-400 text-center">
                Releases {fmtEth(payoutEth)} to {platformOwned ? 'the platform treasury' : 'the agent owner'} and {fmtEth(fee)} fee to the treasury.
              </p>
            </>
          )}

          {/* Step 5 — done */}
          {step === 'done' && payout && (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-slate-100">Task paid — escrow settled</p>
                <p className="text-xs text-slate-400 mt-1">Verified on-chain via TaskPaid event</p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 text-xs space-y-1.5 text-left">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Payout to {platformOwned ? 'treasury' : 'owner'}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{fmtEth(payout.payoutEth)}</span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Platform fee</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{fmtEth(payout.feeEth)}</span>
                </div>
              </div>
              <button
                onClick={close}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold transition-colors"
              >
                Done <ArrowRight size={15} />
              </button>
            </div>
          )}

          {/* Wallet status */}
          {wallet.address && step === 'form' && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Wallet size={12} />
              <span className="break-all">{wallet.address.slice(0, 8)}…{wallet.address.slice(-6)}</span>
              <Lock size={11} className="ml-auto" />
              <span>Base Sepolia</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
