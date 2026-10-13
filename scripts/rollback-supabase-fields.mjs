import '../server/env.js'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { supabaseRpc } from '../server/supabase.js'
import { removeRevertedFields } from './lib/rollback-fields.mjs'

process.env.PERSISTENCE_BACKEND = 'supabase'
await import('../server/index.js') // validate against current application schema
const { db, createWorkingDatabase } = await import('../server/db.js')
const apply = process.argv.includes('--apply')
const owner = randomUUID()
let acquired = false
try {
  const state = await supabaseRpc(apply ? 'oa_acquire' : 'oa_read', apply ? { p_owner: owner } : {})
  acquired = apply
  const { snapshot, removed } = removeRevertedFields(state.snapshot)
  const working = createWorkingDatabase(snapshot)
  working.close()
  const counts = Object.fromEntries(Object.entries(snapshot.tables).map(([name, rows]) => [name, rows.length]))
  if (apply && Object.values(removed).some(Boolean)) {
    const directory = resolve('data/backups')
    mkdirSync(directory, { recursive: true })
    const backup = resolve(directory, `supabase-before-field-rollback-${Date.now()}.json`)
    writeFileSync(backup, JSON.stringify(state), { mode: 0o600, flag: 'wx' })
    await supabaseRpc('oa_commit', { p_owner: owner, p_version: state.version, p_snapshot: snapshot })
    console.log('Hosted field rollback applied. Backup:', backup)
  }
  console.log(JSON.stringify({ apply, removedFieldValues: removed, preservedRows: counts }))
} catch (error) {
  console.error(error.status ? error.message : 'Field rollback failed before validation or completion. Check schema compatibility and connectivity.')
  process.exitCode = 1
} finally {
  try { if (acquired) await supabaseRpc('oa_release', { p_owner: owner }) }
  finally { db.close() }
}
