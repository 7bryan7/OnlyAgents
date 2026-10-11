import { test, expect } from '@playwright/test'
import { installTestSession } from '../browser-fixture.js'

const account = '0x1111111111111111111111111111111111111111'

async function installWallet(page, failure = null) {
  await installTestSession(page, { provider: false })
  await page.addInitScript(({ account, failure }) => {
    window.walletCalls = []
    const listeners = new Map()
    const provider = {
      isMetaMask: true,
      async request({ method }) {
        window.walletCalls.push(method)
        if (method === 'eth_chainId') return '0x1'
        if (method === 'eth_accounts') return localStorage.getItem('wallet-approved') ? [account] : []
        if (method === 'eth_requestAccounts') {
          if (failure) throw Object.assign(new Error('Wallet fixture error'), { code: failure })
          localStorage.setItem('wallet-approved', 'true')
          return [account]
        }
        throw new Error('Unexpected wallet request: ' + method)
      },
      on(event, fn) {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event).add(fn)
      },
      removeListener(event, fn) { listeners.get(event)?.delete(fn) },
    }
    window.emitWalletEvent = (event, payload) => listeners.get(event)?.forEach((fn) => fn(payload))
    // No window.ethereum: verify modern discovery works on its own.
    window.addEventListener('eip6963:requestProvider', () => {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: {
        info: { uuid: 'wallet-test', name: 'MetaMask', rdns: 'io.metamask' }, provider,
      } }))
    })
  }, { account, failure })
}

test('discovers MetaMask, connects without switching chains, shares state and reconnects after reload', async ({ page }) => {
  await installWallet(page)
  await page.goto('/app/wallet')
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Wallet', level: 1, exact: true })).toBeVisible()
  await expect(page.getByText(/Connected 0x111111/)).toBeVisible()
  expect(await page.evaluate(() => window.walletCalls)).not.toContain('wallet_switchEthereumChain')
  await page.reload()
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
  await page.getByRole('button', { name: 'Reconnect wallet', exact: true }).click()
  await expect(page.getByText(/Connected 0x111111/)).toBeVisible()
  await page.locator('button[aria-controls="services-navigation"]').click()
  await page.getByRole('link', { name: 'Agent Marketplace', exact: true }).click()
  await page.getByRole('button', { name: 'Create Agent' }).click()
  await expect(page.getByText('Wallet connected', { exact: true })).toBeVisible()
  await expect(page.getByText(account, { exact: true })).toBeVisible()
  await page.evaluate(() => window.emitWalletEvent('accountsChanged', []))
  await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible()
})

for (const scenario of [
  { code: 4001, message: 'Wallet request declined' },
  { code: -32002, message: 'A wallet request is already pending' },
]) {
  test(`wallet connection displays actionable error for ${scenario.code}`, async ({ page }) => {
    await installWallet(page, scenario.code)
    await page.goto('/app/wallet')
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(scenario.message)
    await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeEnabled()
  })
}

test('missing extension shows instructions instead of failing silently', async ({ page }) => {
  await installTestSession(page, { provider: false })
  await page.goto('/app/wallet')
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('MetaMask was not detected')
})
