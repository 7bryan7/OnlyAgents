import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '../server/db.js'
import { createBackup } from '../server/backups.js'
const root = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : fileURLToPath(new URL('../data', import.meta.url))
try { const path = await createBackup(db, root, Math.max(1, Number(process.env.BACKUP_RETENTION) || 14)); console.log('Consistent SQLite backup created: ' + path) }
finally { db.close() }
