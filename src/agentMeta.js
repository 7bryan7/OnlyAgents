export { LIFECYCLE_STAGES } from '../server/agents'
export const STATUS_META = {
  active: { label: 'Active', color: '#10b981', bg: '#ecfdf5' },
  degraded: { label: 'Degraded', color: '#f59e0b', bg: '#fffbeb' },
  stalled: { label: 'Stalled', color: '#ef4444', bg: '#fef2f2' },
  idle: { label: 'Idle', color: '#94a3b8', bg: '#f1f5f9' },
}
export const trustColor = (value) => value >= 90 ? '#10b981' : value >= 70 ? '#3d6cec' : value >= 50 ? '#f59e0b' : '#ef4444'
export const fmtMs = (value) => value >= 1000 ? (value / 1000).toFixed(2) + 's' : Math.round(value) + 'ms'
