// ---------------------------------------------------------------------------
// Hardhat config — Base Sepolia (chain id 84532).
// RPC + deployer key come from .env (BASE_SEPOLIA_RPC, PRIVATE_KEY).
// ---------------------------------------------------------------------------
require('@nomicfoundation/hardhat-toolbox')
require('dotenv').config()

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  paths: { artifacts: '.hardhat/artifacts', cache: '.hardhat/cache' },
  solidity: {
    version: '0.8.25',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'cancun',
    },
  },
  networks: {
    hardhat: {
      chainId: 84532, // mirror Base Sepolia for local testing
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
    },
  },
  etherscan: {
    // Etherscan V2 API (single key, chainid passed per network)
    apiKey: process.env.BASESCAN_API_KEY || '',
    customChains: [
      {
        network: 'baseSepolia',
        chainId: 84532,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api?chainid=84532',
          browserURL: 'https://sepolia.basescan.org',
        },
      },
    ],
  },
}
