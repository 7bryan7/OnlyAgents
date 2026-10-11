import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicClient, AGENT_FACTORY_ADDRESS, TASK_ESCROW_ADDRESS, TREASURY_ADDRESS } from '../server/chain.js'
import { readWalletTransactions } from '../server/wallet-transactions.js'

const customer = '0x1111111111111111111111111111111111111111'
const other = '0x2222222222222222222222222222222222222222'
const hash = '0x' + 'a'.repeat(64)
const entry = (eventName, address, args, index) => ({ eventName, address, args, transactionHash: hash, logIndex: index, blockNumber: 4499n - BigInt(index) })

test('history filters current-contract payments by wallet, separates fee income, and paginates block ranges', async () => {
  const original = { getBlockNumber: publicClient.getBlockNumber, getLogs: publicClient.getLogs, getBlock: publicClient.getBlock }
  const logs = [
    entry('TaskCreated', TASK_ESCROW_ADDRESS, { consumer: customer, amount: 1000000000000000n }, 0),
    entry('AgentMinted', AGENT_FACTORY_ADDRESS, { owner: customer }, 1),
    entry('TaskRefunded', TASK_ESCROW_ADDRESS, { consumer: customer, amount: 1000000000000000n }, 2),
    entry('TaskPaid', TASK_ESCROW_ADDRESS, { agentOwner: TREASURY_ADDRESS, payout: 930000000000000n, fee: 70000000000000n }, 3),
    entry('TaskCreated', TASK_ESCROW_ADDRESS, { consumer: other, amount: 1000000000000000n }, 4),
    entry('TaskCreated', other, { consumer: customer, amount: 1000000000000000n }, 5),
  ]
  const queries = []
  publicClient.getBlockNumber = async () => 5000n
  publicClient.getLogs = async query => {
    queries.push(query)
    return logs.filter(log => log.blockNumber >= query.fromBlock && log.blockNumber <= query.toBlock && log.address === query.address)
  }
  publicClient.getBlock = async () => ({ timestamp: 1791710000n })
  try {
    const result = await readWalletTransactions(customer, '4500')
    assert.equal(result.fromBlock, '2501')
    assert.equal(result.toBlock, '4500')
    assert.equal(result.nextCursor, '2500')
    assert.deepEqual(result.transactions.map(row => [row.type, row.direction, row.amountEth]), [
      ['Escrow deposit', 'sent', '0.001'], ['Agent mint', 'sent', '0.001'], ['Refund', 'received', '0.001'],
    ])
    assert.ok(result.transactions.every(row => row.timestamp === 1791710000000 && row.explorerUrl.endsWith(hash)))
    assert.ok(queries.every(query => query.toBlock - query.fromBlock < 200n && [AGENT_FACTORY_ADDRESS, TASK_ESCROW_ADDRESS].includes(query.address)))
    const treasury = await readWalletTransactions(TREASURY_ADDRESS, '4500')
    assert.deepEqual(treasury.transactions.map(row => [row.type, row.amountEth]), [['Mint fee', '0.001'], ['Agent payout', '0.00093'], ['Platform fee', '0.00007']])
    const older = await readWalletTransactions(customer, result.nextCursor)
    assert.equal(older.toBlock, '2500')
    assert.equal(older.fromBlock, '501')
    assert.deepEqual(older.transactions, [])
    assert.equal((await readWalletTransactions(customer, '500')).nextCursor, null)
    await assert.rejects(readWalletTransactions(customer, '-1'), /Invalid transaction history cursor/)
    await assert.rejects(readWalletTransactions(customer, ['4500']), /Invalid transaction history cursor/)
    publicClient.getLogs = async () => { throw new Error('Private RPC failure') }
    await assert.rejects(readWalletTransactions(other, '4500'), error => error.status === 502 && !error.message.includes('Private RPC'))
  } finally { Object.assign(publicClient, original) }
})
