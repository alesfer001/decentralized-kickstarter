/**
 * Test script for creating example transactions
 * Run with: npx ts-node test-transactions.ts
 */

import { setupDevnet, waitForTx, campaignTypeArgs, CKB } from "./test-helpers";

async function main() {
  // Contracts come from deployment/deployed-contracts-devnet.json
  const { client, builder, creator: creatorSigner, backer: backer1Signer, trigger: backer2Signer } = await setupDevnet();

  try {
    console.log("=== CKB Kickstarter Transaction Testing ===\n");

    const creatorLockHash = (await creatorSigner.getAddressObjs())[0].script.hash();
    const backer1LockHash = (await backer1Signer.getAddressObjs())[0].script.hash();
    const backer2LockHash = (await backer2Signer.getAddressObjs())[0].script.hash();

    // Step 1: Create a campaign
    console.log("1. Creating a campaign...");
    console.log("   Creator: Account #0");
    console.log("   Creator Lock Hash:", creatorLockHash);
    console.log("   Funding Goal: 1000 CKB");
    console.log("   Deadline: 10000 blocks from now");

    const deadlineBlock = BigInt(await client.getTip()) + 10000n;
    const campaignTxHash = await builder.createCampaign(creatorSigner, {
      creatorLockHash,
      fundingGoal: 1000n * CKB,
      deadlineBlock,
      title: "Transaction test campaign",
    });

    console.log(`   ✅ Campaign created!`);
    console.log(`   TX Hash: ${campaignTxHash}`);

    console.log("\n   Waiting for transaction to be committed...");
    await waitForTx(client, campaignTxHash);
    const typeArgs = await campaignTypeArgs(client, campaignTxHash);

    const pledge = async (signer: typeof creatorSigner, backerLockHash: string, amount: bigint) => {
      const txHash = await builder.createPledgeWithReceipt(signer, {
        campaignOutPoint: { txHash: campaignTxHash, index: 0 },
        campaignTypeArgs: typeArgs,
        deadlineBlock,
        backerLockHash,
        amount,
        campaignId: campaignTxHash,
      });
      await waitForTx(client, txHash);
      return txHash;
    };

    // Step 2: Create pledges from different accounts
    console.log("\n2. Creating pledges to the campaign...");

    // Pledge from Backer #1
    console.log("\n   a) Pledge from Account #1");
    console.log("      Backer Lock Hash:", backer1LockHash);
    console.log("      Amount: 100 CKB");

    const pledge1TxHash = await pledge(backer1Signer, backer1LockHash, 100n * CKB);
    console.log("      ✅ Pledge #1 created!");
    console.log(`      TX Hash: ${pledge1TxHash}`);

    // Pledge from Backer #2
    console.log("\n   b) Pledge from a third devnet account");
    console.log("      Backer Lock Hash:", backer2LockHash);
    console.log("      Amount: 200 CKB");

    const pledge2TxHash = await pledge(backer2Signer, backer2LockHash, 200n * CKB);
    console.log("      ✅ Pledge #2 created!");
    console.log(`      TX Hash: ${pledge2TxHash}`);

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
        console.log(`     ID: ${campaign.campaignId}`);
        console.log(`     Creator: ${campaign.creator}`);
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
        console.log(`     Backer: ${pledge.backer}`);
        console.log(`     Amount: ${BigInt(pledge.amount) / BigInt(100000000)} CKB`);
        console.log(`     Campaign: ${pledge.campaignId}`);
      });
    }

    console.log("\n=== Test completed successfully! ===");

  } catch (error) {
    console.error("Error during testing:", error);
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);