import { test, expect } from '@playwright/test'

const customer = '0x1111111111111111111111111111111111111111'
const escrow = '0x4444444444444444444444444444444444444444'

async function setup(page, { walletMismatch = false, declinePayment = false, failHireOnce = false, receiptStatus = '0x1' } = {}) {
  await page.addInitScript(({ customer, escrow, declinePayment, receiptStatus }) => {
    window.walletRequests = []
    window.ethereum = {
      isMetaMask: true,
      async request({ method, params }) {
        window.walletRequests.push(method)
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [customer]
        if (method === 'eth_chainId') return '0x14a34'
        if (method === 'personal_sign') return '0x' + 'a'.repeat(130)
        if (method === 'eth_sendTransaction') {
          if (declinePayment) throw Object.assign(new Error('User rejected the request'), { code: 4001 })
          return '0x' + 'a'.repeat(64)
        }
        if (method === 'eth_getTransactionReceipt') return {
          transactionHash: params[0], blockHash: '0x' + 'b'.repeat(64), blockNumber: '0x1',
          transactionIndex: '0x0', from: customer, to: escrow, contractAddress: null,
          cumulativeGasUsed: '0x5208', gasUsed: '0x5208', effectiveGasPrice: '0x1',
          logs: [], logsBloom: '0x' + '0'.repeat(512), status: receiptStatus, type: '0x2',
        }
        throw new Error('Unexpected test wallet request: ' + method)
      }, on() {}, removeListener() {},
    }
  }, { customer, escrow, declinePayment, receiptStatus })
  const state = { hires: [], verified: !walletMismatch }
  const agent = {
    id: 'ag-hire', name: 'Hiring fixture', role: 'Writer', specialty: 'Writing',
    stage: { id: 'development', label: 'Development', color: '#2563eb' },
    status: 'active', reputationScore: 95, trustScore: 95, completionRate: 100,
    avgResponseTime: 1000, tasksCompleted: 20, auditsReceived: 5, hireable: true,
    tags: [], description: 'Fixture agent for the payment flow.',
  }
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let response = {}
    if (path === '/api/auth/me') response = { user: { id: customer, walletAddress: customer, name: 'Test wallet', role: 'user' } }
    else if (path === '/api/agents') response = { agents: [agent], mode: 'gemini' }
    else if (path === '/api/swarms') response = { swarms: [] }
    else if (path === '/api/audits') response = { audits: [], total: 0 }
    else if (path === '/api/config') response = { config: { reputation: { trust: 0.4, completion: 0.2, latency: 0.2, social: 0.2 }, hireThreshold: 70 } }
    else if (path === '/api/chain') response = { taskEscrow: escrow, escrowReady: true, escrowVersion: 2, treasury: customer }
    else if (path === '/api/events') response = { events: [] }
    else if (path === '/api/usage') response = { usage: { remaining: 100, used: 0, limit: 100 } }
    else if (path === '/api/wallet') response = { wallets: state.verified ? [{ wallet: customer }] : [] }
    else if (path === '/api/tasks/hire') {
      state.hires.push(request.postDataJSON())
      if (failHireOnce && state.hires.length === 1) return route.fulfill({ status: 400, json: { error: 'on-chain escrow verification failed: transaction did not call TaskEscrow' } })
      response = { task: { id: 'tk-hire', status: 'completed' }, execution: { success: true, output: 'Fixture deliverable', latencyMs: 1 }, escrow: { taskId: '1', amountEth: 0.001 } }
    }
    await route.fulfill({ json: response })
  })
  await page.goto('/app/marketplace')
  await page.getByRole('button', { name: 'Hire', exact: true }).click()
  await page.getByPlaceholder('Describe the task for Hiring fixture…').fill('Write a fixture deliverable')
  return state
}

test('hiring blocks a different signed-in wallet immediately and retries without an extra payment', async ({ page }) => {
  const state = await setup(page, { walletMismatch: true })
  await page.getByRole('button', { name: 'Pay & hire', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Sign out and sign in with the connected wallet before submitting a payment.')
  expect(await page.evaluate(() => window.walletRequests.filter(method => method === 'eth_sendTransaction'))).toHaveLength(0)
  expect(state.hires).toHaveLength(0)
  state.verified = true
  await page.getByRole('button', { name: 'Pay & hire', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirm & release payment', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.walletRequests.filter(method => method === 'eth_sendTransaction'))).toHaveLength(1)
  expect(state.hires).toHaveLength(1)
})

test('declining escrow payment displays an actionable error without starting the agent', async ({ page }) => {
  const state = await setup(page, { declinePayment: true })
  await page.getByRole('button', { name: 'Pay & hire', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Wallet request declined. Click Connect wallet to try again.')
  expect(state.hires).toHaveLength(0)
  await expect(page.getByRole('button', { name: 'Pay & hire', exact: true })).toBeEnabled()
})

test('a submitted hire survives reload and retries verification without another payment', async ({ page }) => {
  const state = await setup(page, { failHireOnce: true })
  await page.getByRole('button', { name: 'Pay & hire', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('transaction did not call TaskEscrow')
  expect(await page.evaluate(() => window.walletRequests.filter(method => method === 'eth_sendTransaction'))).toHaveLength(1)
  await page.reload()
  await page.getByRole('button', { name: 'Hire', exact: true }).click()
  await expect(page.getByPlaceholder('Describe the task for Hiring fixture…')).toHaveValue('Write a fixture deliverable')
  await expect(page.getByPlaceholder('Describe the task for Hiring fixture…')).toBeDisabled()
  await page.getByRole('button', { name: 'Retry payment verification', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirm & release payment', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.walletRequests.filter(method => method === 'eth_sendTransaction'))).toHaveLength(0)
  expect(state.hires[1]).toEqual(state.hires[0])
  expect(await page.evaluate(() => sessionStorage.getItem('oa:hire:0x1111111111111111111111111111111111111111:ag-hire'))).toBeNull()
})

test('an existing payment hash can be recovered without a new transaction', async ({ page }) => {
  const state = await setup(page)
  await page.getByText('Already sent a payment? Recover it', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Existing payment transaction hash' }).fill('0x' + 'a'.repeat(64))
  await page.getByRole('button', { name: 'Recover existing payment', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirm & release payment', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.walletRequests.filter(method => method === 'eth_sendTransaction'))).toHaveLength(0)
  expect(state.hires).toHaveLength(1)
})

test('a reverted hire clears its saved hash and never starts execution', async ({ page }) => {
  const state = await setup(page, { receiptStatus: '0x0' })
  await page.getByRole('button', { name: 'Pay & hire', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Transaction reverted')
  await expect(page.getByRole('button', { name: 'Pay & hire', exact: true })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('oa:hire:0x1111111111111111111111111111111111111111:ag-hire'))).toBeNull()
  expect(state.hires).toHaveLength(0)
})
