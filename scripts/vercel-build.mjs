import { spawnSync } from 'node:child_process'

// API Functions run on the frontend origin; no cross-site session cookies.
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_API_URL: '', VITE_LIVE_UPDATES: 'poll' },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
