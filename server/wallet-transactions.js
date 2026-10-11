import { formatEther, getAddress, parseAbi } from 'viem'
import { publicClient, AGENT_FACTORY_ADDRESS, TASK_ESCROW_ADDRESS, TREASURY_ADDRESS } from './chain.js'

const events = parseAbi([
  'event AgentMinted(address indexed owner, bytes32 indexed metadataHash, uint256 indexed tokenId)',
  'event TaskCreated(uint256 indexed taskId, address indexed consumer, address indexed agentOwner, uint256 amount)',
  'event TaskPaid(uint256 indexed taskId, address indexed agentOwner, uint256 payout, uint256 fee)',
  'event TaskReleased(uint256 indexed taskId, address indexed agentOwner, uint256 payout, uint256 fee)',
  'event TaskRefunded(uint256 indexed taskId, address indexed consumer, uint256 amount)',
])
const PAGE_BLOCKS = 2000n
const CHUNK = 200n
const cache = new Map()
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase()

export async function readWalletTransactions(address, beforeBlock) {
  let wallet
  try { wallet = getAddress(address) } catch { throw Object.assign(new Error('Invalid wallet address.'), { status: 400 }) }
  if (beforeBlock !== undefined && (typeof beforeBlock !== 'string' || !/^\d{1,16}$/.test(beforeBlock))) throw Object.assign(new Error('Invalid transaction history cursor.'), { status: 400 })
  const key = `${wallet.toLowerCase()}:${beforeBlock || 'latest'}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < 30000) return cached.value
  try {
    const latest = await publicClient.getBlockNumber()
    const requested = beforeBlock === undefined ? latest : BigInt(beforeBlock)
    const toBlock = requested < latest ? requested : latest
    const fromBlock = toBlock >= PAGE_BLOCKS ? toBlock - PAGE_BLOCKS + 1n : 0n
    const logs = []
    for (let start = fromBlock; start <= toBlock; start += CHUNK) {
      const end = start + CHUNK - 1n < toBlock ? start + CHUNK - 1n : toBlock
      const chunks = await Promise.all([
        AGENT_FACTORY_ADDRESS ? publicClient.getLogs({ address: AGENT_FACTORY_ADDRESS, events: events.slice(0, 1), fromBlock: start, toBlock: end, strict: true }) : [],
        TASK_ESCROW_ADDRESS ? publicClient.getLogs({ address: TASK_ESCROW_ADDRESS, events: events.slice(1), fromBlock: start, toBlock: end, strict: true }) : [],
      ])
      logs.push(...chunks.flat())
    }
    const rows = []
    const add = (log, type, direction, amount, counterparty) => {
      if (amount === 0n) return
      rows.push({ id: `${log.transactionHash}:${log.logIndex}:${type}:${direction}`, type, direction, amountEth: formatEther(amount), counterparty,
        contractAddress: log.address, transactionHash: log.transactionHash, blockNumber: String(log.blockNumber), logIndex: log.logIndex, status: 'confirmed',
        explorerUrl: `https://sepolia.basescan.org/tx/${log.transactionHash}`,
      })
    }
    for (const log of logs) {
      if (log.removed || !log.transactionHash || log.blockNumber == null) continue
      const a = log.args
      if (same(log.address, AGENT_FACTORY_ADDRESS) && log.eventName === 'AgentMinted') {
        if (same(a.owner, wallet)) add(log, 'Agent mint', 'sent', 1000000000000000n, TREASURY_ADDRESS)
        if (same(TREASURY_ADDRESS, wallet)) add(log, 'Mint fee', 'received', 1000000000000000n, a.owner)
      } else if (same(log.address, TASK_ESCROW_ADDRESS)) {
        if (log.eventName === 'TaskCreated' && same(a.consumer, wallet)) add(log, 'Escrow deposit', 'sent', a.amount, TASK_ESCROW_ADDRESS)
        if (log.eventName === 'TaskRefunded' && same(a.consumer, wallet)) add(log, 'Refund', 'received', a.amount, TASK_ESCROW_ADDRESS)
        if (['TaskPaid', 'TaskReleased'].includes(log.eventName)) {
          if (same(a.agentOwner, wallet)) add(log, 'Agent payout', 'received', a.payout, TASK_ESCROW_ADDRESS)
          if (same(TREASURY_ADDRESS, wallet)) add(log, 'Platform fee', 'received', a.fee, TASK_ESCROW_ADDRESS)
        }
      }
    }
    const blocks = new Map(await Promise.all([...new Set(rows.map(row => row.blockNumber))].map(async number => {
      const block = await publicClient.getBlock({ blockNumber: BigInt(number) })
      return [number, Number(block.timestamp) * 1000]
    })))
    for (const row of rows) row.timestamp = blocks.get(row.blockNumber)
    rows.sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)) || b.logIndex - a.logIndex || a.id.localeCompare(b.id))
    const value = { wallet, transactions: rows, fromBlock: String(fromBlock), toBlock: String(toBlock), nextCursor: fromBlock > 0n ? String(fromBlock - 1n) : null }
    if (cache.size >= 100) cache.delete(cache.keys().next().value)
    cache.set(key, { at: Date.now(), value })
    return value
  } catch {
    throw Object.assign(new Error('Transaction history is temporarily unavailable from Base Sepolia. Retry this page; older history may require an archive RPC.'), { status: 502 })
  }
}
