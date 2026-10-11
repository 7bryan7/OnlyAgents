import { testWallets } from './session-fixture.js'
import { test } from '@playwright/test'
let sessionIndex = 0

export async function installTestSession(page, { provider = true } = {}) {
  const index = test.info().workerIndex * 100 + sessionIndex++
  await page.context().addCookies([{ name: 'oa_session', value: `onlyagent-browser-${index}`, url: 'http://127.0.0.1:5189', httpOnly: true, sameSite: 'Lax' }])
  if (provider) await page.addInitScript(address => {
    window.ethereum = {
      isMetaMask: true,
      async request({ method }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address]
        if (method === 'eth_chainId') return '0x14a34'
        throw new Error('Unexpected fixture wallet request: ' + method)
      }, on() {}, removeListener() {},
    }
  }, testWallets['test-user'])
}
