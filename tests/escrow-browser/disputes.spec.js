import { test, expect } from '@playwright/test'
import { decodeFunctionData, keccak256, toBytes } from 'viem'
import { ESCROW_ABI } from '../../shared/escrow.js'

const customer = '0x1111111111111111111111111111111111111111'
const administrator = '0x2e0113c8806c8bFFd9cAA0861a9D1ffFE66E48A8'
const escrow = '0x4444444444444444444444444444444444444444'

async function setup(page, admin = false) {
  const address = admin ? administrator : customer
  await page.addInitScript(({ address, escrow }) => {
    window.testTransactions = []
    window.ethereum = {
      isMetaMask: true,
      async request({ method, params }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address]
        if (method === 'eth_chainId') return '0x14a34'
        if (method === 'eth_sendTransaction') {
          window.testTransactions.push(params[0])
          return '0x' + 'a'.repeat(64)
        }
        if (method === 'eth_getTransactionReceipt') return {
          transactionHash: params[0], blockHash: '0x' + 'b'.repeat(64), blockNumber: '0x1',
          transactionIndex: '0x0', from: address, to: escrow, contractAddress: null,
          cumulativeGasUsed: '0x5208', gasUsed: '0x5208', effectiveGasPrice: '0x1',
          logs: [], logsBloom: '0x' + '0'.repeat(512), status: '0x1', type: '0x2',
        }
        throw new Error('Unexpected test wallet request: ' + method)
      },
      on() {}, removeListener() {},
    }
  }, { address, escrow })
  const state = { disputes: [], calls: [], attempts: 0, completed: false }
  const record = { id: 'dis-ui', taskId: 'tk-ui', reason: 'Incorrect fixture output', status: 'under_review', review: { verdict: 'fail', note: 'Missing acceptance criteria' }, txHash: '0x' + 'a'.repeat(64), escrow: { taskId: '7', address: escrow, version: 2, consumer: customer, status: 'disputed' } }
  if (admin) state.disputes.push(record)
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let response = {}
    if (path === '/api/auth/me') response = { user: { id: address.toLowerCase(), walletAddress: address.toLowerCase(), name: 'Test wallet', role: admin ? 'admin' : 'user' } }
    else if (path === '/api/agents') response = { agents: [], mode: 'gemini' }
    else if (path === '/api/swarms') response = { swarms: [] }
    else if (path === '/api/audits') response = { audits: [], total: 0 }
    else if (path === '/api/config') response = { config: { reputation: { trust: 0.4, completion: 0.2, latency: 0.2, social: 0.2 }, hireThreshold: 70 } }
    else if (path === '/api/chain') response = { taskEscrow: escrow, escrowReady: true, escrowVersion: 2 }
    else if (path === '/api/events') response = { events: [] }
    else if (path === '/api/usage') response = { usage: { remaining: 100, used: 0, limit: 100 } }
    else if (path === '/api/tasks') response = { tasks: admin ? [] : [{ id: 'tk-ui', task: 'Fixture task', status: state.taskStatus || (state.completed ? 'disputed' : 'completed'), ts: Date.now(), consumer: customer, escrowTaskId: '7', escrowAddress: escrow, escrowVersion: 2, amountEth: 0.001, agentId: 'ag-103', reviewDeadlineAt: Date.now() + 3600000 }] }
    else if (path === '/api/tasks/tk-ui') response = { task: { id: 'tk-ui', status: 'disputed' }, execution: { output: 'Fixture output' } }
    else if (path === '/api/disputes' || path === '/api/admin/disputes') response = { disputes: state.disputes }
    else if (request.method() === 'POST' && path === '/api/tasks/tk-ui/confirm') {
      state.calls.push(request.postDataJSON())
      if (++state.attempts === 1) return route.fulfill({ status: 503, json: { error: 'Fixture API temporarily unavailable' } })
      state.taskStatus = 'paid'
      response = { task: { id: 'tk-ui', status: 'paid' }, payout: { feeEth: 0.00007, payoutEth: 0.00093 } }
    }
    else if (request.method() === 'POST' && ['/api/tasks/tk-ui/dispute', '/api/disputes/dis-ui/resolve'].includes(path)) {
      state.calls.push(request.postDataJSON())
      if (++state.attempts === 1) return route.fulfill({ status: 503, json: { error: 'Fixture API temporarily unavailable' } })
      state.completed = true
      if (admin) { record.status = 'upheld'; record.resolutionNote = state.calls.at(-1).note; record.resolutionTxHash = state.calls.at(-1).txHash }
      else { record.reason = state.calls.at(-1).reason; state.disputes.push(record) }
      response = { dispute: record }
    }
    await route.fulfill({ json: response })
  })
  return state
}

test('customer signs a dispute freeze and recovers API verification after reload without paying/signing again', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/app/tasks')
  page.once('dialog', dialog => dialog.accept('Incorrect fixture output'))
  await page.getByRole('button', { name: 'Dispute', exact: true }).click()
  await expect(page.getByText('Fixture API temporarily unavailable')).toBeVisible()
  const sends = await page.evaluate(() => window.testTransactions)
  expect(sends).toHaveLength(1)
  const call = decodeFunctionData({ abi: ESCROW_ABI, data: sends[0].data })
  expect(call.functionName).toBe('openDispute')
  expect(call.args).toEqual([7n, keccak256(toBytes('Incorrect fixture output'))])
  await page.reload()
  await page.getByRole('button', { name: 'Dispute', exact: true }).click()
  await expect(page.getByText('disputed', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.testTransactions)).toHaveLength(0)
  expect(state.calls).toHaveLength(2)
  expect(state.calls[1]).toEqual(state.calls[0])
  expect(await page.evaluate(() => sessionStorage.getItem('oa:dispute:0x1111111111111111111111111111111111111111:tk-ui'))).toBeNull()
})

test('administrator signs a refund in MetaMask and retries only API verification after reload', async ({ page }) => {
  const state = await setup(page, true)
  await page.goto('/app/tasks')
  page.once('dialog', dialog => dialog.accept('Refund fixture'))
  await page.getByRole('button', { name: 'Refund customer', exact: true }).click()
  await expect(page.getByText('Fixture API temporarily unavailable')).toBeVisible()
  const sends = await page.evaluate(() => window.testTransactions)
  expect(sends).toHaveLength(1)
  const call = decodeFunctionData({ abi: ESCROW_ABI, data: sends[0].data })
  expect(call.functionName).toBe('resolveDispute')
  expect(call.args).toEqual([7n, true])
  await page.reload()
  await page.getByRole('button', { name: 'Refund customer', exact: true }).click()
  await expect(page.getByText('Decision: Refund fixture')).toBeVisible()
  expect(await page.evaluate(() => window.testTransactions)).toHaveLength(0)
  expect(state.calls).toHaveLength(2)
  expect(state.calls[1]).toEqual(state.calls[0])
})

test('minting is blocked before signing when platform payment configuration fails verification', async ({ page }) => {
  await setup(page)
  await page.route('**/api/chain', route => route.fulfill({ json: {
    agentFactory: escrow, deployed: true, mintFeeEth: '0.001', factoryReady: false,
    factoryError: 'Mint contract must use the platform owner as fee recipient.',
  } }))
  await page.goto('/app/marketplace')
  await page.getByRole('button', { name: 'Create Agent', exact: true }).click()
  await page.getByRole('button', { name: 'Continue →', exact: true }).click()
  await page.getByPlaceholder('e.g. Pixel Bot').fill('Payment fixture')
  await page.getByPlaceholder('Describe tone, voice and catchphrases — this drives the agent\'s social feed behavior.').fill('An agent for payment validation')
  await page.getByRole('button', { name: 'Mint for 0.001 ETH', exact: true }).click()
  await expect(page.getByText('Mint contract must use the platform owner as fee recipient.')).toBeVisible()
  expect(await page.evaluate(() => window.testTransactions)).toHaveLength(0)
})

test('payment receipt survives reload and API retry does not sign a second payment', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/app/tasks')
  await page.getByRole('button', { name: 'Approve & release payment', exact: true }).click()
  await expect(page.getByText('Fixture API temporarily unavailable')).toBeVisible()
  const sends = await page.evaluate(() => window.testTransactions)
  expect(sends).toHaveLength(1)
  expect(decodeFunctionData({ abi: ESCROW_ABI, data: sends[0].data }).functionName).toBe('completeTask')
  await page.reload()
  await page.getByRole('button', { name: 'Retry payment verification', exact: true }).click()
  await expect(page.getByText('paid', { exact: true }).first()).toBeVisible()
  expect(await page.evaluate(() => window.testTransactions)).toHaveLength(0)
  expect(state.calls).toHaveLength(2)
  expect(state.calls[1]).toEqual(state.calls[0])
  expect(await page.evaluate(() => sessionStorage.getItem('oa:payment:0x1111111111111111111111111111111111111111:tk-ui'))).toBeNull()
})

test('administrator can resolve a failed review with a written explanation', async ({ page }) => {
  const state = await setup(page, true)
  state.disputes[0].status = 'review_failed'
  state.disputes[0].reviewError = 'Reviewer unavailable'
  delete state.disputes[0].review
  state.attempts = 1
  await page.goto('/app/tasks')
  await expect(page.getByRole('button', { name: 'Retry independent review', exact: true })).toBeVisible()
  page.once('dialog', dialog => dialog.accept('Customer evidence supports a full refund.'))
  await page.getByRole('button', { name: 'Refund customer', exact: true }).click()
  await expect(page.getByText('Decision: Customer evidence supports a full refund.')).toBeVisible()
  expect(state.calls[0].note).toBe('Customer evidence supports a full refund.')
  expect(await page.evaluate(() => window.testTransactions)).toHaveLength(1)
})

test('a reverted payment clears its pending receipt so the customer can retry the transaction', async ({ page }) => {
  await setup(page)
  await page.addInitScript(() => sessionStorage.setItem('oa:payment:0x1111111111111111111111111111111111111111:tk-ui', JSON.stringify({ txHash: '0x' + 'c'.repeat(64) })))
  await page.route('**/api/tasks/tk-ui/confirm', route => route.fulfill({ status: 400, json: { error: 'transaction reverted on chain', transactionReverted: true } }))
  await page.goto('/app/tasks')
  await page.getByRole('button', { name: 'Retry payment verification', exact: true }).click()
  await expect(page.getByText('transaction reverted on chain')).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('oa:payment:0x1111111111111111111111111111111111111111:tk-ui'))).toBeNull()
  expect(await page.evaluate(() => window.testTransactions)).toHaveLength(0)
  await page.getByRole('button', { name: 'Approve & release payment', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.testTransactions.length)).toBe(1)
})
