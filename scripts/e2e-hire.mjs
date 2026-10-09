// ---------------------------------------------------------------------------
// End-to-end escrow hire flow test against real Base Sepolia:
//   createTask (0.001 ETH) → POST /api/tasks/hire → completeTask → confirm
//
// Uses the deployer wallet (PRIVATE_KEY from .env) as the consumer so the
// test needs no MetaMask. The backend verifies every tx on-chain — never
// trusts the client hash (PRD §7).
//
//   node scripts/e2e-hire.mjs
// ---------------------------------------------------------------------------
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { createWalletClient, createPublicClient, http, parseEther, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

const API = process.env.API_URL || 'http://localhost:8787'
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GOOGLE_ID_TOKEN || ''}` }
const deployed = JSON.parse(readFileSync(new URL('../deployed.json', import.meta.url), 'utf8'))
const escrow = deployed.taskEscrow
const treasury = deployed.treasury

const RPC = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org'
const account = privateKeyToAccount(process.env.PRIVATE_KEY)
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) })
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) })

const TASK_ESCROW_ABI = parseAbi([
  'function createTask(address agentOwner, uint256 amount) external payable returns (uint256 taskId)',
  'function completeTask(uint256 taskId) external',
])

const AMOUNT_ETH = 0.001
const TASK_TEXT = 'E2E test: summarize the escrow flow in three bullet points.'

async function main() {
  // Validate the session and eligibility before spending any testnet ETH.
  const me = await fetch(`${API}/api/auth/me`, { headers })
  if (!me.ok) throw new Error('Set GOOGLE_ID_TOKEN to a current signed-in Google ID token')
  const health = await (await fetch(`${API}/api/health`)).json()
  if (health.mode !== 'gemini') throw new Error('Configure Gemini before creating an escrow')
  const agentResponse = await fetch(`${API}/api/agents/ag-102`, { headers })
  if (!agentResponse.ok || !(await agentResponse.json()).agent.hireable) throw new Error('Agent ag-102 must be hireable before creating an escrow')
  console.log('consumer :', account.address)
  console.log('escrow   :', escrow)
  console.log('treasury :', treasury)
  console.log('amount   :', AMOUNT_ETH, 'ETH\n')

  // 1. Lock payment in escrow
  console.log('[1/4] createTask → locking', AMOUNT_ETH, 'ETH in escrow…')
  const createHash = await wallet.writeContract({
    address: escrow,
    abi: TASK_ESCROW_ABI,
    functionName: 'createTask',
    args: [treasury, parseEther(String(AMOUNT_ETH))],
    value: parseEther(String(AMOUNT_ETH)),
  })
  console.log('      tx:', createHash)
  const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createHash })
  console.log('      status:', createReceipt.status)

  // 2. Backend: verify escrow lock + run the agent
  console.log('[2/4] POST /api/tasks/hire (backend verifies on-chain)…')
  const hireRes = await fetch(`${API}/api/tasks/hire`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      task: TASK_TEXT,
      agentId: 'ag-102',
      amountEth: AMOUNT_ETH,
      txHash: createHash,
      walletAddress: account.address,
    }),
  })
  const hire = await hireRes.json()
  if (!hireRes.ok) {
    console.error('      FAILED:', hire.error)
    process.exitCode = 1
    return
  }
  if (!hire.execution.success) throw new Error('Execution failed; payment has not been confirmed: ' + hire.execution.output)
  console.log('      task id :', hire.task.id, `(${hire.task.status})`)
  console.log('      escrow  : task #', hire.escrow.taskId, '· payout', hire.escrow.payoutEth, '· fee', hire.escrow.feeEth)
  console.log('      agent   :', hire.execution.agent.name, '·', hire.execution.latencyMs, 'ms')
  console.log('      output  :', hire.execution.output.slice(0, 120))

  // 3. Consumer confirms completion on-chain
  console.log('[3/4] completeTask → releasing escrow…')
  const completeHash = await wallet.writeContract({
    address: escrow,
    abi: TASK_ESCROW_ABI,
    functionName: 'completeTask',
    args: [BigInt(hire.escrow.taskId)],
  })
  console.log('      tx:', completeHash)
  const completeReceipt = await publicClient.waitForTransactionReceipt({ hash: completeHash })
  console.log('      status:', completeReceipt.status)

  // 4. Backend: verify payout + settle
  console.log('[4/4] POST /api/tasks/:id/confirm (backend verifies TaskPaid)…')
  const confirmRes = await fetch(`${API}/api/tasks/${hire.task.id}/confirm`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ txHash: completeHash }),
  })
  const confirm = await confirmRes.json()
  if (!confirmRes.ok) {
    console.error('      FAILED:', confirm.error)
    process.exitCode = 1
    return
  }
  console.log('      status :', confirm.task.status)
  console.log('      payout :', confirm.payout.payoutEth, 'ETH →', confirm.payout.agentOwner)
  console.log('      fee    :', confirm.payout.feeEth, 'ETH → treasury')

  // 5. Treasury stats after
  const treasuryRes = await fetch(`${API}/api/treasury`, { headers })
  const t = (await treasuryRes.json()).treasury
  console.log('\nTreasury now: tasksPaid', t.tasksPaid, '· taskFees', t.taskFeesEth, 'ETH · total', t.totalEth, 'ETH')
  console.log('\n✅ FULL ESCROW CYCLE PASSED')
}

main().catch((e) => {
  console.error('E2E hire failed:', e.message)
  process.exitCode = 1
})
