// ---------------------------------------------------------------------------
// Deploy dispute-aware TaskEscrow to Base Sepolia, preserving an existing factory.
//   npx hardhat run scripts/deploy.cjs --network baseSepolia
// Prints addresses + verification commands. Platform fees always route to the
// fixed platform owner wallet.
// ---------------------------------------------------------------------------
const hre = require('hardhat')
const PLATFORM_OWNER = '0x2e0113c8806c8bFFd9cAA0861a9D1ffFE66E48A8'

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  if ((await hre.ethers.provider.getNetwork()).chainId !== 84532n) throw new Error('Deployment requires Base Sepolia')
  if (deployer.address.toLowerCase() !== PLATFORM_OWNER.toLowerCase()) {
    throw new Error(`Deployment signer ${deployer.address} does not match platform owner ${PLATFORM_OWNER}`)
  }
  const treasury = deployer.address
  const operator = process.env.ESCROW_OPERATOR_ADDRESS
  if (!hre.ethers.isAddress(operator || '') || operator.toLowerCase() === PLATFORM_OWNER.toLowerCase()) {
    throw new Error('Set ESCROW_OPERATOR_ADDRESS to a dedicated delivery wallet, separate from the platform owner')
  }
  const reviewHours = Number(process.env.REVIEW_WINDOW_HOURS || 48)
  const reviewSeconds = reviewHours * 3600
  if (!Number.isSafeInteger(reviewSeconds) || reviewSeconds < 3600) throw new Error('REVIEW_WINDOW_HOURS must specify at least one hour in whole seconds')
  const fs = require('fs')
  const path = require('path')
  const out = path.join(__dirname, '..', 'deployed.json')
  const previous = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {}
  console.log('Deployer:', deployer.address)
  console.log('Treasury:', treasury)

  let factoryAddr = process.env.DEPLOY_NEW_AGENT_FACTORY === 'true' ? null : process.env.BASE_SEPOLIA_AGENT_FACTORY || previous.agentFactory
  if (factoryAddr) {
    if (!hre.ethers.isAddress(factoryAddr) || await hre.ethers.provider.getCode(factoryAddr) === '0x') throw new Error('Existing AgentFactory address has no deployed code; check network and configuration')
    const factory = await hre.ethers.getContractAt('AgentFactory', factoryAddr)
    const [owner, existingTreasury] = await Promise.all([factory.owner(), factory.treasury()])
    if (owner.toLowerCase() !== PLATFORM_OWNER.toLowerCase() || existingTreasury.toLowerCase() !== PLATFORM_OWNER.toLowerCase()) {
      throw new Error('Existing AgentFactory owner and treasury must match the platform owner before deployment; update the existing contract first')
    }
    const artifact = await hre.artifacts.readArtifact('AgentFactory')
    if ((await hre.ethers.provider.getCode(factoryAddr)).toLowerCase() !== artifact.deployedBytecode.toLowerCase()) {
      throw new Error('Existing AgentFactory does not match the fixed-treasury contract. Set DEPLOY_NEW_AGENT_FACTORY=true to deploy a replacement; existing NFTs remain at the original address')
    }
    console.log('AgentFactory retained:', factoryAddr)
  } else {
    const AgentFactory = await hre.ethers.getContractFactory('AgentFactory')
    const factory = await AgentFactory.deploy(treasury)
    await factory.waitForDeployment()
    factoryAddr = await factory.getAddress()
    console.log('AgentFactory deployed:', factoryAddr)
  }

  const TaskEscrow = await hre.ethers.getContractFactory('TaskEscrow')
  const escrow = await TaskEscrow.deploy(treasury, reviewSeconds, operator)
  await escrow.waitForDeployment()
  const escrowAddr = await escrow.getAddress()
  await (await escrow.transferOwnership(PLATFORM_OWNER)).wait()
  console.log('TaskEscrow deployed:', escrowAddr)

  console.log('\nVerify (Basescan Sepolia):')
  console.log(`npx hardhat verify --network baseSepolia ${escrowAddr} ${treasury} ${reviewSeconds} ${operator}`)

  // Write addresses for the backend to read (server/chain.js in Phase 2/3).
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        network: 'baseSepolia',
        chainId: 84532,
        treasury,
        agentFactory: factoryAddr,
        legacyAgentFactory: previous.legacyAgentFactory || (previous.agentFactory && previous.agentFactory.toLowerCase() !== factoryAddr.toLowerCase() ? previous.agentFactory : null),
        taskEscrow: escrowAddr,
        escrowVersion: 2,
        deliveryOperator: operator,
        reviewWindowHours: reviewHours,
        legacyTaskEscrow: process.env.LEGACY_TASK_ESCROW || previous.legacyTaskEscrow || process.env.BASE_SEPOLIA_TASK_ESCROW || previous.taskEscrow || null,
        deployedAt: new Date().toISOString(),
      },
      null,
      2
    )
  )
  console.log('\nAddresses written to deployed.json')
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
