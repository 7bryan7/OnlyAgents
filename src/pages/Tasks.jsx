import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { onWSMessage } from '../ws'
import { useWallet } from '../hooks/useWallet'
import TaskRunner from '../components/TaskRunner'

export default function Tasks() {
  const wallet = useWallet()
  const [tasks, setTasks] = useState([])
  const [detail, setDetail] = useState(null)
  const [expandedTaskId, setExpandedTaskId] = useState(null)
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
    if (expandedTaskId === id) {
      setExpandedTaskId(null)
      setDetail(null)
      return
    }
    try {
      const result = await api.task(id)
      setDetail(result)
      setExpandedTaskId(id)
    } catch (e) { setError(e.message) }
  }
  async function retry(id) {
    setBusy(true); setError('')
    try {
      const result = await api.retryTask(id)
      setDetail(result)
      setExpandedTaskId(id)
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
  async function approve(task) {
    if (busy) return
    if (task.escrowTaskId) return settle(task)
    setBusy(true)
    try { await api.submitOutcome(task.id, 'accepted'); await load(); await view(task.id) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function revision(task) {
    const request = window.prompt('What specifically should the agent improve?')
    if (!request) return
    try { setBusy(true); await api.requestRevision(task.id, request); await load(); await view(task.id) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function dispute(task) {
    const reason = window.prompt('Why should this task be reviewed?')
    if (!reason) return
    try { await api.openDispute(task.id, reason); await load(); await view(task.id) } catch (e) { setError(e.message) }
  }
  return <div className="w-full space-y-5 text-slate-800 dark:text-slate-200">
    <h1 className="font-sora text-2xl font-bold">Task Runner</h1>
    <p className="text-sm text-slate-500">Run new tasks, review recent executions, and manage revisions or payment approval.</p>
    <div className="rounded-lg border border-brand-200 dark:border-brand-500/30 bg-brand-50/60 dark:bg-brand-500/5 px-3 py-2 text-xs text-brand-700 dark:text-brand-300">Private workspace: your task prompts and outputs are visible only to you. Aggregate performance signals improve public agent reputation.</div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] gap-5 items-start">
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">Run a new task</h2>
        <TaskRunner />
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">Recent task runs</h2>
        {loading ? <p>Loading recent task runs…</p> : !tasks.length ? <p>No task runs recorded yet. Use the runner above to get started.</p> :
          <div className="space-y-3">{tasks.map((task) => {
            const expanded = expandedTaskId === task.id && detail?.task?.id === task.id
            return <article key={task.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex justify-between gap-3"><p className="font-semibold text-sm">{task.task}</p><span className="text-xs">{task.status}</span></div>
              <p className="text-xs text-slate-500 mt-2">{task.agent?.name || task.agentId} · {new Date(task.ts).toLocaleString()} · {task.source || 'unverified'}{task.model ? ' / ' + task.model : ''}</p>
              {task.status === 'completed' && task.reviewDeadlineAt && <p className="text-xs text-amber-600 mt-1">Review by {new Date(task.reviewDeadlineAt).toLocaleString()} · payment remains held until approval</p>}
              {task.escrowTaskId && <p className="text-xs text-slate-500 mt-1">Escrow #{task.escrowTaskId} · {task.amountEth} ETH · {task.txHash}</p>}
              <div className="mt-3 flex flex-wrap gap-3">
                <button className="text-sm text-brand-600" onClick={() => view(task.id)}>{expanded ? 'Close' : 'View output'}</button>
                {task.status === 'failed' && <button className="text-sm text-brand-600 disabled:opacity-40" disabled={busy} onClick={() => retry(task.id)}>{busy ? 'Retrying…' : 'Retry execution'}</button>}
                {task.status === 'completed' && <><button className="text-sm text-brand-600 disabled:opacity-40" disabled={busy} onClick={() => approve(task)}>Approve{task.escrowTaskId ? ' & release payment' : ''}</button><button className="text-sm text-brand-600 disabled:opacity-40" disabled={busy} onClick={() => revision(task)}>Request revision</button><button className="text-sm text-amber-600 disabled:opacity-40" disabled={busy} onClick={() => dispute(task)}>Dispute</button></>}
              </div>
              {expanded && <section className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                <h3 className="font-semibold text-sm">Execution details</h3>
                <p className="mt-1 text-xs text-slate-500">{detail.task.id} · {detail.task.status}</p>
                <pre className="whitespace-pre-wrap break-words mt-3 text-sm font-sans">{detail.execution?.output || 'No execution output was recorded.'}</pre>
              </section>}
            </article>
          })}</div>}
      </section>
    </div>
  </div>
}
