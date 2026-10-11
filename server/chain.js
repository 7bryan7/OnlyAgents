import './env.js'
// ---------------------------------------------------------------------------
// On-chain verification (PRD v2 §4.3, §7):
//   "All on-chain payments must be verified server-side against the actual
//    chain state before any off-chain effect is applied."
//
// The backend NEVER trusts a client-submitted txHash. It reads the receipt
// from Base Sepolia and parses the AgentMinted event emitted by AgentFactory —
// owner and metadataHash must match the request. The top-level transaction
// recipient may be a wallet smart-account/delegation wrapper that forwards
// the call to AgentFactory.
// ---------------------------------------------------------------------------

import { createPublicClient, http, keccak256, toBytes, parseAbi, parseAbiItem, decodeEventLog } from 'viem'
import { baseSepolia } from 'viem/chains'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RPC = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org'
export const PLATFORM_OWNER_ADDRESS = '0x2e0113c8806c8bFFd9cAA0861a9D1ffFE66E48A8'

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC, { timeout: 10000, retryCount: 1 }),
})

// AgentFactory address — from deployed.json (written by scripts/deploy.js),
// or BASE_SEPOLIA_AGENT_FACTORY env override.
function loadDeployed() {
  const file = fileURLToPath(new URL('../deployed.json', import.meta.url))
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
const deployed = loadDeployed()
export const AGENT_FACTORY_ADDRESS = process.env.BASE_SEPOLIA_AGENT_FACTORY || deployed?.agentFactory || null
export const TASK_ESCROW_ADDRESS = process.env.BASE_SEPOLIA_TASK_ESCROW || deployed?.taskEscrow || null
export const LEGACY_ESCROW_ADDRESS = process.env.LEGACY_TASK_ESCROW || deployed?.legacyTaskEscrow || TASK_ESCROW_ADDRESS
export const TREASURY_ADDRESS = PLATFORM_OWNER_ADDRESS

export async function factoryReadiness() {
  if (!AGENT_FACTORY_ADDRESS) return { ready: false, error: 'Deploy AgentFactory before enabling paid mints.' }
  try {
    const abi = parseAbi(['function owner() view returns (address)', 'function treasury() view returns (address)'])
    const [owner, treasury, chainId] = await Promise.all([
      publicClient.readContract({ address: AGENT_FACTORY_ADDRESS, abi, functionName: 'owner' }),
      publicClient.readContract({ address: AGENT_FACTORY_ADDRESS, abi, functionName: 'treasury' }),
      publicClient.getChainId(),
    ])
    if (chainId !== baseSepolia.id || owner.toLowerCase() !== PLATFORM_OWNER_ADDRESS.toLowerCase() || treasury.toLowerCase() !== PLATFORM_OWNER_ADDRESS.toLowerCase()) {
      return { ready: false, error: 'Mint contract must use Base Sepolia and the platform owner as owner and fee recipient.' }
    }
    return { ready: true }
  } catch {
    return { ready: false, error: 'Cannot verify the mint contract owner and fee recipient.' }
  }
}

// keccak256 of the agent profile — must match the frontend's computation.
export function metadataHashOf({ name, personaPrompt, specialty }) {
  return keccak256(toBytes(`${name}|${personaPrompt}|${specialty}`))
}

const AGENT_MINTED = parseAbiItem('event AgentMinted(address indexed owner, bytes32 indexed metadataHash, uint256 indexed tokenId)')
const TASK_CREATED = parseAbiItem('event TaskCreated(uint256 indexed taskId, address indexed consumer, address indexed agentOwner, uint256 amount)')
const TASK_PAID = parseAbiItem('event TaskPaid(uint256 indexed taskId, address indexed agentOwner, uint256 payout, uint256 fee)')
const TASK_RELEASED = parseAbiItem('event TaskReleased(uint256 indexed taskId, address indexed agentOwner, uint256 payout, uint256 fee)')

/**
 * Verify a mint transaction on-chain.
 * @param {string} txHash
 * @param {string} expectedOwner  wallet address that must own the mint
 * @param {string} expectedMetadataHash
 * @returns {Promise<{ok: boolean, error?: string, tokenId?: bigint, owner?: string}>}
 */
export async function verifyMint(txHash, expectedOwner, expectedMetadataHash) {
  if (!AGENT_FACTORY_ADDRESS) {
    return { ok: false, error: 'AgentFactory not deployed — no deployed.json and no BASE_SEPOLIA_AGENT_FACTORY env' }
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return { ok: false, error: 'invalid txHash format' }
  }

  let receipt
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  } catch {
    return { ok: false, error: 'transaction not found on chain' }
  }
  if (!receipt) return { ok: false, error: 'transaction not found on chain' }
  if (receipt.status !== 'success') return { ok: false, error: 'transaction reverted on chain' }
  // Parse AgentMinted events from the receipt logs. Requiring the event to be
  // emitted by AgentFactory proves the mint reached that contract while also
  // supporting EIP-7702/smart-account transactions whose outer `to` differs.
  const logs = receipt.logs
    .filter((l) => l.address.toLowerCase() === AGENT_FACTORY_ADDRESS.toLowerCase())
    .map((l) => {
      try {
        return decodeEventLog({ abi: [AGENT_MINTED], data: l.data, topics: l.topics })
      } catch {
        return null
      }
    })
    .filter(Boolean)

  const mint = logs.find(
    (l) => l.args.owner.toLowerCase() === expectedOwner.toLowerCase() && l.args.metadataHash === expectedMetadataHash
  )
  if (!mint) {
    return {
      ok: false,
      error: 'no AgentMinted event matching owner + metadata hash in this transaction',
    }
  }
  return { ok: true, tokenId: mint.args.tokenId, owner: mint.args.owner, metadataHash: mint.args.metadataHash }
}

// ---------------------------------------------------------------------------
// TaskEscrow verification (PRD §4.6) — same principle as verifyMint: read the
// receipt from the chain, confirm the tx hit TaskEscrow, and match the event
// args against what the client claimed. Never trust the client's txHash.
// ---------------------------------------------------------------------------

function decodeLogs(receipt, contractAddress, abiItem) {
  return receipt.logs
    .filter((l) => l.address.toLowerCase() === contractAddress.toLowerCase())
    .map((l) => {
      try {
        return decodeEventLog({ abi: [abiItem], data: l.data, topics: l.topics })
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

/**
 * Verify a createTask transaction on-chain.
 * @param {string} txHash
 * @param {string} expectedConsumer    wallet that must have locked the payment
 * @param {string} expectedAgentOwner  agent owner that must receive the payout
 * @param {bigint} expectedAmount      locked principal (wei)
 * @returns {Promise<{ok: boolean, error?: string, taskId?: bigint, amount?: bigint}>}
 */
export async function verifyCreateTask(txHash, expectedConsumer, expectedAgentOwner, expectedAmount) {
  if (!TASK_ESCROW_ADDRESS) {
    return { ok: false, error: 'TaskEscrow not deployed — no deployed.json and no BASE_SEPOLIA_TASK_ESCROW env' }
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return { ok: false, error: 'invalid txHash format' }
  }

  let receipt
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  } catch {
    return { ok: false, error: 'transaction not found on chain' }
  }
  if (!receipt) return { ok: false, error: 'transaction not found on chain' }
  if (receipt.status !== 'success') return { ok: false, error: 'transaction reverted on chain', reverted: true }
  // Wallet wrappers can forward createTask, making receipt.to the wallet.
  // Only a matching event emitted by our escrow proves the payment reached it.
  const created = decodeLogs(receipt, TASK_ESCROW_ADDRESS, TASK_CREATED).find(
    (l) =>
      l.args.consumer.toLowerCase() === expectedConsumer.toLowerCase() &&
      l.args.agentOwner.toLowerCase() === expectedAgentOwner.toLowerCase() &&
      l.args.amount === expectedAmount
  )
  if (!created) {
    return {
      ok: false,
      error: 'no TaskCreated event matching consumer + agent owner + amount in this transaction',
    }
  }
  return { ok: true, taskId: created.args.taskId, amount: created.args.amount }
}

/**
 * Verify a completeTask (or releaseTask) transaction on-chain.
 * @param {string} txHash
 * @param {bigint|string} expectedTaskId
 * @returns {Promise<{ok: boolean, error?: string, payout?: bigint, fee?: bigint, released?: boolean}>}
 */
export async function verifyCompleteTask(txHash, expectedTaskId, escrowAddress = TASK_ESCROW_ADDRESS) {
  if (!escrowAddress) {
    return { ok: false, error: 'TaskEscrow not deployed — no deployed.json and no BASE_SEPOLIA_TASK_ESCROW env' }
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return { ok: false, error: 'invalid txHash format' }
  }

  let receipt
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  } catch {
    return { ok: false, error: 'transaction not found on chain' }
  }
  if (!receipt) return { ok: false, error: 'transaction not found on chain' }
  if (receipt.status !== 'success') return { ok: false, error: 'transaction reverted on chain', reverted: true }
  const paid = decodeLogs(receipt, escrowAddress, TASK_PAID).find(
    (l) => l.args.taskId === BigInt(expectedTaskId)
  )
  if (paid) {
    return { ok: true, payout: paid.args.payout, fee: paid.args.fee, agentOwner: paid.args.agentOwner, released: false }
  }
  const released = decodeLogs(receipt, escrowAddress, TASK_RELEASED).find(
    (l) => l.args.taskId === BigInt(expectedTaskId)
  )
  if (released) {
    return { ok: true, payout: released.args.payout, fee: released.args.fee, agentOwner: released.args.agentOwner, released: true }
  }
  return { ok: false, error: 'no TaskPaid/TaskReleased event matching this taskId in the transaction' }
}

// ---------------------------------------------------------------------------
// Treasury stats (PRD §4.7) — cumulative fees read directly from contract
// events: TaskPaid + TaskReleased fees from TaskEscrow, plus mint fees from
// AgentFactory (0.001 ETH per AgentMinted).
// ---------------------------------------------------------------------------

// Base Sepolia public RPC caps eth_getLogs at a 10,000-block range, and
// prunes history before ~block 44.5M. The contracts were deployed 2026-08-30
// and only *used* since then, so scanning the last 100k blocks (~2.3 days)
// captures every real event while keeping the endpoint fast.
const LOG_CHUNK = BigInt(Math.max(1, Math.min(10000, Number(process.env.RPC_LOG_CHUNK) || 200)))
const TREASURY_SCAN_WINDOW = BigInt(Math.max(1, Math.min(100000, Number(process.env.TREASURY_SCAN_BLOCKS) || 2000)))

let treasuryCache = { at: 0, stats: null }
const TREASURY_TTL_MS = 60_000

async function getLogsPaged(address, event, fromBlock, toBlock) {
  const endBlock = toBlock === 'latest' ? await publicClient.getBlockNumber() : toBlock
  const logs = []
  let cursor = fromBlock
  while (cursor <= endBlock) {
    const end = cursor + LOG_CHUNK - 1n < endBlock ? cursor + LOG_CHUNK - 1n : endBlock
    const chunk = await publicClient.getLogs({ address, event, fromBlock: cursor, toBlock: end })
    logs.push(...chunk)
    cursor = end + 1n
  }
  return logs
}

export async function readTreasuryStats() {
  if (treasuryCache.stats && Date.now() - treasuryCache.at < TREASURY_TTL_MS) {
    return treasuryCache.stats
  }
  const stats = { taskFeesEth: 0, mintFeesEth: 0, tasksPaid: 0, agentsMinted: 0, escrow: null, factory: null }
  try {
    const latest = await publicClient.getBlockNumber()
    const from = latest >= TREASURY_SCAN_WINDOW ? latest - TREASURY_SCAN_WINDOW + 1n : 0n
    if (TASK_ESCROW_ADDRESS) {
      const [paidLogs, releasedLogs] = await Promise.all([
        getLogsPaged(TASK_ESCROW_ADDRESS, TASK_PAID, from, latest),
        getLogsPaged(TASK_ESCROW_ADDRESS, TASK_RELEASED, from, latest),
      ])
      const fees = [...paidLogs, ...releasedLogs].reduce((s, l) => s + l.args.fee, 0n)
      stats.taskFeesEth = Number(fees) / 1e18
      stats.tasksPaid = paidLogs.length + releasedLogs.length
      stats.escrow = TASK_ESCROW_ADDRESS
    }
    if (AGENT_FACTORY_ADDRESS) {
      const mintLogs = await getLogsPaged(AGENT_FACTORY_ADDRESS, AGENT_MINTED, from, latest)
      stats.agentsMinted = mintLogs.length
      stats.mintFeesEth = mintLogs.length * 0.001
      stats.factory = AGENT_FACTORY_ADDRESS
    }
  } catch (e) {
    throw Object.assign(new Error('Cannot read treasury events: ' + e.message.replaceAll(RPC, '[server RPC]')), { status: 502 })
  }
  stats.scope = `Recent ${TREASURY_SCAN_WINDOW.toLocaleString()} blocks; not lifetime revenue`
  stats.totalEth = stats.taskFeesEth + stats.mintFeesEth
  treasuryCache = { at: Date.now(), stats }
  return stats
}
