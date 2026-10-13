import { useCallback, useEffect, useRef, useState } from 'react'
import { Wallet, RefreshCw, ShieldCheck, Copy, Check, ArrowDownLeft, ArrowUpRight, ExternalLink, List } from 'lucide-react'
import { api } from '../api'
import { useData } from '../DataContext'
import { useWallet } from '../hooks/useWallet'

const button = 'rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40'
const panel = 'ui-panel rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4'

export default function WalletPage() {
  const { chain } = useData()
  const wallet = useWallet()
  const [treasury, setTreasury] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const copyRequest = useRef({ id: 0 })
  const isOperator = wallet.address && chain?.operator && wallet.address.toLowerCase() === chain.operator.toLowerCase()

  useEffect(() => { const generation = copyRequest.current; setCopyStatus(''); return () => { generation.id++ } }, [wallet.address])

  async function copyAddress() {
    const request = ++copyRequest.current.id
    try {
      await navigator.clipboard.writeText(wallet.address)
      if (request === copyRequest.current.id) setCopyStatus('Copied')
    } catch {
      if (request === copyRequest.current.id) setCopyStatus('Clipboard unavailable. Select and copy the address below.')
    }
  }

  async function loadTreasury() {
    setBusy(true)
    setError('')
    try {
      const result = await api.treasury()
      setTreasury(result.treasury)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return <div className="ui-section wallet-section w-full max-w-[1452px] mx-auto space-y-6 text-slate-800 dark:text-slate-200">
    <div>
      <span className="ui-eyebrow">Wallet & platform treasury</span>
          <h1 className="font-sora text-xl font-bold">Wallet</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage your connected wallet and view recorded on-chain platform fees.</p>
    </div>
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10">{error}</div>}
    <div className="grid items-start gap-6 lg:grid-cols-2">
    <section className={panel}>
      <h2 className="flex items-center gap-2 font-bold"><Wallet size={18} /> Wallet</h2>
      <p className="text-sm text-slate-500">Connect your wallet for Base Sepolia minting and hiring. Wallet ownership is verified before transactions.</p>
      <button className={button} onClick={() => wallet.connect()} disabled={wallet.connecting}>{wallet.connecting ? 'Connecting…' : wallet.address ? 'Reconnect wallet' : 'Connect wallet'}</button>
      {wallet.address && <div className="space-y-2">
        <div className="flex items-center gap-2"><span className="min-w-0 text-xs font-mono break-all">Connected {wallet.address}</span>
          <button type="button" aria-label="Copy connected wallet address" title="Copy wallet address" onClick={copyAddress} className="shrink-0 rounded-lg border border-slate-200 p-2 text-brand-600 hover:bg-brand-50 dark:border-slate-700 dark:text-brand-300 dark:hover:bg-slate-800">{copyStatus === 'Copied' ? <Check size={17} /> : <Copy size={17} />}</button>
        </div>
        {copyStatus && <p role="status" className="text-xs text-slate-500">{copyStatus}</p>}
        <p className="text-xs text-slate-500">{isOperator ? 'Configured operator wallet' : 'Operator wallet: ' + (chain?.operator || 'not configured')}</p>
      </div>}
      {wallet.error && <p role="alert" className="text-sm text-red-600">{wallet.error}</p>}
    </section>
    <section className={panel}><h2 className="flex items-center gap-2 font-bold"><ShieldCheck size={18} /> On-chain treasury</h2>
      <p className="text-sm text-slate-500">Read mined contract events from the configured Base Sepolia RPC. Connection alone does not prove a payment.</p>
      <button className={button} onClick={loadTreasury} disabled={busy}><RefreshCw size={14} className="inline mr-2" />Load on-chain treasury</button>
      {treasury && <div className="text-sm space-y-2"><p>Task fees: {treasury.taskFeesEth} ETH · Mint fees: {treasury.mintFeesEth} ETH</p><p>Paid tasks: {treasury.tasksPaid} · Minted agents: {treasury.agentsMinted}</p><p className="text-xs text-slate-500">{treasury.scope}</p></div>}
    </section>
    </div>
    {wallet.address && <Transactions key={wallet.address.toLowerCase()} address={wallet.address} />}
  </div>
}

function Transactions({ address }) {
  const [transactions, setTransactions] = useState([])
  const [page, setPage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef({ id: 0 })
  const load = useCallback(async (beforeBlock) => {
    const request = ++sequence.current.id
    setBusy(true); setError('')
    try {
      const result = await api.walletTransactions(address, beforeBlock)
      if (request !== sequence.current.id) return
      setTransactions(previous => {
        const all = beforeBlock === undefined ? result.transactions : [...previous, ...result.transactions]
        return [...new Map(all.map(row => [row.id, row])).values()]
      })
      setPage(previous => ({ ...result, toBlock: beforeBlock === undefined ? result.toBlock : previous.toBlock }))
    } catch (e) {
      if (request === sequence.current.id) setError(e.message)
    } finally {
      if (request === sequence.current.id) setBusy(false)
    }
  }, [address])

  useEffect(() => { const generation = sequence.current; load(); return () => { generation.id++ } }, [load])

  return <section className={panel} aria-label="Transactions">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 font-bold"><List size={18} /> Transactions</h2>
        <p className="mt-1 text-sm text-slate-500">Confirmed payments for this wallet through the current OnlyAgents contracts.</p>
      </div>
      <button className={button} onClick={() => load()} disabled={busy}><RefreshCw size={14} className={`inline mr-2 ${busy ? 'animate-spin' : ''}`} />Refresh transactions</button>
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10">{error}</p>}
    {busy && !page && <p role="status" className="text-sm text-slate-500">Loading transactions…</p>}
    {page && !transactions.length && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500 dark:bg-slate-800/50">No contract payments for this wallet in the loaded block range. Load older activity to look further back.</p>}
    {!!transactions.length && <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-500"><tr>{['Date', 'Payment', 'Amount', 'Counterparty', 'Transaction'].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
        <tbody>{transactions.map(row => <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
          <td className="whitespace-nowrap px-3 py-4 text-xs text-slate-500">{new Date(row.timestamp).toLocaleString()}</td>
          <td className="whitespace-nowrap px-3 py-4"><span className="font-semibold">{row.type}</span><span className="mt-1 flex items-center gap-1 text-xs text-slate-500">{row.direction === 'received' ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}{row.direction === 'received' ? 'Received' : 'Sent'} · Confirmed</span></td>
          <td className={`whitespace-nowrap px-3 py-4 font-semibold tabular-nums ${row.direction === 'received' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>{row.direction === 'received' ? '+' : '−'}{row.amountEth} ETH</td>
          <td className="px-3 py-4 font-mono text-xs"><span title={row.counterparty}>{row.counterparty.slice(0, 8)}…{row.counterparty.slice(-6)}</span></td>
          <td className="px-3 py-4"><a href={row.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-xs text-brand-600 dark:text-brand-300" aria-label={`View ${row.type} transaction on BaseScan`}>{row.transactionHash.slice(0, 10)}…<ExternalLink size={13} /></a></td>
        </tr>)}</tbody>
      </table>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500">{page ? `Blocks ${page.fromBlock}–${page.toBlock} · Mint fees, escrow deposits, payouts, refunds and platform fees.` : 'Base Sepolia · Current contracts only'}</p>
      {page?.nextCursor != null && <button className={button} disabled={busy} onClick={() => load(page.nextCursor)}>{busy ? 'Loading…' : 'Load older transactions'}</button>}
      {!page && error && <button className={button} disabled={busy} onClick={() => load()}>Retry transaction history</button>}
    </div>
  </section>
}
