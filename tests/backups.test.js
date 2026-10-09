import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { createBackup, startBackupScheduler } from '../server/backups.js'

test('online backup preserves committed WAL data, is readable and retains only managed snapshots', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'onlyagent-backups-'))
  const db = new Database(join(directory, 'store.db'))
  try {
    db.pragma('journal_mode = WAL')
    db.exec("CREATE TABLE evidence (value TEXT); INSERT INTO evidence VALUES ('real persisted output')")
    const backups = join(directory, 'backups')
    await mkdir(backups)
    for (const name of ['store-1.db', 'store-2.db', 'unverified-history-1.db', 'notes.txt']) await writeFile(join(backups, name), 'preserve unless managed')
    const path = await createBackup(db, directory, 2)
    const copy = new Database(path, { readonly: true })
    try {
      assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok')
      assert.equal(copy.prepare('SELECT value FROM evidence').get().value, 'real persisted output')
    } finally { copy.close() }
    const files = await readdir(backups)
    assert.equal(files.includes('store-1.db'), false)
    assert.equal(files.includes('store-2.db'), true)
    assert.equal(files.includes('notes.txt'), true)
    assert.equal(files.includes('unverified-history-1.db'), true)
  } finally { db.close(); await rm(directory, { recursive: true, force: true }) }
})

test('scheduled backup runs on startup and shutdown waits for its snapshot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'onlyagent-backup-scheduler-'))
  const db = new Database(join(directory, 'store.db'))
  try {
    db.exec('CREATE TABLE test (id INTEGER)')
    const stop = startBackupScheduler(db, directory, { enabled: true, retention: 2 })
    await stop()
    assert.equal((await readdir(join(directory, 'backups'))).length, 1)
  } finally { db.close(); await rm(directory, { recursive: true, force: true }) }
})
