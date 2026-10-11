import { test, expect } from '@playwright/test'

const wallet = '0x1111111111111111111111111111111111111111'
const other = '0x2222222222222222222222222222222222222222'
const hash = '0x' + 'a'.repeat(64)
const row = { id: 'deposit', type: 'Escrow deposit', direction: 'sent', amountEth: '0.001', counterparty: other, transactionHash: hash, timestamp: 1791710000000, explorerUrl: `https://sepolia.basescan.org/tx/${hash}` }

async function setup(page, clipboardFails = false) {
  await page.addInitScript(({ wallet, clipboardFails }) => {
    window.copiedAddress = null
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => {
      if (clipboardFails) throw new Error('Clipboard denied')
      window.copiedAddress = text
    } } })
    const listeners = new Map()
    window.changeWallet = address => listeners.get('accountsChanged')?.([address])
    window.ethereum = { isMetaMask: true,
      request: async ({ method }) => {
        if (method === 'eth_requestAccounts') return [wallet]
        if (method === 'eth_chainId') return '0x14a34'
        throw new Error('Unexpected wallet request ' + method)
      }, on: (event, fn) => listeners.set(event, fn), removeListener: event => listeners.delete(event),
    }
  }, { wallet, clipboardFails })
  const state = { historyCalls: [], failOlder: true, failInitial: false }
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    let json = {}
    if (url.pathname === '/api/auth/me') json = { user: { id: wallet, walletAddress: wallet, name: 'Test wallet' } }
    else if (url.pathname === '/api/agents') json = { agents: [], mode: 'gemini' }
    else if (url.pathname === '/api/swarms') json = { swarms: [] }
    else if (url.pathname === '/api/audits') json = { audits: [], total: 0 }
    else if (url.pathname === '/api/config') json = { config: { reputation: { trust: 0.4, completion: 0.2, latency: 0.2, social: 0.2 }, hireThreshold: 70 } }
    else if (url.pathname === '/api/chain') json = { operator: other }
    else if (url.pathname === '/api/events') json = { events: [] }
    else if (url.pathname === '/api/usage') json = { usage: { remaining: 100, used: 0, limit: 100 } }
    else if (url.pathname === '/api/wallet/transactions') {
      state.historyCalls.push(url.searchParams.get('beforeBlock'))
      if (url.searchParams.get('walletAddress').toLowerCase() !== wallet) return route.fulfill({ status: 403, json: { error: 'Sign in with the connected wallet to view its transactions.' } })
      if (state.failInitial || (state.failOlder && url.searchParams.has('beforeBlock'))) return route.fulfill({ status: 502, json: { error: 'History temporarily unavailable' } })
      json = url.searchParams.has('beforeBlock') ? { transactions: [{ ...row, id: 'refund', type: 'Refund', direction: 'received' }], fromBlock: '0', toBlock: '2999', nextCursor: null } : { transactions: [row], fromBlock: '3000', toBlock: '4999', nextCursor: '2999' }
    }
    await route.fulfill({ json })
  })
  return state
}

test('copies the full wallet address and lists payments with safe older-page retry', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/app/wallet')
  await page.getByRole('button', { name: 'Copy connected wallet address' }).click()
  await expect(page.getByRole('status')).toHaveText('Copied')
  expect(await page.evaluate(() => window.copiedAddress)).toBe(wallet)
  const section = page.getByRole('region', { name: 'Transactions' })
  await expect(section.getByText('Escrow deposit', { exact: true })).toBeVisible()
  await expect(section.getByRole('link')).toHaveAttribute('href', row.explorerUrl)
  await section.getByRole('button', { name: 'Load older transactions' }).click()
  await expect(section.getByRole('alert')).toHaveText('History temporarily unavailable')
  await expect(section.getByText('Escrow deposit', { exact: true })).toBeVisible()
  state.failOlder = false
  await section.getByRole('button', { name: 'Load older transactions' }).click()
  await expect(section.getByText('Refund', { exact: true })).toBeVisible()
  expect(state.historyCalls.slice(-2)).toEqual(['2999', '2999'])
  await section.getByRole('button', { name: 'Refresh transactions' }).click()
  await expect(section.getByText('Refund', { exact: true })).toHaveCount(0)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: '/tmp/onlyagent-wallet-transactions.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/onlyagent-wallet-transactions-mobile.png', fullPage: true })
  await page.evaluate(other => window.changeWallet(other), other)
  await expect(page.getByRole('button', { name: 'Copy connected wallet address' })).toBeVisible()
  await expect(section.getByRole('alert')).toHaveText('Sign in with the connected wallet to view its transactions.')
  await expect(section.getByText('Escrow deposit', { exact: true })).toHaveCount(0)
})

test('clipboard and initial history failures offer recovery without a false success', async ({ page }) => {
  const state = await setup(page, true)
  state.failInitial = true
  await page.goto('/app/wallet')
  await page.getByRole('button', { name: 'Copy connected wallet address' }).click()
  await expect(page.getByRole('status')).toHaveText('Clipboard unavailable. Select and copy the address below.')
  await expect(page.getByText(`Connected ${wallet}`, { exact: true })).toBeVisible()
  state.failInitial = false
  await page.getByRole('button', { name: 'Retry transaction history' }).click()
  await expect(page.getByText('Escrow deposit', { exact: true })).toBeVisible()
})
