require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.19",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        // Local Hardhat node for testing
        hardhat: {
            chainId: 31337,
        },
        // WeilChain Testnet
        weilchain_testnet: {
            url: process.env.WEIL_CHAIN_RPC_URL || "https://rpc-testnet.weilchain.io",
            accounts: process.env.WEIL_PRIVATE_KEY
                ? [process.env.WEIL_PRIVATE_KEY]
                : [],
            chainId: 5, // Update with actual WeilChain testnet chain ID
        },
        // WeilChain Mainnet
        weilchain_mainnet: {
            url: process.env.WEIL_CHAIN_RPC_URL || "https://rpc.weilchain.io",
            accounts: process.env.WEIL_PRIVATE_KEY
                ? [process.env.WEIL_PRIVATE_KEY]
                : [],
            chainId: 1, // Update with actual WeilChain mainnet chain ID
        },
        // Sepolia testnet (for testing if WeilChain not available)
        sepolia: {
            url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
            accounts: process.env.WEIL_PRIVATE_KEY
                ? [process.env.WEIL_PRIVATE_KEY]
                : [],
            chainId: 11155111,
        },
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY || "",
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
};
