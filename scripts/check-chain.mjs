import { isAddress, parseAbi } from 'viem'
import { publicClient, AGENT_FACTORY_ADDRESS, TASK_ESCROW_ADDRESS, TREASURY_ADDRESS } from '../server/chain.js'

let failed = false
function check(ok, message) { console.log(`${ok ? 'OK' : 'NEEDED'}: ${message}`); if (!ok) failed = true }
try {
  check(await publicClient.getChainId() === 84532, 'RPC network is Base Sepolia')
  console.log('Current block: ' + await publicClient.getBlockNumber())
  for (const [name, address] of [['AgentFactory', AGENT_FACTORY_ADDRESS], ['TaskEscrow', TASK_ESCROW_ADDRESS]]) {
    if (!isAddress(address || '')) { check(false, name + ' address configured'); continue }
    const code = await publicClient.getCode({ address })
    check(!!code && code !== '0x', name + ' has deployed bytecode')
    if (!code || code === '0x') continue
    const treasury = await publicClient.readContract({ address, abi: parseAbi(['function treasury() view returns (address)']), functionName: 'treasury' })
    check(treasury.toLowerCase() === TREASURY_ADDRESS?.toLowerCase(), name + ' treasury matches configuration')
    if (name === 'TaskEscrow') {
      try {
        await publicClient.readContract({ address, abi: parseAbi(['function lockedBalance() view returns (uint256)']), functionName: 'lockedBalance' })
        check(true, 'Escrow exposes current locked-balance protection')
      } catch { check(false, 'Escrow is missing current locked-balance protection; deploy updated contract source') }
    }
  }
} catch { check(false, 'Chain check failed. Check RPC availability and contract configuration; no credentials were printed.') }
console.log('Read-only check: no transactions sent and no wallet funds used.')
process.exitCode = failed ? 1 : 0
