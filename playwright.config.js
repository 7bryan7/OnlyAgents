import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5189', headless: true, trace: 'retain-on-failure' },
  webServer: [
    { command: 'node tests/ui-server.js', url: 'http://127.0.0.1:8799/api/health', reuseExistingServer: false },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5189 --strictPort', url: 'http://127.0.0.1:5189', env: { VITE_API_URL: 'http://127.0.0.1:8799', VITE_GOOGLE_CLIENT_ID: '' }, reuseExistingServer: false },
  ],
})
