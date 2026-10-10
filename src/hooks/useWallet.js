// ---------------------------------------------------------------------------
// useWallet — EIP-1193 (window.ethereum) wallet hook for the mint + hire flow.
//   connect()            → request accounts; transactions ensure Base Sepolia
//   mintAgent()          → sign AgentFactory.mintAgent tx (0.001 ETH), return txHash
//   createEscrowTask()   → sign TaskEscrow.createTask(agentOwner, amount), return txHash
//   completeEscrowTask() → sign TaskEscrow.completeTask(taskId), return txHash
// Uses viem's wallet client; no wagmi/RainbowKit dependency (lighter, fewer
// moving parts for the demo — PRD §4.3/§4.6 flows are fully covered).
// ---------------------------------------------------------------------------
import { useState, useCallback, useEffect, useRef, createContext, createElement, useContext } from 'react'
import { createWalletClient, createPublicClient, custom, keccak256, toBytes, parseEther, getAddress } from 'viem'
import { baseSepolia } from 'viem/chains'
import { api } from '../api'

const MINT_FEE = parseEther('0.001')

async function verifyOwnership(provider, address) {
  const { wallets } = await api.walletStatus()
  if (wallets.some((w) => w.wallet.toLowerCase() === address.toLowerCase())) return
  const { message } = await api.walletChallenge(address)
  const client = createWalletClient({ transport: custom(provider) })
  const signature = await client.signMessage({ account: address, message })
  await api.verifyWallet(address, signature)
}

const FACTORY_ABI = [
  {
    type: 'function',
    name: 'mintAgent',
    stateMutability: 'payable',
    inputs: [{ type: 'bytes32', name: 'metadataHash' }],
    outputs: [{ type: 'uint256', name: 'tokenId' }],
  },
]

const ESCROW_ABI = [
  {
    type: 'function',
    name: 'createTask',
    stateMutability: 'payable',
    inputs: [
      { type: 'address', name: 'agentOwner' },
      { type: 'uint256', name: 'amount' },
    ],
    outputs: [{ type: 'uint256', name: 'taskId' }],
  },
  {
    type: 'function',
    name: 'completeTask',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256', name: 'taskId' }],
    outputs: [],
  },
]

function getProvider() {
  if (typeof window !== 'undefined' && window.ethereum) {
    return window.ethereum.providers?.find((p) => p.isMetaMask) || window.ethereum
  }
  return null
}

const WalletContext = createContext(null)
export function WalletProvider({ children }) {
  return createElement(WalletContext.Provider, { value: useWalletState() }, children)
}
export function useWallet() {
  return useContext(WalletContext)
}
function walletError(e) {
  const code = Number(e?.code ?? e?.data?.originalError?.code)
  if (code === 4001) return 'Wallet request declined. Click Connect wallet to try again.'
  if (code === -32002) return 'A wallet request is already pending. Open MetaMask and approve or reject it.'
  return e?.shortMessage || e?.message || 'Wallet connection failed. Open MetaMask and try again.'
}
function useWalletState() {
  const [provider, setProvider] = useState(getProvider)
  const busy = useRef(false)
  const [address, setAddress] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const announce = (event) => {
      const detail = event.detail
      if (typeof detail?.provider?.request !== 'function') return
      if (detail.info?.rdns === 'io.metamask' || detail.provider.isMetaMask) setProvider(detail.provider)
      else setProvider((current) => current || detail.provider)
    }
    window.addEventListener('eip6963:announceProvider', announce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    const initialized = () => setProvider((current) => current || getProvider())
    window.addEventListener('ethereum#initialized', initialized)
    return () => {
      window.removeEventListener('eip6963:announceProvider', announce)
      window.removeEventListener('ethereum#initialized', initialized)
    }
  }, [])
  useEffect(() => {
    if (!provider) return
    let cancelled = false
    let chainChanged = false
    const changed = (accounts) => {
      setAddress(accounts?.[0] ? getAddress(accounts[0]) : null)
    }
    const network = (id) => { chainChanged = true; setChainId(Number(id)) }
    const disconnected = () => { chainChanged = true; setAddress(null); setChainId(null) }
    // Do not restore an approved account automatically. A wallet connection is
    // scoped to the current authenticated user and must be explicitly made.
    provider.request({ method: 'eth_chainId' }).then((id) => {
      if (!cancelled && !chainChanged) setChainId(Number(id))
    }).catch(() => {})
    provider?.on?.('accountsChanged', changed)
    provider?.on?.('chainChanged', network)
    provider?.on?.('disconnect', disconnected)
    return () => {
      cancelled = true
      provider?.removeListener?.('accountsChanged', changed)
      provider?.removeListener?.('chainChanged', network)
      provider?.removeListener?.('disconnect', disconnected)
    }
  }, [provider])
  const ensureChain = useCallback(async (provider) => {
    const id = await provider.request({ method: 'eth_chainId' })
    const target = `0x${baseSepolia.id.toString(16)}`
    if (Number(id) === baseSepolia.id) {
      setChainId(baseSepolia.id)
      return
    }
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: target }],
      })
    } catch (e) {
      // 4902 = chain not added yet → add it
      if (Number(e.code ?? e.data?.originalError?.code) === 4902) {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: target,
              chainName: 'Base Sepolia',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://sepolia.base.org'],
              blockExplorerUrls: ['https://sepolia.basescan.org'],
            },
          ],
        })
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: target }] })
      } else {
        throw e
      }
    }
    const actualId = Number(await provider.request({ method: 'eth_chainId' }))
    setChainId(actualId)
    if (actualId !== baseSepolia.id) throw new Error('Select Base Sepolia in MetaMask before continuing.')
  }, [])

  const connect = useCallback(async () => {
    if (busy.current) return null
    const activeProvider = provider || getProvider()
    if (!activeProvider) {
      setError('MetaMask was not detected. Open this site in the browser where the MetaMask extension is installed, unlock it, and reload. On mobile, use the MetaMask in-app browser.')
      return null
    }
    setProvider(activeProvider)
    busy.current = true
    setConnecting(true)
    setError(null)
    try {
      const accounts = await activeProvider.request({ method: 'eth_requestAccounts' })
      if (!accounts?.[0]) throw new Error('No account selected. Unlock MetaMask and select an account.')
      setAddress(getAddress(accounts[0]))
      return getAddress(accounts[0])
    } catch (e) {
      setError(walletError(e))
      return null
    } finally {
      setConnecting(false)
      busy.current = false
    }
  }, [provider])

  const mintAgent = useCallback(
    async ({ factoryAddress, name, personaPrompt, specialty }) => {
      if (!provider || !address) {
        setError('Connect your wallet first')
        return null
      }
      setError(null)
      try {
        await verifyOwnership(provider, address)
        await ensureChain(provider)
        const walletClient = createWalletClient({ chain: baseSepolia, transport: custom(provider) })
        const metadataHash = keccak256(toBytes(`${name}|${personaPrompt}|${specialty}`))
        const txHash = await walletClient.writeContract({
          address: factoryAddress,
          abi: FACTORY_ABI,
          functionName: 'mintAgent',
          args: [metadataHash],
          value: MINT_FEE,
          account: address,
        })
        const reader = createPublicClient({ chain: baseSepolia, transport: custom(provider) })
        const receipt = await reader.waitForTransactionReceipt({ hash: txHash, timeout: 120000 })
        if (receipt.status !== 'success') throw new Error('Transaction reverted')
        return txHash
      } catch (e) {
        setError(e?.shortMessage || e?.message || 'Mint transaction failed')
        return null
      }
    },
    [address, ensureChain, provider]
  )

  // Lock payment in TaskEscrow when hiring an agent (PRD §4.6)
  const createEscrowTask = useCallback(
    async ({ escrowAddress, agentOwner, amountEth }) => {
      if (!provider || !address) {
        setError('Connect your wallet first')
        return null
      }
      setError(null)
      try {
        await verifyOwnership(provider, address)
        await ensureChain(provider)
        const walletClient = createWalletClient({ chain: baseSepolia, transport: custom(provider) })
        const txHash = await walletClient.writeContract({
          address: escrowAddress,
          abi: ESCROW_ABI,
          functionName: 'createTask',
          args: [agentOwner, parseEther(String(amountEth))],
          value: parseEther(String(amountEth)),
          account: address,
        })
        const reader = createPublicClient({ chain: baseSepolia, transport: custom(provider) })
        const receipt = await reader.waitForTransactionReceipt({ hash: txHash, timeout: 120000 })
        if (receipt.status !== 'success') throw new Error('Transaction reverted')
        return txHash
      } catch (e) {
        setError(e?.shortMessage || e?.message || 'Escrow transaction failed')
        return null
      }
    },
    [address, ensureChain, provider]
  )

  // Consumer confirms completion → releases payout to the agent owner
  const completeEscrowTask = useCallback(
    async ({ escrowAddress, taskId }) => {
      if (!provider || !address) {
        setError('Connect your wallet first')
        return null
      }
      setError(null)
      try {
        await ensureChain(provider)
        const walletClient = createWalletClient({ chain: baseSepolia, transport: custom(provider) })
        const txHash = await walletClient.writeContract({
          address: escrowAddress,
          abi: ESCROW_ABI,
          functionName: 'completeTask',
          args: [BigInt(taskId)],
          account: address,
        })
        const reader = createPublicClient({ chain: baseSepolia, transport: custom(provider) })
        const receipt = await reader.waitForTransactionReceipt({ hash: txHash, timeout: 120000 })
        if (receipt.status !== 'success') throw new Error('Transaction reverted')
        return txHash
      } catch (e) {
        setError(e?.shortMessage || e?.message || 'Confirmation transaction failed')
        return null
      }
    },
    [address, ensureChain, provider]
  )

  return { address, chainId, connecting, error, connect, mintAgent, createEscrowTask, completeEscrowTask, setError }
}
