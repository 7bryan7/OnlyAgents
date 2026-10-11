import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeEventTopics, encodeAbiParameters, parseAbiItem, parseEther } from 'viem'
import { publicClient, TASK_ESCROW_ADDRESS, verifyCreateTask } from '../server/chain.js'

const consumer = '0x1111111111111111111111111111111111111111'
const provider = '0x2222222222222222222222222222222222222222'
const other = '0x3333333333333333333333333333333333333333'
const hash = '0x' + 'a'.repeat(64)
const amount = parseEther('0.001')
const event = parseAbiItem('event TaskCreated(uint256 indexed taskId, address indexed consumer, address indexed agentOwner, uint256 amount)')
function log(overrides = {}) {
  const values = { taskId: 1n, consumer, agentOwner: provider, amount, ...overrides }
  return { address: overrides.address || TASK_ESCROW_ADDRESS,
    topics: encodeEventTopics({ abi: [event], eventName: 'TaskCreated', args: values }),
    data: encodeAbiParameters([{ type: 'uint256' }], [values.amount]),
  }
}

test('escrow receipt verification accepts forwarded payments and rejects mismatched or spoofed events', async () => {
  const original = publicClient.getTransactionReceipt
  let receipt
  publicClient.getTransactionReceipt = async () => receipt
  try {
    for (const to of [TASK_ESCROW_ADDRESS, consumer, other]) {
      receipt = { status: 'success', to, logs: [log()] }
      assert.deepEqual(await verifyCreateTask(hash, consumer, provider, amount), { ok: true, taskId: 1n, amount })
    }
    for (const overrides of [{ address: other }, { consumer: other }, { agentOwner: other }, { amount: amount + 1n }]) {
      receipt = { status: 'success', to: TASK_ESCROW_ADDRESS, logs: [log(overrides)] }
      assert.equal((await verifyCreateTask(hash, consumer, provider, amount)).ok, false)
    }
    receipt = { status: 'success', to: TASK_ESCROW_ADDRESS, logs: [] }
    assert.equal((await verifyCreateTask(hash, consumer, provider, amount)).ok, false)
    receipt = { status: 'reverted', to: consumer, logs: [log()] }
    assert.equal((await verifyCreateTask(hash, consumer, provider, amount)).ok, false)
  } finally { publicClient.getTransactionReceipt = original }
})
