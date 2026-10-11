import { isAddress, parseAbi } from 'viem'
import { publicClient, AGENT_FACTORY_ADDRESS, TASK_ESCROW_ADDRESS, TREASURY_ADDRESS } from '../server/chain.js'
import { ESCROW_ABI } from '../shared/escrow.js'

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
    const contractOwner = await publicClient.readContract({ address, abi: parseAbi(['function owner() view returns (address)']), functionName: 'owner' })
    check(contractOwner.toLowerCase() === TREASURY_ADDRESS?.toLowerCase(), name + ' owner matches platform owner')
    if (name === 'TaskEscrow') {
      try {
        await publicClient.readContract({ address, abi: parseAbi(['function lockedBalance() view returns (uint256)']), functionName: 'lockedBalance' })
        check(true, 'Escrow exposes current locked-balance protection')
      } catch { check(false, 'Escrow is missing current locked-balance protection; deploy updated contract source') }
      try {
        const version = await publicClient.readContract({ address, abi: ESCROW_ABI, functionName: 'VERSION' })
        check(version === 2n, 'Escrow supports delivery-based review, dispute freezes and refunds')
        const operator = await publicClient.readContract({ address, abi: ESCROW_ABI, functionName: 'deliveryOperator' })
        const owner = await publicClient.readContract({ address, abi: ESCROW_ABI, functionName: 'owner' })
        check(operator.toLowerCase() !== owner.toLowerCase(), 'Delivery operator is separate from administrator')
        if (process.env.ESCROW_OPERATOR_ADDRESS) check(operator.toLowerCase() === process.env.ESCROW_OPERATOR_ADDRESS.toLowerCase(), 'Delivery operator matches deployment configuration')
      } catch { check(false, 'Escrow v2 is not deployed; new hires remain disabled') }
    }
  }
} catch { check(false, 'Chain check failed. Check RPC availability and contract configuration; no credentials were printed.') }
console.log('Read-only check: no transactions sent and no wallet funds used.')
process.exitCode = failed ? 1 : 0
