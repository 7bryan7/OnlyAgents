import '../server/env.js'
process.env.PERSISTENCE_BACKEND = 'supabase'
await import('../server/index.js') // schema templates only; no server or timers
const { withHostedState } = await import('../server/hosted-persistence.js')
const { dbCounts, db } = await import('../server/db.js')
try {
  await withHostedState({}, async () => console.log('Supabase schema and application history are readable:', JSON.stringify(dbCounts())))
} catch (error) {
  console.error(error.status ? error.message : 'Supabase history could not be loaded. Check schema compatibility and server credentials.')
  process.exitCode = 1
} finally { db.close() }
