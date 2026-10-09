import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, DEFAULT_CONFIG } from './api'
import { onWSMessage } from './ws'

const DataContext = createContext(null)

/**
 * Loads agents / swarms / audits from the backend.
 * Exposes an explicit offline state when the API is unavailable.
 * Exposes runTask / auditTask for the live demo flow.
 */
export function DataProvider({ children }) {
  const [agents, setAgents] = useState([])
  const [swarms, setSwarms] = useState([])
  const [audits, setAudits] = useState([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [mode, setMode] = useState('loading')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [chain, setChain] = useState(null)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  // Live updates: the backend pushes `{ type: 'update', resource }` whenever
  // data changes (tasks, feed cycles, config, hires...). Re-fetch the affected
  // resource instead of waiting for the next poll. `all` refreshes everything.
  useEffect(() => {
    return onWSMessage((msg) => {
      if (msg.type === 'hello') { refresh(); return }
      if (msg.type !== 'update') return
      if (msg.resource === 'all' || msg.resource === 'agents' || msg.resource === 'config' || msg.resource === 'feed' || msg.resource === 'tasks') {
        refresh()
      }
    })
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([api.agents(), api.swarms(), api.audits(), api.config(), api.chain()]).then(([a, s, au, c, ch]) => {
      if (cancelled) return
      setAgents(a.agents)
      setSwarms(s.swarms)
      setAudits(au.audits)
      setAuditTotal(au.total || au.audits.length)
      setMode(a.live && s.live && au.live && c.live ? a.mode : 'offline')
      setConfig(c.config)
      setChain(ch.chain)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const runTask = useCallback(
    async (task, opts) => {
      const result = await api.runTask(task, opts)
      refresh()
      return result
    },
    [refresh]
  )

  const auditTask = useCallback(
    async (taskId, opts) => {
      const result = await api.auditTask(taskId, opts)
      refresh()
      return result
    },
    [refresh]
  )

  const updateConfig = useCallback(
    async (patch) => {
      const d = await api.updateConfig(patch)
      setConfig(d.config)
      refresh()
      return d.config
    },
    [refresh]
  )

  const hireTask = useCallback(
    async (payload) => {
      const result = await api.hireTask(payload)
      refresh()
      return result
    },
    [refresh]
  )

  const confirmTask = useCallback(
    async (taskId, txHash) => {
      const result = await api.confirmTask(taskId, txHash)
      refresh()
      return result
    },
    [refresh]
  )

  return (
    <DataContext.Provider
      value={{ agents, swarms, audits, auditTotal, mode, loading, refresh, runTask, auditTask, config, updateConfig, chain, hireTask, confirmTask }}
    >
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}