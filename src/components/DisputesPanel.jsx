import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { useWallet } from '../hooks/useWallet'
import { api } from '../api'
import { onWSMessage } from '../ws'
import { pendingEscrowAction } from '../escrowPending'

export default function DisputesPanel() {
  const { user } = useAuth()
  const wallet = useWallet()
  const admin = user.role === 'admin'
  const [disputes, setDisputes] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const load = useCallback(async () => {
    try {
      const response = admin ? await api.adminDisputes() : await api.disputes()
      setDisputes(response.disputes)
    } catch (e) { setError(e.message) }
  }, [admin])
  useEffect(() => {
    load()
    return onWSMessage(msg => { if (msg.type === 'hello' || ['all', 'tasks'].includes(msg.resource)) load() })
  }, [load])

  async function resolve(dispute, choice) {
    if (busy) return
    const key = `oa:resolution:${user.walletAddress}:${dispute.id}`
    const pending = pendingEscrowAction(key)
    const decision = pending?.decision || choice
    const note = pending?.note ?? window.prompt(decision === 'uphold' ? 'Explain why the customer should be refunded:' : 'Explain why payment should be released:')
    if (note === null) return
    if (!dispute.review && note.trim().length < 10) { setError('Explain the administrator decision in at least 10 characters before signing.'); return }
    setBusy(dispute.id); setError('')
    try {
      let txHash = pending?.txHash
      if (dispute.escrow) {
        if (dispute.escrow.version !== 2) throw new Error('Legacy escrows cannot be refunded or frozen by this contract.')
        if (wallet.address?.toLowerCase() !== user.walletAddress.toLowerCase()) throw new Error('Select the platform administrator wallet in MetaMask.')
        if (!txHash) {
          txHash = await wallet.disputeTransaction({
            escrowAddress: dispute.escrow.address, taskId: dispute.escrow.taskId,
            refundConsumer: decision === 'uphold',
            onSubmitted: hash => sessionStorage.setItem(key, JSON.stringify({ txHash: hash, decision, note })),
            onReverted: () => sessionStorage.removeItem(key),
          })
          if (!txHash) throw new Error('Resolution was not confirmed. Check MetaMask; a submitted transaction is retained for verification.')
        }
      }
      await api.resolveDispute(dispute.id, decision, note, txHash)
      sessionStorage.removeItem(key)
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(null) }
  }

  async function retryReview(dispute) {
    if (busy) return
    setBusy(dispute.id); setError('')
    try { await api.retryDisputeReview(dispute.id); await load() }
    catch (e) { setError(e.message) } finally { setBusy(null) }
  }

  return <section className="space-y-3">
    <h2 className="text-base font-semibold">{admin ? 'Dispute management' : 'Your disputes'}</h2>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {wallet.error && <p role="alert" className="text-sm text-red-600">{wallet.error}</p>}
    {!disputes.length && <p className="text-sm text-slate-500">No disputes recorded.</p>}
    {disputes.map(dispute => <article key={dispute.id} className="ui-panel rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
      <p className="text-sm font-semibold">{dispute.taskId} · {dispute.status}</p>
      <p className="text-sm whitespace-pre-wrap">{dispute.reason}</p>
      {dispute.txHash && <p className="text-xs text-slate-500">Payment frozen on-chain · {dispute.txHash}</p>}
      {dispute.review && <p className="text-sm">Review: {dispute.review.verdict} · {dispute.review.note}</p>}
      {dispute.reviewError && <p className="text-sm text-amber-600">Independent review failed: {dispute.reviewError}. Payment remains frozen for dispute-aware escrows.</p>}
      {dispute.resolutionNote && <p className="text-sm">Decision: {dispute.resolutionNote}</p>}
      {dispute.resolutionTxHash && <p className="text-xs text-slate-500 break-all">Settlement transaction: {dispute.resolutionTxHash}</p>}
      {dispute.status === 'review_failed' && <button disabled={Boolean(busy)} onClick={() => retryReview(dispute)} className="text-sm text-brand-600 disabled:opacity-40">{busy === dispute.id ? 'Retrying…' : 'Retry independent review'}</button>}
      {admin && !dispute.reviewPending && ((dispute.status === 'under_review' && dispute.review) || dispute.status === 'review_failed') && <div className="flex gap-3">
        <button disabled={Boolean(busy)} onClick={() => resolve(dispute, 'uphold')} className="text-sm text-brand-600 disabled:opacity-40">{busy === dispute.id ? 'Confirming…' : dispute.escrow ? 'Refund customer' : 'Uphold dispute'}</button>
        <button disabled={Boolean(busy)} onClick={() => resolve(dispute, 'reject')} className="text-sm text-brand-600 disabled:opacity-40">{dispute.escrow ? 'Release provider payment' : 'Reject dispute'}</button>
      </div>}
    </article>)}
  </section>
}
