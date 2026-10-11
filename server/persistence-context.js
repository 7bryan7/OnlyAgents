import { AsyncLocalStorage } from 'node:async_hooks'

// Request-local SQL working copy and store. Supabase is the durable authority.
export const persistenceContext = new AsyncLocalStorage()
export const hosted = process.env.VERCEL === '1' || process.env.PERSISTENCE_BACKEND === 'supabase'

export async function flushPersistence() {
  await persistenceContext.getStore()?.flush?.()
}
