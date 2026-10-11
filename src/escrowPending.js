// Retain submitted dispute transactions across reloads until API verification
// succeeds. Keys are scoped to the signed-in wallet and task/dispute ID.
export function pendingEscrowAction(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') } catch { return null }
}

export const pendingPaymentKey = (wallet, taskId) => `oa:payment:${wallet.toLowerCase()}:${taskId}`
export const pendingHireKey = (wallet, agentId) => `oa:hire:${wallet.toLowerCase()}:${agentId}`
