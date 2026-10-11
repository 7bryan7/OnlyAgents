import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './escrow-browser', workers: 1, timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5190', headless: true, trace: 'retain-on-failure',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5190 --strictPort',
    url: 'http://127.0.0.1:5190', reuseExistingServer: false,
    env: { VITE_API_URL: '' },
  },
})
