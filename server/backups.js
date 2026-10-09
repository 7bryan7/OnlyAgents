import { mkdir, readdir, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function createBackup(db, dataDir, retention = 14) {
  const directory = resolve(dataDir, 'backups')
  await mkdir(directory, { recursive: true })
  const path = resolve(directory, `store-${Date.now()}.db`)
  await db.backup(path)
  const files = (await readdir(directory)).filter((name) => /^store-\d+\.db$/.test(name))
    .sort((a, b) => Number(b.slice(6, -3)) - Number(a.slice(6, -3)))
  for (const name of files.slice(Math.max(1, retention))) await unlink(resolve(directory, name))
  return path
}

export function startBackupScheduler(db, dataDir, options = {}) {
  const enabled = options.enabled ?? process.env.BACKUP_ENABLED === 'true'
  if (!enabled) return () => {}
  const hours = Math.max(1, Math.min(168, Number(options.hours ?? process.env.BACKUP_INTERVAL_HOURS) || 24))
  const retention = Math.max(1, Math.min(365, Number(options.retention ?? process.env.BACKUP_RETENTION) || 14))
  let pending = null, stopped = false
  const run = () => {
    if (pending || stopped) return
    pending = createBackup(db, dataDir, retention)
      .then(() => console.log('[backup] Consistent database snapshot saved.'))
      .catch(() => console.error('[backup] Snapshot failed. Check disk space and data-directory permissions.'))
      .finally(() => { pending = null })
  }
  run()
  const timer = setInterval(run, hours * 3600000)
  timer.unref()
  return async () => { stopped = true; clearInterval(timer); await pending }
}
