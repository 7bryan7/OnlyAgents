// ---------------------------------------------------------------------------
// Contract tests — mint flow + escrow flow on the local Hardhat network.
//   npx hardhat test
// ---------------------------------------------------------------------------
const { expect } = require('chai')
const { ethers } = require('hardhat')

const MINT_FEE = ethers.parseEther('0.001')
const FEE_BPS = 700n
const BPS = 10000n
const PLATFORM_OWNER = '0x2e0113c8806c8bFFd9cAA0861a9D1ffFE66E48A8'
async function platformSigner() {
  await ethers.provider.send('hardhat_impersonateAccount', [PLATFORM_OWNER])
  await ethers.provider.send('hardhat_setBalance', [PLATFORM_OWNER, '0x56BC75E2D63100000'])
  return ethers.getSigner(PLATFORM_OWNER)
}

describe('AgentFactory', function () {
  let factory, treasury, buyer

  beforeEach(async function () {
    ;[, buyer] = await ethers.getSigners()
    treasury = await platformSigner()
    const F = await ethers.getContractFactory('AgentFactory')
    factory = await F.deploy(treasury.address)
  })

  it('fixes the platform owner and treasury, rejects alternate fee recipients', async function () {
    expect(await factory.owner()).to.equal(PLATFORM_OWNER)
    expect(await factory.treasury()).to.equal(PLATFORM_OWNER)
    const F = await ethers.getContractFactory('AgentFactory')
    await expect(F.deploy(buyer.address)).to.be.revertedWith('AgentFactory: fixed platform treasury')
    await expect(buyer.sendTransaction({ to: await factory.getAddress(), data: ethers.id('setTreasury(address)').slice(0, 10) + ethers.AbiCoder.defaultAbiCoder().encode(['address'], [buyer.address]).slice(2) })).to.be.reverted
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
  let escrow, treasury, consumer, agentOwner, operator, administrator
  const outputHash = ethers.keccak256(ethers.toUtf8Bytes('Delivered output'))
  const reasonHash = ethers.keccak256(ethers.toUtf8Bytes('Incorrect output'))
  const reviewPeriod = 48 * 60 * 60

  beforeEach(async function () {
    ;[consumer, agentOwner, , operator] = await ethers.getSigners()
    administrator = treasury = await platformSigner()
    const E = await ethers.getContractFactory('TaskEscrow')
    escrow = await E.connect(administrator).deploy(treasury.address, reviewPeriod, operator.address)
  })

  it('fixes the platform owner and treasury, rejects alternate fee recipients', async function () {
    expect(await escrow.owner()).to.equal(PLATFORM_OWNER)
    expect(await escrow.treasury()).to.equal(PLATFORM_OWNER)
    const E = await ethers.getContractFactory('TaskEscrow')
    await expect(E.deploy(agentOwner.address, reviewPeriod, operator.address)).to.be.revertedWith('TaskEscrow: fixed platform treasury')
    await expect(administrator.sendTransaction({ to: await escrow.getAddress(), data: ethers.id('setTreasury(address)').slice(0, 10) + ethers.AbiCoder.defaultAbiCoder().encode(['address'], [agentOwner.address]).slice(2) })).to.be.reverted
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

    await escrow.connect(operator).markDelivered(1n, outputHash)
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
    await escrow.connect(administrator).withdraw()
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(amount)
    expect(await escrow.lockedBalance()).to.equal(amount)
    await escrow.connect(operator).markDelivered(1n, outputHash)
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

    await escrow.connect(operator).markDelivered(1n, outputHash)
    await ethers.provider.send('evm_increaseTime', [reviewPeriod + 1])
    await ethers.provider.send('evm_mine', [])

    const ownerBefore = await ethers.provider.getBalance(agentOwner.address)
    const anyone = (await ethers.getSigners())[3]
    await expect(escrow.connect(anyone).releaseTask(1n))
      .to.emit(escrow, 'TaskReleased')
      .withArgs(1n, agentOwner.address, payout, fee)
    expect(await ethers.provider.getBalance(agentOwner.address)).to.equal(ownerBefore + payout)
  })

  it('never releases undelivered work, even long after creation', async function () {
    const amount = ethers.parseEther('0.01')
    await escrow.connect(consumer).createTask(agentOwner.address, amount, { value: amount })
    await ethers.provider.send('evm_increaseTime', [reviewPeriod * 3])
    await ethers.provider.send('evm_mine', [])
    await expect(escrow.releaseTask(1n)).to.be.revertedWith('TaskEscrow: not delivered')
    await expect(escrow.connect(consumer).completeTask(1n)).to.be.revertedWith('TaskEscrow: not delivered')
    await escrow.connect(operator).markDelivered(1n, outputHash)
    const task = await escrow.tasks(1n)
    expect(task.reviewDeadline - task.deliveredAt).to.equal(BigInt(reviewPeriod))
    await expect(escrow.releaseTask(1n)).to.be.revertedWith('TaskEscrow: not yet expired')
    await expect(escrow.connect(operator).markDelivered(1n, outputHash)).to.be.revertedWith('TaskEscrow: already delivered')
  })

  it('only the operator can attest delivery or hold a revision', async function () {
    const amount = ethers.parseEther('0.01')
    await escrow.connect(consumer).createTask(agentOwner.address, amount, { value: amount })
    await expect(escrow.connect(consumer).markDelivered(1n, outputHash)).to.be.revertedWith('TaskEscrow: not operator')
    await expect(escrow.connect(administrator).markDelivered(1n, outputHash)).to.be.revertedWith('TaskEscrow: not operator')
    await expect(escrow.connect(operator).markDelivered(1n, ethers.ZeroHash)).to.be.revertedWith('TaskEscrow: empty output hash')
    await escrow.connect(operator).markDelivered(1n, outputHash)
    await expect(escrow.connect(consumer).holdRevision(1n)).to.be.revertedWith('TaskEscrow: not operator')
  })

  it('freezes payout during disputes and refunds the full principal without a fee', async function () {
    const amount = ethers.parseEther('0.01')
    await escrow.connect(consumer).createTask(agentOwner.address, amount, { value: amount })
    await escrow.connect(operator).markDelivered(1n, outputHash)
    await expect(escrow.connect(agentOwner).openDispute(1n, reasonHash)).to.be.revertedWith('TaskEscrow: not consumer')
    await expect(escrow.connect(consumer).openDispute(1n, reasonHash)).to.emit(escrow, 'TaskDisputed').withArgs(1n, consumer.address, reasonHash)
    await ethers.provider.send('evm_increaseTime', [reviewPeriod * 2])
    await ethers.provider.send('evm_mine', [])
    await expect(escrow.releaseTask(1n)).to.be.revertedWith('TaskEscrow: disputed')
    await expect(escrow.connect(consumer).completeTask(1n)).to.be.revertedWith('TaskEscrow: disputed')
    await expect(escrow.connect(operator).holdRevision(1n)).to.be.revertedWith('TaskEscrow: disputed')
    await expect(escrow.connect(operator).resolveDispute(1n, true)).to.be.revertedWithCustomError(escrow, 'OwnableUnauthorizedAccount')
    const consumerBefore = await ethers.provider.getBalance(consumer.address)
    const treasuryBefore = await ethers.provider.getBalance(treasury.address)
    const refundTx = await escrow.connect(administrator).resolveDispute(1n, true)
    await expect(refundTx)
      .to.emit(escrow, 'TaskRefunded').withArgs(1n, consumer.address, amount)
      .and.to.emit(escrow, 'DisputeResolved').withArgs(1n, true)
    expect(await ethers.provider.getBalance(consumer.address)).to.equal(consumerBefore + amount)
    const refundReceipt = await refundTx.wait()
    expect(await ethers.provider.getBalance(treasury.address)).to.equal(treasuryBefore - refundReceipt.gasUsed * refundReceipt.gasPrice)
    expect(await escrow.lockedBalance()).to.equal(0n)
    await expect(escrow.connect(administrator).resolveDispute(1n, false)).to.be.revertedWith('TaskEscrow: already settled')
    await expect(escrow.releaseTask(1n)).to.be.revertedWith('TaskEscrow: already settled')
  })

  it('administrator can reject a dispute and pay the provider exactly once', async function () {
    const amount = ethers.parseEther('0.01')
    await escrow.connect(consumer).createTask(agentOwner.address, amount, { value: amount })
    await escrow.connect(operator).markDelivered(1n, outputHash)
    await escrow.connect(consumer).openDispute(1n, reasonHash)
    const before = await ethers.provider.getBalance(agentOwner.address)
    const fee = amount * FEE_BPS / BPS
    await expect(escrow.connect(administrator).resolveDispute(1n, false))
      .to.emit(escrow, 'TaskPaid').withArgs(1n, agentOwner.address, amount - fee, fee)
      .and.to.emit(escrow, 'DisputeResolved').withArgs(1n, false)
    expect(await ethers.provider.getBalance(agentOwner.address)).to.equal(before + amount - fee)
    expect(await escrow.lockedBalance()).to.equal(0n)
    await expect(escrow.connect(consumer).completeTask(1n)).to.be.revertedWith('TaskEscrow: already settled')
  })

  it('allows disputes of undelivered work but denies late disputes of delivered work', async function () {
    const amount = ethers.parseEther('0.01')
    await escrow.connect(consumer).createTask(agentOwner.address, amount, { value: amount })
    await escrow.connect(consumer).openDispute(1n, reasonHash)
    await expect(escrow.connect(operator).markDelivered(1n, outputHash)).to.be.revertedWith('TaskEscrow: disputed')
    await escrow.connect(administrator).resolveDispute(1n, true)
    await escrow.connect(consumer).createTask(agentOwner.address, amount, { value: amount })
    await escrow.connect(operator).markDelivered(2n, outputHash)
    await ethers.provider.send('evm_increaseTime', [reviewPeriod])
    await ethers.provider.send('evm_mine', [])
    await expect(escrow.connect(consumer).openDispute(2n, reasonHash)).to.be.revertedWith('TaskEscrow: review expired')
  })

  it('holds revisions on-chain and starts a fresh review window after each new delivery', async function () {
    const amount = ethers.parseEther('0.01')
    await escrow.connect(consumer).createTask(agentOwner.address, amount, { value: amount })
    await escrow.connect(operator).markDelivered(1n, outputHash)
    const firstDeadline = (await escrow.tasks(1n)).reviewDeadline
    await escrow.connect(operator).holdRevision(1n)
    await ethers.provider.send('evm_increaseTime', [reviewPeriod * 2])
    await ethers.provider.send('evm_mine', [])
    await expect(escrow.releaseTask(1n)).to.be.revertedWith('TaskEscrow: not delivered')
    await escrow.connect(operator).markDelivered(1n, reasonHash)
    expect((await escrow.tasks(1n)).reviewDeadline).to.be.greaterThan(firstDeadline)
    for (let revision = 2; revision <= 3; revision++) {
      await escrow.connect(operator).holdRevision(1n)
      await escrow.connect(operator).markDelivered(1n, outputHash)
    }
    await expect(escrow.connect(operator).holdRevision(1n)).to.be.revertedWith('TaskEscrow: maximum revisions')
  })

  it('review period changes do not shorten existing deadlines', async function () {
    const amount = ethers.parseEther('0.01')
    await escrow.connect(consumer).createTask(agentOwner.address, amount, { value: amount })
    await escrow.connect(operator).markDelivered(1n, outputHash)
    const deadline = (await escrow.tasks(1n)).reviewDeadline
    await escrow.connect(administrator).setTimeout(1)
    expect((await escrow.tasks(1n)).reviewDeadline).to.equal(deadline)
    await expect(escrow.releaseTask(1n)).to.be.revertedWith('TaskEscrow: not yet expired')
  })
})
