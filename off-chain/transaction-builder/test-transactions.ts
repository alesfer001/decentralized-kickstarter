/**
 * Test script for creating example transactions
 * Run with: npx ts-node test-transactions.ts
 */

import { ccc } from "@ckb-ccc/core";
import { TransactionBuilder } from "./src";
import type { ContractInfo } from "./src/types";
import { createCkbClient } from "./src/ckbClient";

// Use the deployed contract info from deployed-contracts.json
const campaignContract: ContractInfo = {
  codeHash: "0xb71c1c0bc80ddc5a16ef041f2adf1f9a9339b56ecd63c135607e7e5ebb6ea3fc",
  hashType: "data2",
  txHash: "0x8d501828096d4b70a2f032ee04672cf5a75f8771dd1fb2ea23de0ef1519d05d6",
  index: 0,
};

const pledgeContract: ContractInfo = {
  codeHash: "0x423442d38b9e1fdfe68d0e878c4003317fe85408e202fd7de776205d289bc924",
  hashType: "data2",
  txHash: "0x304be042daf897898dcf1851e12ecabaa0400f677f0135fe9ec6c727fdc1a9e2",
  index: 0,
};

async function main() {
  const rpcUrl = "http://127.0.0.1:8114";

  // Create client and transaction builder
  const client = createCkbClient("devnet", rpcUrl);
  const builder = new TransactionBuilder(client, campaignContract, pledgeContract);

  // Test account private keys (from OffCKB devnet genesis accounts)
  // Account #0: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvwg2cen8extgq8s5puft8vf40px3f599cytcyd8
  const creatorKey = "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6";

  // Account #1: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt435c3epyrupszm7khk6weq5lrlyt52lg48ucew
  const backer1Key = "0x9f315d5a9618a39fdc487c7a67a8581d40b045bd7a42d83648ca80ef3b2cb4a1";

  // Account #2: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvarm0tahu0qfkq6ktuf3wd8azaas0h24c9myfz6
  const backer2Key = "0x59ddda57ba06d6e9c5fa9040bdb98b4b098c2fce6520d39f51bc5e825364697a";

  try {
    console.log("=== CKB Kickstarter Transaction Testing ===\n");

    // Create signers using the CKB private key signer
    const creatorSigner = new ccc.SignerCkbPrivateKey(client, creatorKey);
    const backer1Signer = new ccc.SignerCkbPrivateKey(client, backer1Key);
    const backer2Signer = new ccc.SignerCkbPrivateKey(client, backer2Key);

    // Get lock hashes for each account
    const creatorAddress = await creatorSigner.getRecommendedAddress();
    const creatorLockHash = ccc.hexFrom((await ccc.Address.fromString(creatorAddress, client)).script.hash());

    const backer1Address = await backer1Signer.getRecommendedAddress();
    const backer1LockHash = ccc.hexFrom((await ccc.Address.fromString(backer1Address, client)).script.hash());

    const backer2Address = await backer2Signer.getRecommendedAddress();
    const backer2LockHash = ccc.hexFrom((await ccc.Address.fromString(backer2Address, client)).script.hash());

    // Step 1: Create a campaign
    console.log("1. Creating a campaign...");
    console.log("   Creator: Account #0");
    console.log("   Creator Lock Hash:", creatorLockHash);
    console.log("   Funding Goal: 1000 CKB");
    console.log("   Deadline: Block 1000000 (far in the future)");

    const campaignTxHash = await builder.createCampaign(
      creatorSigner,
      {
        creatorLockHash: creatorLockHash,
        fundingGoal: BigInt(1000 * 100000000), // 1000 CKB in shannons
        deadlineBlock: BigInt(1000000), // Block number deadline
      }
    );

    console.log(`   ✅ Campaign created!`);
    console.log(`   TX Hash: ${campaignTxHash}`);

    // Calculate campaign ID from the transaction
    const campaignId = campaignTxHash; // In a real implementation, this would be the hash of the output cell

    // Wait a bit for the transaction to be mined
    console.log("\n   Waiting for transaction to be mined...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 2: Create pledges from different accounts
    console.log("\n2. Creating pledges to the campaign...");

    // Pledge from Backer #1
    console.log("\n   a) Pledge from Account #1");
    console.log("      Backer Lock Hash:", backer1LockHash);
    console.log("      Amount: 100 CKB");

    try {
      const pledge1TxHash = await builder.createPledge(
        backer1Signer,
        {
          campaignId: campaignId,
          backerLockHash: backer1LockHash,
          amount: BigInt(100 * 100000000), // 100 CKB
        }
      );
      console.log("      ✅ Pledge #1 created!");
      console.log(`      TX Hash: ${pledge1TxHash}`);
    } catch (error) {
      console.log(`      ❌ Failed to create pledge #1: ${error}`);
    }

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Pledge from Backer #2
    console.log("\n   b) Pledge from Account #2");
    console.log("      Backer Lock Hash:", backer2LockHash);
    console.log("      Amount: 200 CKB");

    try {
      const pledge2TxHash = await builder.createPledge(
        backer2Signer,
        {
          campaignId: campaignId,
          backerLockHash: backer2LockHash,
          amount: BigInt(200 * 100000000), // 200 CKB
        }
      );
      console.log("      ✅ Pledge #2 created!");
      console.log(`      TX Hash: ${pledge2TxHash}`);
    } catch (error) {
      console.log(`      ❌ Failed to create pledge #2: ${error}`);
    }

    // Wait for transactions to be indexed
    console.log("\n3. Waiting for indexer to process transactions...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 3: Query the indexer to verify
    console.log("\n4. Checking indexer results...");

    // Check campaigns
    const campaignsResponse = await fetch("http://localhost:3001/campaigns");
    const campaigns = await campaignsResponse.json() as any[];
    console.log(`\n   Campaigns found: ${campaigns.length}`);
    if (campaigns.length > 0) {
      console.log("   Campaign details:");
      campaigns.forEach((campaign: any, index: number) => {
        console.log(`   - Campaign #${index + 1}:`);
        console.log(`     ID: ${campaign.id}`);
        console.log(`     Creator: ${campaign.creatorLockHash}`);
        console.log(`     Goal: ${BigInt(campaign.fundingGoal) / BigInt(100000000)} CKB`);
        console.log(`     Pledged: ${BigInt(campaign.totalPledged) / BigInt(100000000)} CKB`);
        console.log(`     Status: ${campaign.status}`);
      });
    }

    // Check pledges
    const pledgesResponse = await fetch("http://localhost:3001/pledges");
    const pledges = await pledgesResponse.json() as any[];
    console.log(`\n   Pledges found: ${pledges.length}`);
    if (pledges.length > 0) {
      console.log("   Pledge details:");
      pledges.forEach((pledge: any, index: number) => {
        console.log(`   - Pledge #${index + 1}:`);
        console.log(`     Backer: ${pledge.backerLockHash}`);
        console.log(`     Amount: ${BigInt(pledge.amount) / BigInt(100000000)} CKB`);
        console.log(`     Campaign: ${pledge.campaignId}`);
      });
    }

    console.log("\n=== Test completed successfully! ===");

  } catch (error) {
    console.error("Error during testing:", error);
  }
}

// Run the test
main().catch(console.error);