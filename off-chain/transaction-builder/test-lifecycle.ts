/**
 * Integration test for the full campaign lifecycle
 * Tests: create -> pledge -> finalize -> release/refund
 *
 * Run with: npx ts-node test-lifecycle.ts
 */

import { ccc } from "@ckb-ccc/core";
import { TransactionBuilder } from "./src";
import type { ContractInfo } from "./src/types";
import { CampaignStatus } from "./src/types";
import { createCkbClient } from "./src/ckbClient";
import * as fs from "fs";
import * as path from "path";

// Load contract info from devnet deployment
const deployedContracts = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../deployment/deployed-contracts-devnet.json"), "utf-8")
);

const campaignContract: ContractInfo = {
  codeHash: deployedContracts.campaign.codeHash,
  hashType: "data2",
  txHash: deployedContracts.campaign.txHash,
  index: deployedContracts.campaign.index,
};

const campaignLockContract: ContractInfo = {
  codeHash: deployedContracts.campaignLock.codeHash,
  hashType: "data2",
  txHash: deployedContracts.campaignLock.txHash,
  index: deployedContracts.campaignLock.index,
};

const pledgeContract: ContractInfo = {
  codeHash: deployedContracts.pledge.codeHash,
  hashType: "data2",
  txHash: deployedContracts.pledge.txHash,
  index: deployedContracts.pledge.index,
};

const pledgeLockContract: ContractInfo = {
  codeHash: deployedContracts.pledgeLock.codeHash,
  hashType: "data2",
  txHash: deployedContracts.pledgeLock.txHash,
  index: deployedContracts.pledgeLock.index,
};

const receiptContract: ContractInfo = {
  codeHash: deployedContracts.receipt.codeHash,
  hashType: "data2",
  txHash: deployedContracts.receipt.txHash,
  index: deployedContracts.receipt.index,
};

const rpcUrl = "http://127.0.0.1:8114";

// Devnet test accounts
const creatorKey = "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6";
const backerKey = "0x9f315d5a9618a39fdc487c7a67a8581d40b045bd7a42d83648ca80ef3b2cb4a1";
const creatorAddress = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvwg2cen8extgq8s5puft8vf40px3f599cytcyd8";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTx(client: ccc.Client, txHash: string, timeout = 60000): Promise<void> {
  console.log(`  Waiting for tx ${txHash.slice(0, 18)}... to confirm`);
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const tx = await client.getTransaction(txHash);
      if (tx && tx.status === "committed") {
        console.log("  Confirmed!");
        return;
      }
    } catch {}
    await sleep(3000);
  }
  throw new Error(`Transaction ${txHash} not confirmed after ${timeout}ms`);
}

async function getCurrentBlock(client: ccc.Client): Promise<bigint> {
  const tip = await client.getTip();
  return BigInt(tip);
}

/**
 * Test 1: Success lifecycle
 * Create campaign -> Pledge enough -> Finalize as Success -> Release to creator
 */
async function testSuccessLifecycle() {
  console.log("\n=== TEST 1: Success Lifecycle ===\n");

  const client = createCkbClient("devnet", rpcUrl);
  const builder = new TransactionBuilder(client, campaignContract, campaignLockContract, pledgeContract, pledgeLockContract, receiptContract);

  const creatorSigner = new ccc.SignerCkbPrivateKey(client, creatorKey);
  const backerSigner = new ccc.SignerCkbPrivateKey(client, backerKey);

  const creatorAddr = await creatorSigner.getRecommendedAddress();
  const creatorLockHash = (await ccc.Address.fromString(creatorAddr, client)).script.hash();

  const backerAddr = await backerSigner.getRecommendedAddress();
  const backerLockHash = (await ccc.Address.fromString(backerAddr, client)).script.hash();

  // Step 1: Create campaign with a deadline close to current block
  const currentBlock = await getCurrentBlock(client);
  const deadline = currentBlock + BigInt(5); // expires in ~5 blocks
  const fundingGoal = BigInt(100 * 100000000); // 100 CKB

  console.log(`1. Creating campaign (goal: 100 CKB, deadline: block ${deadline})`);
  const campaignTxHash = await builder.createCampaign(creatorSigner, {
    creatorLockHash,
    fundingGoal,
    deadlineBlock: deadline,
  });
  console.log(`   Campaign TX: ${campaignTxHash}`);
  await waitForTx(client, campaignTxHash);

  // Step 2: Backer pledges enough to meet goal
  console.log("\n2. Backer pledges 150 CKB (exceeds 100 CKB goal)");
  const pledgeTxHash = await builder.createPledge(backerSigner, {
    campaignId: campaignTxHash,
    backerLockHash,
    amount: BigInt(150 * 100000000), // 150 CKB
  });
  console.log(`   Pledge TX: ${pledgeTxHash}`);
  await waitForTx(client, pledgeTxHash);

  // Step 3: Wait for deadline to pass
  console.log("\n3. Waiting for deadline to pass...");
  let block = await getCurrentBlock(client);
  while (block <= deadline) {
    await sleep(3000);
    block = await getCurrentBlock(client);
    console.log(`   Current block: ${block}, deadline: ${deadline}`);
  }
  console.log("   Deadline passed!");

  // Step 4: Creator finalizes as Success
  console.log("\n4. Creator finalizes campaign as Success");
  const finalizeTxHash = await builder.finalizeCampaign(creatorSigner, {
    campaignOutPoint: { txHash: campaignTxHash, index: 0 },
    campaignData: {
      creatorLockHash,
      fundingGoal,
      deadlineBlock: deadline,
      totalPledged: BigInt(0), // On-chain totalPledged is 0 (it's tracked off-chain via pledges)
    },
    newStatus: CampaignStatus.Success,
  });
  console.log(`   Finalize TX: ${finalizeTxHash}`);
  await waitForTx(client, finalizeTxHash);

  // Step 5: Backer releases pledge to creator
  console.log("\n5. Backer releases pledge to creator");
  // Get the pledge cell's capacity (we need to look it up or calculate it)
  const pledgeDataSize = 72;
  const baseCapacity = BigInt(Math.ceil((8 + pledgeDataSize + 65 + 65) * 1.2)) * BigInt(100000000);
  const pledgeCapacity = baseCapacity + BigInt(150 * 100000000);

  const releaseTxHash = await builder.releasePledgeToCreator(backerSigner, {
    pledgeOutPoint: { txHash: pledgeTxHash, index: 0 },
    pledgeCapacity,
    creatorAddress,
  });
  console.log(`   Release TX: ${releaseTxHash}`);
  await waitForTx(client, releaseTxHash);

  console.log("\n   SUCCESS: Full success lifecycle completed!");
}

/**
 * Test 2: Failure lifecycle
 * Create campaign -> Pledge insufficient -> Finalize as Failed -> Refund
 */
async function testFailureLifecycle() {
  console.log("\n=== TEST 2: Failure Lifecycle ===\n");

  const client = createCkbClient("devnet", rpcUrl);
  const builder = new TransactionBuilder(client, campaignContract, campaignLockContract, pledgeContract, pledgeLockContract, receiptContract);

  const creatorSigner = new ccc.SignerCkbPrivateKey(client, creatorKey);
  const backerSigner = new ccc.SignerCkbPrivateKey(client, backerKey);

  const creatorAddr = await creatorSigner.getRecommendedAddress();
  const creatorLockHash = (await ccc.Address.fromString(creatorAddr, client)).script.hash();

  const backerAddr = await backerSigner.getRecommendedAddress();
  const backerLockHash = (await ccc.Address.fromString(backerAddr, client)).script.hash();

  // Step 1: Create campaign
  const currentBlock = await getCurrentBlock(client);
  const deadline = currentBlock + BigInt(5);
  const fundingGoal = BigInt(1000 * 100000000); // 1000 CKB

  console.log(`1. Creating campaign (goal: 1000 CKB, deadline: block ${deadline})`);
  const campaignTxHash = await builder.createCampaign(creatorSigner, {
    creatorLockHash,
    fundingGoal,
    deadlineBlock: deadline,
  });
  console.log(`   Campaign TX: ${campaignTxHash}`);
  await waitForTx(client, campaignTxHash);

  // Step 2: Backer pledges insufficient amount
  console.log("\n2. Backer pledges 50 CKB (below 1000 CKB goal)");
  const pledgeTxHash = await builder.createPledge(backerSigner, {
    campaignId: campaignTxHash,
    backerLockHash,
    amount: BigInt(50 * 100000000), // 50 CKB — far below 1000 CKB goal
  });
  console.log(`   Pledge TX: ${pledgeTxHash}`);
  await waitForTx(client, pledgeTxHash);

  // Step 3: Wait for deadline
  console.log("\n3. Waiting for deadline to pass...");
  let block = await getCurrentBlock(client);
  while (block <= deadline) {
    await sleep(3000);
    block = await getCurrentBlock(client);
    console.log(`   Current block: ${block}, deadline: ${deadline}`);
  }
  console.log("   Deadline passed!");

  // Step 4: Creator finalizes as Failed
  console.log("\n4. Creator finalizes campaign as Failed");
  const finalizeTxHash = await builder.finalizeCampaign(creatorSigner, {
    campaignOutPoint: { txHash: campaignTxHash, index: 0 },
    campaignData: {
      creatorLockHash,
      fundingGoal,
      deadlineBlock: deadline,
      totalPledged: BigInt(0), // On-chain totalPledged is 0
    },
    newStatus: CampaignStatus.Failed,
  });
  console.log(`   Finalize TX: ${finalizeTxHash}`);
  await waitForTx(client, finalizeTxHash);

  // Step 5: Backer claims refund
  console.log("\n5. Backer claims refund");
  const pledgeDataSize = 72;
  const baseCapacity = BigInt(Math.ceil((8 + pledgeDataSize + 65 + 65) * 1.2)) * BigInt(100000000);
  const pledgeCapacity = baseCapacity + BigInt(50 * 100000000);

  const refundTxHash = await builder.refundPledge(backerSigner, {
    pledgeOutPoint: { txHash: pledgeTxHash, index: 0 },
    pledgeCapacity,
  });
  console.log(`   Refund TX: ${refundTxHash}`);
  await waitForTx(client, refundTxHash);

  console.log("\n   SUCCESS: Full failure lifecycle completed!");
}

/**
 * Test 3: Non-Creator Permissionless Finalization
 * Tests permissionless finalization via campaign-lock script deadline enforcement
 *
 * Scenario:
 * 1. Creator (Account A) creates campaign with deadline_block = current_block + 20
 * 2. Creator pledges to campaign
 * 3. Non-creator (Account B) attempts finalize BEFORE deadline
 *    - Expected: REJECTED by campaign-lock script (ERROR_SINCE_BELOW_DEADLINE)
 * 4. Wait for deadline to pass (20+ blocks)
 * 5. Non-creator (Account B) finalizes after deadline
 *    - Expected: SUCCESS
 * 6. Non-creator (Account B) calls permissionlessRelease
 *    - Expected: SUCCESS (funds routed to creator without creator participation)
 * 7. Creator (Account A) attempts finalize again
 *    - Expected: REJECTED (already finalized)
 */
async function testNonCreatorPermissionlessFinalization() {
  console.log("\n=== TEST 3: Non-Creator Permissionless Finalization ===\n");

  const client = createCkbClient("devnet", rpcUrl);
  const builder = new TransactionBuilder(client, campaignContract, campaignLockContract, pledgeContract, pledgeLockContract, receiptContract);

  const creatorSigner = new ccc.SignerCkbPrivateKey(client, creatorKey);
  const backerSigner = new ccc.SignerCkbPrivateKey(client, backerKey);

  const creatorAddr = await creatorSigner.getRecommendedAddress();
  const creatorLockHash = (await ccc.Address.fromString(creatorAddr, client)).script.hash();

  const backerAddr = await backerSigner.getRecommendedAddress();
  const backerLockHash = (await ccc.Address.fromString(backerAddr, client)).script.hash();

  // Step 1: Create campaign with deadline = current_block + 20
  const currentBlock = await getCurrentBlock(client);
  const deadline = currentBlock + BigInt(20); // 20 blocks from now
  const fundingGoal = BigInt(100 * 100000000); // 100 CKB

  console.log(`1. Creator creates campaign (goal: 100 CKB, deadline: block ${deadline})`);
  console.log(`   Current block: ${currentBlock}`);
  console.log(`   Time until deadline: ${BigInt(deadline) - currentBlock} blocks`);
  const campaignTxHash = await builder.createCampaign(creatorSigner, {
    creatorLockHash,
    fundingGoal,
    deadlineBlock: deadline,
  });
  console.log(`   Campaign TX: ${campaignTxHash}`);
  await waitForTx(client, campaignTxHash);

  // Step 2: Creator pledges to campaign using v1.1 pledge-lock (enables permissionless release)
  console.log("\n2. Creator pledges 150 CKB via createPledgeWithReceipt (v1.1 pledge-lock)");

  // Get campaign type script hash for pledge-lock args
  const campaignTx = await client.getTransaction(campaignTxHash);
  const campaignOutput = campaignTx!.transaction!.outputs[0];
  const campaignTypeScriptHash = ccc.Script.from(campaignOutput.type!).hash();

  const pledgeTxHash = await builder.createPledgeWithReceipt(creatorSigner, {
    campaignOutPoint: { txHash: campaignTxHash, index: 0 },
    campaignTypeScriptHash,
    deadlineBlock: deadline,
    backerLockHash: creatorLockHash, // Creator pledging to own campaign
    amount: BigInt(150 * 100000000), // 150 CKB
    campaignId: campaignTxHash,
  });
  console.log(`   Pledge TX: ${pledgeTxHash}`);
  await waitForTx(client, pledgeTxHash);

  // Step 3: Non-creator attempts finalize BEFORE deadline (should fail)
  console.log("\n3. Non-creator (Account B) attempts to finalize BEFORE deadline");
  const blockBeforeDeadline = await getCurrentBlock(client);
  console.log(`   Current block: ${blockBeforeDeadline}, Deadline: ${deadline}`);
  console.log(`   Blocks remaining: ${BigInt(deadline) - blockBeforeDeadline}`);

  let beforeDeadlineFailureOccurred = false;
  try {
    await builder.finalizeCampaign(backerSigner, {
      campaignOutPoint: { txHash: campaignTxHash, index: 0 },
      campaignData: {
        creatorLockHash,
        fundingGoal,
        deadlineBlock: deadline,
        totalPledged: BigInt(0),
      },
      newStatus: CampaignStatus.Success,
    });
    console.error("   ERROR: Finalization BEFORE deadline should have failed!");
    console.error("   The campaign-lock script should have rejected this transaction");
  } catch (error: any) {
    console.log(`   ✓ Expected failure (before deadline): ${error.message}`);
    beforeDeadlineFailureOccurred = true;
  }

  if (!beforeDeadlineFailureOccurred) {
    console.error("\n   CRITICAL: Before-deadline rejection did not occur!");
    console.error("   The campaign-lock contract is not enforcing deadline via since field");
    throw new Error("Campaign-lock deadline enforcement failed");
  }

  // Step 4: Wait for deadline to pass (20+ blocks)
  console.log("\n4. Waiting for deadline to pass...");
  let block = await getCurrentBlock(client);
  while (block < deadline) {
    const blocksRemaining = BigInt(deadline) - block;
    console.log(`   Current block: ${block}, deadline: ${deadline} (${blocksRemaining} blocks remaining)`);
    await sleep(3000);
    block = await getCurrentBlock(client);
  }
  console.log(`   Deadline passed! Current block: ${block}, deadline: ${deadline}`);

  // Step 5: Non-creator finalizes after deadline (should succeed)
  console.log("\n5. Non-creator (Account B) finalizes after deadline");
  console.log(`   Current block: ${block}, Deadline: ${deadline}`);
  let finalizeTxHash: string;
  try {
    finalizeTxHash = await builder.finalizeCampaign(backerSigner, {
      campaignOutPoint: { txHash: campaignTxHash, index: 0 },
      campaignData: {
        creatorLockHash,
        fundingGoal,
        deadlineBlock: deadline,
        totalPledged: BigInt(0),
      },
      newStatus: CampaignStatus.Success,
    });
    console.log(`   ✓ Finalization succeeded: ${finalizeTxHash}`);
    await waitForTx(client, finalizeTxHash);
  } catch (error: any) {
    console.error(`   ERROR: Finalization after deadline failed: ${error.message}`);
    throw new Error("Non-creator finalization should succeed after deadline");
  }

  // Step 6: Non-creator calls permissionlessRelease (v1.1 — pledge-lock routes to creator)
  console.log("\n6. Non-creator (Account B) triggers permissionless release");

  // Get pledge cell capacity and finalized campaign outpoint
  const pledgeTx = await client.getTransaction(pledgeTxHash);
  const pledgeOutput = pledgeTx!.transaction!.outputs[0];
  const pledgeCapacity = BigInt(pledgeOutput.capacity);

  // Get the creator's actual lock script (not just the hash)
  const creatorLockScriptObj = (await ccc.Address.fromString(creatorAddr, client)).script;
  const creatorLockScript = {
    codeHash: creatorLockScriptObj.codeHash,
    hashType: creatorLockScriptObj.hashType,
    args: creatorLockScriptObj.args,
  };

  let releaseTxHash: string;
  try {
    releaseTxHash = await builder.permissionlessRelease(backerSigner, {
      pledgeOutPoint: { txHash: pledgeTxHash, index: 0 },
      pledgeCapacity,
      campaignCellDep: { txHash: finalizeTxHash, index: 0 },
      creatorLockScript,
      deadlineBlock: deadline,
    });
    console.log(`   ✓ Permissionless release succeeded: ${releaseTxHash}`);
    console.log(`   Funds routed to creator without creator participation`);
    await waitForTx(client, releaseTxHash);
  } catch (error: any) {
    console.error(`   ERROR: Permissionless release failed: ${error.message}`);
    throw new Error("Permissionless release should work post-finalization");
  }

  // Step 7: Creator attempts finalize again (should fail)
  console.log("\n7. Creator (Account A) attempts to finalize again");
  let doubleFinalizationFailureOccurred = false;
  try {
    await builder.finalizeCampaign(creatorSigner, {
      campaignOutPoint: { txHash: campaignTxHash, index: 0 },
      campaignData: {
        creatorLockHash,
        fundingGoal,
        deadlineBlock: deadline,
        totalPledged: BigInt(0),
      },
      newStatus: CampaignStatus.Failed,
    });
    console.error("   ERROR: Double finalization should have failed!");
  } catch (error: any) {
    console.log(`   ✓ Expected failure (already finalized): ${error.message}`);
    doubleFinalizationFailureOccurred = true;
  }

  if (!doubleFinalizationFailureOccurred) {
    console.error("\n   WARNING: Double-finalization was not rejected by the contract");
    console.error("   This could indicate missing state validation in campaign type script");
  }

  console.log("\n   SUCCESS: Non-creator permissionless finalization test passed!");
  return true;
}

/**
 * Test 4: v1.1 Failure Lifecycle with Permissionless Refund
 * Create campaign -> Pledge with receipt (v1.1) -> Finalize as Failed -> Permissionless refund
 */
async function testPermissionlessRefundLifecycle() {
  console.log("\n=== TEST 4: v1.1 Permissionless Refund Lifecycle ===\n");

  const client = createCkbClient("devnet", rpcUrl);
  const builder = new TransactionBuilder(client, campaignContract, campaignLockContract, pledgeContract, pledgeLockContract, receiptContract);

  const creatorSigner = new ccc.SignerCkbPrivateKey(client, creatorKey);
  const backerSigner = new ccc.SignerCkbPrivateKey(client, backerKey);

  const creatorAddr = await creatorSigner.getRecommendedAddress();
  const creatorLockHash = (await ccc.Address.fromString(creatorAddr, client)).script.hash();

  const backerAddr = await backerSigner.getRecommendedAddress();
  const backerLockHash = (await ccc.Address.fromString(backerAddr, client)).script.hash();
  const backerLockScriptObj = (await ccc.Address.fromString(backerAddr, client)).script;

  // Step 1: Create campaign with high goal (will fail)
  const currentBlock = await getCurrentBlock(client);
  const deadline = currentBlock + BigInt(10);
  const fundingGoal = BigInt(10000 * 100000000); // 10000 CKB — unreachable

  console.log(`1. Creating campaign (goal: 10000 CKB, deadline: block ${deadline})`);
  const campaignTxHash = await builder.createCampaign(creatorSigner, {
    creatorLockHash,
    fundingGoal,
    deadlineBlock: deadline,
  });
  console.log(`   Campaign TX: ${campaignTxHash}`);
  await waitForTx(client, campaignTxHash);

  // Step 2: Backer pledges with receipt (v1.1 pledge-lock)
  const campaignTx = await client.getTransaction(campaignTxHash);
  const campaignOutput = campaignTx!.transaction!.outputs[0];
  const campaignTypeScriptHash = ccc.Script.from(campaignOutput.type!).hash();

  console.log("\n2. Backer pledges 100 CKB via createPledgeWithReceipt (v1.1)");
  const pledgeTxHash = await builder.createPledgeWithReceipt(backerSigner, {
    campaignOutPoint: { txHash: campaignTxHash, index: 0 },
    campaignTypeScriptHash,
    deadlineBlock: deadline,
    backerLockHash,
    amount: BigInt(100 * 100000000), // 100 CKB
    campaignId: campaignTxHash,
  });
  console.log(`   Pledge TX: ${pledgeTxHash}`);
  await waitForTx(client, pledgeTxHash);

  // Step 3: Wait for deadline
  console.log("\n3. Waiting for deadline to pass...");
  let block = await getCurrentBlock(client);
  while (block < deadline) {
    console.log(`   Current block: ${block}, deadline: ${deadline}`);
    await sleep(3000);
    block = await getCurrentBlock(client);
  }
  console.log(`   Deadline passed! Current block: ${block}`);

  // Step 4: Anyone finalizes as Failed
  console.log("\n4. Non-creator finalizes campaign as Failed");
  const finalizeTxHash = await builder.finalizeCampaign(backerSigner, {
    campaignOutPoint: { txHash: campaignTxHash, index: 0 },
    campaignData: {
      creatorLockHash,
      fundingGoal,
      deadlineBlock: deadline,
      totalPledged: BigInt(0),
    },
    newStatus: CampaignStatus.Failed,
  });
  console.log(`   Finalize TX: ${finalizeTxHash}`);
  await waitForTx(client, finalizeTxHash);

  // Step 5: Permissionless refund — anyone triggers, pledge-lock routes funds to backer
  console.log("\n5. Triggering permissionless refund (anyone can call)");

  // Get pledge and receipt cell capacities
  const pledgeTx = await client.getTransaction(pledgeTxHash);
  const pledgeOutput = pledgeTx!.transaction!.outputs[0];
  const pledgeCapacity = BigInt(pledgeOutput.capacity);
  // Receipt is output[1] in createPledgeWithReceipt
  const receiptOutput = pledgeTx!.transaction!.outputs[1];
  const receiptCapacity = BigInt(receiptOutput.capacity);

  const refundTxHash = await builder.permissionlessRefund(backerSigner, {
    pledgeOutPoint: { txHash: pledgeTxHash, index: 0 },
    pledgeCapacity,
    receiptOutPoint: { txHash: pledgeTxHash, index: 1 },
    receiptCapacity,
    campaignCellDep: { txHash: finalizeTxHash, index: 0 },
    backerLockScript: {
      codeHash: backerLockScriptObj.codeHash,
      hashType: backerLockScriptObj.hashType,
      args: backerLockScriptObj.args,
    },
    deadlineBlock: deadline,
  });
  console.log(`   Refund TX: ${refundTxHash}`);
  await waitForTx(client, refundTxHash);

  console.log("\n   SUCCESS: v1.1 permissionless refund lifecycle completed!");
}

async function main() {
  console.log("=== CKB Kickstarter Lifecycle Integration Tests ===");
  console.log(`RPC: ${rpcUrl}`);
  console.log(`Campaign contract: ${campaignContract.codeHash}`);
  console.log(`Pledge contract: ${pledgeContract.codeHash}`);

  try {
    await testSuccessLifecycle();
    await testFailureLifecycle();
    await testNonCreatorPermissionlessFinalization();
    await testPermissionlessRefundLifecycle();
    console.log("\n\n=== ALL TESTS PASSED ===");
  } catch (error) {
    console.error("\n\nTEST FAILED:", error);
    process.exit(1);
  }
}

main().catch(console.error);
