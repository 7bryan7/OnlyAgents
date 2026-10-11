// Test-only identities stored exclusively in temporary databases.
import { createHash } from 'node:crypto'
export const testWallets = {
  'test-user': '0x2e0113c8806c8bffd9caa0861a9d1fffe66e48a8',
  'other-user': '0x2222222222222222222222222222222222222222',
}
export const sessionCookie = name => `oa_session=onlyagent-fixture-${name}`
export function seedSessions(db) {
  for (const [name, walletAddress] of Object.entries(testWallets)) {
    db.prepare('INSERT OR REPLACE INTO sessions VALUES (?, ?, ?)').run(
      createHash('sha256').update(`onlyagent-fixture-${name}`).digest('hex'),
      JSON.stringify({ id: walletAddress, walletAddress, name: 'Test User' }), Date.now() + 86400000,
    )
  }
}

export function seedBrowserSessions(db) {
  // Separate sessions prevent logout in one context from revoking another.
  db.transaction(() => {
    for (let index = 0; index < 4096; index++) {
      db.prepare('INSERT OR REPLACE INTO sessions VALUES (?, ?, ?)').run(
        createHash('sha256').update(`onlyagent-browser-${index}`).digest('hex'),
        JSON.stringify({ id: testWallets['test-user'], walletAddress: testWallets['test-user'], name: 'Test User' }), Date.now() + 86400000,
      )
    }
  })()
}
