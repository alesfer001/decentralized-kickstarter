import { ccc } from "@ckb-ccc/core";
import { TransactionBuilder } from "./src/builder";
import { createCkbClient } from "./src/ckbClient";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Test script for creating a campaign on OffCKB devnet
 *
 * This script:
 * 1. Loads deployed contract info
 * 2. Creates a signer from OffCKB test account private key
 * 3. Creates a test campaign transaction
 * 4. Waits for confirmation
 */
async function main() {
  console.log("=== Create Campaign Test ===\n");

  // Load deployed contract info
  const deploymentPath = join(__dirname, "../../deployment/deployed-contracts.json");
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf-8"));

  console.log("Loaded deployment config:");
  console.log(`- Network: ${deployment.network}`);
  console.log(`- RPC URL: ${deployment.rpcUrl}`);
  console.log(`- Campaign code hash: ${deployment.contracts.campaign.codeHash}`);
  console.log(`- Pledge code hash: ${deployment.contracts.pledge.codeHash}\n`);

  // Create client configured for OffCKB devnet
  const client = createCkbClient("devnet", deployment.rpcUrl);

  // Create signer from OffCKB test account
  // OffCKB creates test accounts with pre-funded CKB
  // Using the deployer account from deployment config
  const deployerAddress = deployment.accounts.deployer.address;

  console.log(`Using deployer account: ${deployerAddress}\n`);

  // Use OffCKB test account #0 private key (from offckb accounts)
  // ⚠️ WARNING: This is a test account only! Never use on mainnet!
  const privateKey = "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6";

  const signer = new ccc.SignerCkbPrivateKey(client, privateKey);

  // Create transaction builder
  const builder = new TransactionBuilder(
    client,
    {
      codeHash: deployment.contracts.campaign.codeHash,
      hashType: deployment.contracts.campaign.hashType as "data2",
      txHash: deployment.contracts.campaign.txHash,
      index: deployment.contracts.campaign.index,
    },
    {
      codeHash: deployment.contracts.pledge.codeHash,
      hashType: deployment.contracts.pledge.hashType as "data2",
      txHash: deployment.contracts.pledge.txHash,
      index: deployment.contracts.pledge.index,
    }
  );

  // Get creator lock hash
  const creatorLockHash = await builder.getLockHashFromAddress(deployerAddress);

  // Create campaign
  console.log("Creating campaign transaction...");
  const txHash = await builder.createCampaign(signer, {
    creatorLockHash,
    fundingGoal: BigInt(1000) * BigInt(100000000), // 1000 CKB
    deadlineBlock: BigInt(1000000), // Block number
  });

  console.log(`✅ Campaign created! TX: ${txHash}`);

  // Wait for confirmation
  await builder.waitForTransaction(txHash);
  console.log("✅ Transaction confirmed!");
}

main()
  .then(() => {
    console.log("\n=== Test Complete ===");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
