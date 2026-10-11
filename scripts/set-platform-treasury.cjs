// Update already-deployed contracts so all future platform fees go to the
// fixed platform owner wallet. Run with the deployer's PRIVATE_KEY.
const hre = require('hardhat')
const deployed = require('../deployed.json')

const PLATFORM_OWNER = '0x2e0113c8806c8bFFd9cAA0861a9D1ffFE66E48A8'
const TREASURY_ABI = [
  'function owner() view returns (address)',
  'function treasury() view returns (address)',
  'function setTreasury(address treasury_)',
  'function transferOwnership(address newOwner)',
]

async function update(name, address) {
  const contract = await hre.ethers.getContractAt(TREASURY_ABI, address)
  const owner = await contract.owner()
  if (owner.toLowerCase() !== (await hre.ethers.getSigners())[0].address.toLowerCase()) {
    throw new Error(`${name} is owned by ${owner}; use that owner account to update its treasury`)
  }
  const current = await contract.treasury()
  if (current.toLowerCase() === PLATFORM_OWNER.toLowerCase()) {
    console.log(`${name}: treasury already routes fees to ${PLATFORM_OWNER}`)
  } else {
    const tx = await contract.setTreasury(PLATFORM_OWNER)
    await tx.wait()
    console.log(`${name}: treasury updated in ${tx.hash}`)
  }
  const updatedOwner = await contract.owner()
  if (updatedOwner.toLowerCase() !== PLATFORM_OWNER.toLowerCase()) {
    const tx = await contract.transferOwnership(PLATFORM_OWNER)
    await tx.wait()
    console.log(`${name}: ownership transferred to ${PLATFORM_OWNER} in ${tx.hash}`)
  } else {
    console.log(`${name}: ownership already belongs to ${PLATFORM_OWNER}`)
  }
}

async function main() {
  const [signer] = await hre.ethers.getSigners()
  if ((await hre.ethers.provider.getNetwork()).chainId !== 84532n) throw new Error('Treasury updates require Base Sepolia')
  const contracts = [['AgentFactory', deployed.agentFactory], ['TaskEscrow', deployed.taskEscrow]]
  if (deployed.legacyTaskEscrow && deployed.legacyTaskEscrow.toLowerCase() !== deployed.taskEscrow?.toLowerCase()) {
    contracts.push(['Legacy TaskEscrow', deployed.legacyTaskEscrow])
  }
  // Check every target before submitting any transaction.
  for (const [name, address] of contracts) {
    if (!hre.ethers.isAddress(address || '') || await hre.ethers.provider.getCode(address) === '0x') throw new Error(`${name}: missing deployed contract`)
    const contract = await hre.ethers.getContractAt(TREASURY_ABI, address)
    const [owner, treasury] = await Promise.all([contract.owner(), contract.treasury()])
    if (owner.toLowerCase() !== signer.address.toLowerCase() &&
        (owner.toLowerCase() !== PLATFORM_OWNER.toLowerCase() || treasury.toLowerCase() !== PLATFORM_OWNER.toLowerCase())) {
      throw new Error(`${name} is owned by ${owner}; use that owner account to update its treasury`)
    }
  }
  console.log('Signer:', signer.address)
  for (const [name, address] of contracts) {
    const contract = await hre.ethers.getContractAt(TREASURY_ABI, address)
    if ((await contract.owner()).toLowerCase() === PLATFORM_OWNER.toLowerCase() &&
        (await contract.treasury()).toLowerCase() === PLATFORM_OWNER.toLowerCase()) {
      console.log(`${name}: owner and treasury already match ${PLATFORM_OWNER}`)
      continue
    }
    await update(name, address)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
