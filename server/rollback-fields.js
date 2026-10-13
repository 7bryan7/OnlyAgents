// Known metadata from the reverted NFT ownership feature must not prevent
// older application versions from loading their hosted snapshots.
export function removeRevertedFields(snapshot) {
  const cleaned = structuredClone(snapshot)
  const removed = { agents: 0, tasks: 0 }
  for (const [table, fields] of Object.entries({ agents: ['factoryAddress', 'mintedBy'], tasks: ['agentOwner'] })) {
    for (const row of cleaned.tables[table] || []) {
      for (const field of fields) {
        if (Object.hasOwn(row, field)) { delete row[field]; removed[table]++ }
      }
    }
  }
  return { snapshot: cleaned, removed }
}
