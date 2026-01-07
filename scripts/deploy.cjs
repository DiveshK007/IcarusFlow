const hre = require("hardhat");

async function main() {
    console.log("🚀 Deploying IcarusFlowCommit contract...\n");

    // Get deployer account
    const [deployer] = await hre.ethers.getSigners();
    console.log("📝 Deployer address:", deployer.address);

    // Check balance
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("💰 Deployer balance:", hre.ethers.formatEther(balance), "ETH\n");

    if (balance === 0n) {
        console.error("❌ Error: Deployer has no funds. Please get testnet ETH first.");
        console.log("\n📋 To get testnet ETH:");
        console.log("   1. Go to https://sepoliafaucet.com/ or WeilChain faucet");
        console.log("   2. Enter your wallet address:", deployer.address);
        console.log("   3. Request testnet ETH");
        console.log("   4. Wait for transaction and re-run this script\n");
        process.exit(1);
    }

    // Deploy contract
    console.log("📦 Deploying IcarusFlowCommit...");
    const IcarusFlowCommit = await hre.ethers.getContractFactory("IcarusFlowCommit");
    const contract = await IcarusFlowCommit.deploy();

    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();

    console.log("\n✅ Contract deployed successfully!");
    console.log("📍 Contract Address:", contractAddress);
    console.log("🔗 Network:", hre.network.name);
    console.log("⛽ Gas Used:", (await contract.deploymentTransaction()?.wait())?.gasUsed?.toString() || "N/A");

    // Print next steps
    console.log("\n" + "=".repeat(60));
    console.log("📋 NEXT STEPS:");
    console.log("=".repeat(60));
    console.log("\n1. Add this to your .env file:");
    console.log(`   WEIL_CONTRACT_ADDRESS=${contractAddress}`);
    console.log("\n2. Verify the contract (optional):");
    console.log(`   npx hardhat verify --network ${hre.network.name} ${contractAddress}`);
    console.log("\n3. Test with the demo:");
    console.log("   npm run demo");
    console.log("\n" + "=".repeat(60));

    // Return contract info for testing
    return {
        address: contractAddress,
        deployer: deployer.address,
    };
}

main()
    .then((result) => {
        console.log("\n🎉 Deployment complete!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    });
