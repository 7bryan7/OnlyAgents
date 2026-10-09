import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { onWSMessage } from '../ws'
import { useWallet } from '../hooks/useWallet'

export default function Tasks() {
  const wallet = useWallet()
  const [tasks, setTasks] = useState([])
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    try { const result = await api.tasks(); setTasks(result.tasks) }
    catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => {
    load()
    return onWSMessage((msg) => { if (msg.type === 'hello' || ['all', 'tasks'].includes(msg.resource)) load() })
  }, [load])
  async function view(id) {
    setError('')
    try { setDetail(await api.task(id)) } catch (e) { setError(e.message) }
  }
  async function retry(id) {
    setBusy(true); setError('')
    try {
      const result = await api.retryTask(id)
      setDetail(result)
      if (result.execution.success) await api.auditTask(id)
      await load()
    } catch (e) { setError(e.message); await load() } finally { setBusy(false) }
  }
  async function settle(task) {
    setBusy(true); setError('')
    try {
      if (!wallet.address) { await wallet.connect(); setError('Select the payment wallet, then click release again.'); return }
      if (wallet.address.toLowerCase() !== task.consumer?.toLowerCase()) throw new Error('Select the wallet that created this escrow in MetaMask.')
      const { chain } = await api.chain()
      if (!chain?.taskEscrow) throw new Error('TaskEscrow is not configured.')
      const txHash = await wallet.completeEscrowTask({ escrowAddress: chain.taskEscrow, taskId: task.escrowTaskId })
      if (!txHash) throw new Error('Settlement was not completed. Check the wallet message.')
      await api.confirmTask(task.id, txHash)
      await load(); await view(task.id)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <div className="max-w-5xl space-y-5 text-slate-800 dark:text-slate-200">
    <h1 className="font-sora text-2xl font-bold">Task history</h1>
    <p className="text-sm text-slate-500">Your most recent 100 tasks. Failed executions can be retried without creating another escrow payment.</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {loading ? <p>Loading task history…</p> : !tasks.length ? <p>No tasks recorded yet. Run a task from the dashboard to get started.</p> :
      <div className="space-y-3">{tasks.map((task) => <article key={task.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex justify-between gap-3"><p className="font-semibold text-sm">{task.task}</p><span className="text-xs">{task.status}</span></div>
        <p className="text-xs text-slate-500 mt-2">{task.agent?.name || task.agentId} · {new Date(task.ts).toLocaleString()} · {task.source || 'unverified'}{task.model ? ' / ' + task.model : ''}</p>
        {task.escrowTaskId && <p className="text-xs text-slate-500 mt-1">Escrow #{task.escrowTaskId} · {task.amountEth} ETH · {task.txHash}</p>}
        <div className="mt-3 flex gap-3"><button className="text-sm text-brand-600" onClick={() => view(task.id)}>View output</button>{task.status === 'failed' && <button className="text-sm text-brand-600 disabled:opacity-40" disabled={busy} onClick={() => retry(task.id)}>{busy ? 'Retrying…' : 'Retry execution'}</button>}{task.escrowTaskId && task.status === 'completed' && <button className="text-sm text-brand-600 disabled:opacity-40" disabled={busy} onClick={() => settle(task)}>Confirm & release payment</button>}</div>
      </article>)}</div>}
    {detail && <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <h2 className="font-semibold">Task output</h2><p className="mt-1 text-xs text-slate-500">{detail.task.id} · {detail.task.status}</p>
      <pre className="whitespace-pre-wrap break-words mt-3 text-sm font-sans">{detail.execution?.output || 'No execution output was recorded.'}</pre>
    </section>}
  </div>
}
