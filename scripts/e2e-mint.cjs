// ---------------------------------------------------------------------------
// End-to-end mint flow test against a LOCAL Hardhat node (simulates Base
// Sepolia): deploy contracts → mint an agent (as the "user wallet") → verify
// the txHash through the backend's on-chain verification → agent created.
//
//   npx hardhat run scripts/e2e-mint.cjs --network localhost
// ---------------------------------------------------------------------------
const hre = require('hardhat')

async function main() {
  const [, user] = await hre.ethers.getSigners()
  const treasury = '0x2e0113c8806c8bFFd9cAA0861a9D1ffFE66E48A8'

  // 1. Deploy
  const AgentFactory = await hre.ethers.getContractFactory('AgentFactory')
  const factory = await AgentFactory.deploy(treasury)
  await factory.waitForDeployment()
  const factoryAddr = await factory.getAddress()
  console.log('AgentFactory:', factoryAddr)

  // 2. Mint as the user (0.001 ETH fee)
  const name = 'Pixel Bot'
  const personaPrompt = 'A cheerful pixel-art designer who loves empty states and accessible contrast.'
  const specialty = 'Designer'
  const metadataHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`${name}|${personaPrompt}|${specialty}`))
  const tx = await factory.connect(user).mintAgent(metadataHash, { value: hre.ethers.parseEther('0.001') })
  const receipt = await tx.wait()
  console.log('Mint tx:', receipt.hash)
  console.log('Minter:', user.address)

  // 3. Print the backend env needed to verify against this local node
  console.log('\nBackend env for local verification:')
  console.log(`BASE_SEPOLIA_RPC=http://127.0.0.1:8545`)
  console.log(`BASE_SEPOLIA_AGENT_FACTORY=${factoryAddr}`)
  console.log(`\nPOST /api/agents/custom body:`)
  console.log('Sign in with the minting wallet; send its oa_session cookie and X-Requested-With: OnlyAgent. Identity comes from the verified session.')
  console.log(JSON.stringify({ txHash: receipt.hash, walletAddress: user.address, name, personaPrompt, specialty }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
