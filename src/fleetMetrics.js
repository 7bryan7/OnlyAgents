export function fleetHistory(agents, metric) {
  return Array.from({ length: 30 }, (_, i) => {
    const points = agents.map((a) => a.history[metric][i]).filter((p) => p.value != null)
    const samples = points.reduce((s, p) => s + p.samples, 0)
    const value = metric === 'tasks' ? points.reduce((s, p) => s + p.value, 0)
      : !samples ? null : points.reduce((s, p) => s + p.value * p.samples, 0) / samples
    return { day: `D-${29 - i}`, value, samples }
  })
}

export function periodValue(series, metric) {
  if (metric === 'tasks') return series.reduce((s, p) => s + (p.value || 0), 0)
  if (metric === 'trust') return series.at(-1)?.value ?? null
  const samples = series.reduce((s, p) => s + p.samples, 0)
  return samples ? series.reduce((s, p) => s + (p.value || 0) * p.samples, 0) / samples : null
}

export function periodChange(series, metric, days) {
  if (days * 2 > series.length) return null
  const now = periodValue(series.slice(-days), metric)
  const before = periodValue(series.slice(-days * 2, -days), metric)
  return now == null || !before ? null : Math.round((now - before) / before * 1000) / 10
}
