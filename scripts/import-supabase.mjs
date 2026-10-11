import '../server/env.js'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { supabaseRpc } from '../server/supabase.js'
import { randomUUID } from 'node:crypto'

// Read-only source; no startup migration, deletion or modification of local data.
const source = resolve(process.argv.slice(2).find(value => !value.startsWith('--')) || 'data/store.db')
const database = new Database(source, { readonly: true, fileMustExist: true })
try {
  const names = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
  const tables = Object.fromEntries(names.map(({ name }) => [name, database.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()]))
  if ((tables.users || []).some(user => !/^0x[0-9a-f]{40}$/.test(user.id) || user.id !== user.walletAddress?.toLowerCase())) throw new Error('Migrate legacy email identities locally before importing.')
  // Hosted sessions must be re-established with a fresh wallet signature.
  for (const name of ['sessions', 'auth_challenges', 'request_keys']) if (name in tables) tables[name] = []
  const snapshot = { tables }
  const counts = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]))
  if (!process.argv.includes('--apply')) {
    console.log('Read-only import preview:', JSON.stringify(counts))
    console.log('Stop the local API, make a backup, configure Supabase server credentials locally, then repeat with --apply. The hosted database must be empty.')
  } else {
    const owner = randomUUID()
    const state = await supabaseRpc('oa_acquire', { p_owner: owner })
    try {
      if (Object.values(state.snapshot?.tables || {}).some(rows => rows.length > 0)) throw new Error('The hosted database already contains records. Import refused; no data was overwritten.')
      await supabaseRpc('oa_commit', { p_owner: owner, p_version: state.version, p_snapshot: snapshot })
      console.log('Imported existing wallet history. Local database is unchanged. Sign in again on the hosted application.')
    } finally { await supabaseRpc('oa_release', { p_owner: owner }) }
  }
} finally { database.close() }
