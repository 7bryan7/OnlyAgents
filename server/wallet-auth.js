import { getAddress } from 'viem'

function addressOf(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw Object.assign(new Error('Invalid wallet address.'), { status: 400 })
  try { return getAddress(value).toLowerCase() } catch { throw Object.assign(new Error('Invalid wallet address.'), { status: 400 }) }
}

// The signed-in wallet is the account. There are no secondary wallet links.
export function walletStatus(req, res) {
  res.json({ wallets: [{ wallet: req.user.walletAddress }] })
}

export function requireOwnedWallet(req, res, next) {
  const wallet = addressOf(req.body?.walletAddress)
  if (wallet !== req.user.walletAddress) return res.status(403).json({ error: 'Sign in with the connected wallet before submitting a payment.' })
  next()
}
