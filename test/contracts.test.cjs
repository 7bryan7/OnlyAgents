// ---------------------------------------------------------------------------
// Contract tests — mint flow + escrow flow on the local Hardhat network.
//   npx hardhat test
// ---------------------------------------------------------------------------
const { expect } = require('chai')
const { ethers } = require('hardhat')

const MINT_FEE = ethers.parseEther('0.001')
const FEE_BPS = 700n
const BPS = 10000n

describe('AgentFactory', function () {
  let factory, treasury, owner, buyer

  beforeEach(async function () {
    ;[owner, buyer, treasury] = await ethers.getSigners()
    const F = await ethers.getContractFactory('AgentFactory')
    factory = await F.deploy(treasury.address)
  })

  it('mints an agent for the fee and routes it to treasury', async function () {
    const meta = ethers.keccak256(ethers.toUtf8Bytes('maya-custom-v1'))
    const before = await ethers.provider.getBalance(treasury.address)

    await expect(factory.connect(buyer).mintAgent(meta, { value: MINT_FEE }))
      .to.emit(factory, 'AgentMinted')
      .withArgs(buyer.address, meta, 1n)

    expect(await factory.ownerOf(1n)).to.equal(buyer.address)
    expect(await factory.tokenByMetadata(meta)).to.equal(1n)
    expect(await ethers.provider.getBalance(treasury.address)).to.equal(before + MINT_FEE)
  })

  it('rejects underpayment', async function () {
    const meta = ethers.keccak256(ethers.toUtf8Bytes('x'))
    await expect(factory.connect(buyer).mintAgent(meta, { value: MINT_FEE - 1n })).to.be.revertedWith(
      'AgentFactory: insufficient fee'
    )
  })

  it('rejects duplicate metadata', async function () {
    const meta = ethers.keccak256(ethers.toUtf8Bytes('dup'))
    await factory.connect(buyer).mintAgent(meta, { value: MINT_FEE })
    await expect(factory.connect(buyer).mintAgent(meta, { value: MINT_FEE })).to.be.revertedWith(
      'AgentFactory: metadata already minted'
    )
  })
})

describe('TaskEscrow', function () {
  let escrow, treasury, consumer, agentOwner

  beforeEach(async function () {
    ;[consumer, agentOwner, treasury] = await ethers.getSigners()
    const E = await ethers.getContractFactory('TaskEscrow')
    escrow = await E.deploy(treasury.address, 24 * 60 * 60)
  })

  it('pays agentOwner (amount − fee) and treasury the fee on completion', async function () {
    const amount = ethers.parseEther('0.05')
    const fee = (amount * FEE_BPS) / BPS
    const payout = amount - fee

    const ownerBefore = await ethers.provider.getBalance(agentOwner.address)
    const treasuryBefore = await ethers.provider.getBalance(treasury.address)

    await expect(escrow.connect(consumer).createTask(agentOwner.address, amount, { value: amount }))
      .to.emit(escrow, 'TaskCreated')
      .withArgs(1n, consumer.address, agentOwner.address, amount)

    await expect(escrow.connect(consumer).completeTask(1n))
      .to.emit(escrow, 'TaskPaid')
      .withArgs(1n, agentOwner.address, payout, fee)

    expect(await ethers.provider.getBalance(agentOwner.address)).to.equal(ownerBefore + payout)
    expect(await ethers.provider.getBalance(treasury.address)).to.equal(treasuryBefore + fee)
  })

  it('only the consumer can complete', async function () {
    const amount = ethers.parseEther('0.01')
    await escrow.connect(consumer).createTask(agentOwner.address, amount, { value: amount })
    await expect(escrow.connect(agentOwner).completeTask(1n)).to.be.revertedWith('TaskEscrow: not consumer')
  })

  it('owner withdrawal preserves every open escrow', async function () {
    const amount = ethers.parseEther('0.01')
    await escrow.connect(consumer).createTask(agentOwner.address, amount, { value: amount })
    await escrow.connect(consumer).withdraw()
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(amount)
    expect(await escrow.lockedBalance()).to.equal(amount)
    await escrow.connect(consumer).completeTask(1n)
    expect(await escrow.lockedBalance()).to.equal(0n)
  })

  it('rejects release of nonexistent tasks', async function () {
    await expect(escrow.releaseTask(999n)).to.be.revertedWith('TaskEscrow: unknown task')
  })

  it('auto-releases after the timeout', async function () {
    const amount = ethers.parseEther('0.01')
    const fee = (amount * FEE_BPS) / BPS
    const payout = amount - fee
    await escrow.connect(consumer).createTask(agentOwner.address, amount, { value: amount })

    await ethers.provider.send('evm_increaseTime', [25 * 60 * 60])
    await ethers.provider.send('evm_mine', [])

    const ownerBefore = await ethers.provider.getBalance(agentOwner.address)
    const anyone = (await ethers.getSigners())[3]
    await expect(escrow.connect(anyone).releaseTask(1n))
      .to.emit(escrow, 'TaskReleased')
      .withArgs(1n, agentOwner.address, payout, fee)
    expect(await ethers.provider.getBalance(agentOwner.address)).to.equal(ownerBefore + payout)
  })
})
