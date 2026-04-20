/**
 * v1.1 Security Attack Scenario Tests
 *
 * Validates that hardened contracts (Officeyutong review fixes) correctly
 * REJECT malicious transactions. Each test crafts an attack transaction
 * and expects it to fail on-chain.
 *
 * Attack scenarios:
 *   1. Fail-safe backdoor: refund without campaign cell_dep on Success → REJECTED
 *   2. Campaign destruction: destroy Success campaign within grace period → REJECTED
 *   3. Premature finalization: finalize with since < deadline → REJECTED
 *
 * Prerequisites:
 *   1. OffCKB devnet running (offckb node)
 *   2. All 5 contracts deployed (npx ts-node deploy-contracts.ts)
 *
 * Run with: npx ts-node test-v1.1-security.ts
 */

import * as fs from "fs";
import * as path from "path";
import { ccc } from "@ckb-ccc/core";
import { TransactionBuilder } from "./src";
import type { ContractInfo } from "./src/types";
import { CampaignStatus } from "./src/types";
import { createCkbClient } from "./src/ckbClient";

const rpcUrl = "http://127.0.0.1:8114";

// Devnet test accounts (OffCKB pre-funded)
const creatorKey = "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6";
const backerKey = "0x9f315d5a9618a39fdc487c7a67a8581d40b045bd7a42d83648ca80ef3b2cb4a1";
const triggerKey = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";

// Load deployment artifacts
let campaignContract: ContractInfo;
let campaignLockContract: ContractInfo;
let pledgeContract: ContractInfo;
let pledgeLockContract: ContractInfo;
let receiptContract: ContractInfo;

try {
  const deploymentPath = path.resolve(__dirname, "../../deployment/deployed-contracts-devnet.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  campaignContract = { ...deployment.campaign, hashType: "data2" as const };
  campaignLockContract = { ...deployment.campaignLock, hashType: "data2" as const };
  pledgeContract = { ...deployment.pledge, hashType: "data2" as const };
  pledgeLockContract = { ...deployment.pledgeLock, hashType: "data2" as const };
  receiptContract = { ...deployment.receipt, hashType: "data2" as const };
  console.log("Loaded contract info from deployment artifact");
} catch {
  console.error("ERROR: Could not load deployment/deployed-contracts-devnet.json");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function getCampaignTypeScriptHash(client: ccc.Client, campaignTxHash: string): Promise<string> {
  const txWithStatus = await client.getTransaction(campaignTxHash);
  if (!txWithStatus || !txWithStatus.transaction) {
    throw new Error(`Transaction ${campaignTxHash} not found`);
  }
  const campaignOutput = txWithStatus.transaction.outputs[0];
  if (!campaignOutput.type) {
    throw new Error("Campaign cell has no type script");
  }
  const typeScript = ccc.Script.from(campaignOutput.type);
  return typeScript.hash();
}

/** Setup: create a Success campaign with a pledge (returns references for attack tests) */
async function setupSuccessCampaign() {
  console.log("\n--- Setting up Success campaign for attack tests ---\n");

  const client = createCkbClient("devnet", rpcUrl);
  const builder = new TransactionBuilder(client, campaignContract, campaignLockContract, pledgeContract, pledgeLockContract, receiptContract);

  const creatorSigner = new ccc.SignerCkbPrivateKey(client, creatorKey);
  const backerSigner = new ccc.SignerCkbPrivateKey(client, backerKey);

  const creatorAddr = await creatorSigner.getRecommendedAddress();
  const creatorLockHash = (await ccc.Address.fromString(creatorAddr, client)).script.hash();

  const backerAddr = await backerSigner.getRecommendedAddress();
  const backerLockScript = (await ccc.Address.fromString(backerAddr, client)).script;
  const backerLockHash = backerLockScript.hash();

  // Create campaign
  const currentBlock = await getCurrentBlock(client);
  const deadline = currentBlock + BigInt(5);
  const fundingGoal = BigInt(100 * 100000000);

  console.log(`Creating campaign (goal: 100 CKB, deadline: block ${deadline})`);
  const campaignTxHash = await builder.createCampaign(creatorSigner, {
    creatorLockHash,
    fundingGoal,
    deadlineBlock: deadline,
  });
  await waitForTx(client, campaignTxHash);

  const campaignTypeScriptHash = await getCampaignTypeScriptHash(client, campaignTxHash);

  // Pledge
  console.log("Backer pledges 150 CKB");
  const pledgeTxHash = await builder.createPledgeWithReceipt(backerSigner, {
    campaignOutPoint: { txHash: campaignTxHash, index: 0 },
    campaignTypeScriptHash,
    deadlineBlock: deadline,
    backerLockHash,
    amount: BigInt(150 * 100000000),
    campaignId: campaignTxHash,
  });
  await waitForTx(client, pledgeTxHash);

  // Wait for deadline
  console.log("Waiting for deadline...");
  let block = await getCurrentBlock(client);
  while (block <= deadline) {
    await sleep(3000);
    block = await getCurrentBlock(client);
  }

  // Finalize as Success
  console.log("Finalizing as Success");
  const finalizeTxHash = await builder.finalizeCampaign(creatorSigner, {
    campaignOutPoint: { txHash: campaignTxHash, index: 0 },
    campaignData: {
      creatorLockHash,
      fundingGoal,
      deadlineBlock: deadline,
      totalPledged: BigInt(0),
    },
    newStatus: CampaignStatus.Success,
  });
  await waitForTx(client, finalizeTxHash);

  const pledgeTxInfo = await client.getTransaction(pledgeTxHash);
  const pledgeCapacity = BigInt(pledgeTxInfo!.transaction!.outputs[0].capacity);

  const campaignTxInfo = await client.getTransaction(finalizeTxHash);
  const campaignCapacity = BigInt(campaignTxInfo!.transaction!.outputs[0].capacity);

  return {
    client,
    builder,
    campaignTxHash,
    finalizeTxHash,
    pledgeTxHash,
    pledgeCapacity,
    campaignCapacity,
    deadline,
    backerLockScript,
    creatorLockHash,
    fundingGoal,
  };
}

let passed = 0;
let failed = 0;

// ---------------------------------------------------------------------------
// Attack 1: Fail-safe backdoor — refund without campaign cell_dep
// ---------------------------------------------------------------------------

async function attackFailSafeBackdoor() {
  console.log("\n=== ATTACK 1: Fail-safe Backdoor (refund without campaign cell_dep) ===\n");

  const setup = await setupSuccessCampaign();

  // Attempt refund WITHOUT campaign cell_dep — this was the backdoor
  console.log("Attempting refund WITHOUT campaign cell_dep on Success campaign...");
  try {
    await setup.builder.permissionlessRefund(
      new ccc.SignerCkbPrivateKey(setup.client, backerKey),
      {
        pledgeOutPoint: { txHash: setup.pledgeTxHash, index: 0 },
        pledgeCapacity: setup.pledgeCapacity,
        // campaignCellDep intentionally omitted!
        backerLockScript: {
          codeHash: setup.backerLockScript.codeHash,
          hashType: setup.backerLockScript.hashType,
          args: setup.backerLockScript.args,
        },
        deadlineBlock: setup.deadline,
      }
    );
    console.log("  FAIL: Transaction was accepted — backdoor still open!");
    failed++;
  } catch (error: any) {
    const msg = error?.message || String(error);
    if (msg.includes("Script") || msg.includes("error") || msg.includes("reject") || msg.includes("failed")) {
      console.log(`  PASS: Transaction correctly rejected!`);
      console.log(`  Error: ${msg.slice(0, 200)}`);
      passed++;
    } else {
      console.log(`  FAIL: Unexpected error: ${msg.slice(0, 200)}`);
      failed++;
    }
  }
}

// ---------------------------------------------------------------------------
// Attack 2: Campaign destruction — destroy Success campaign
// ---------------------------------------------------------------------------

async function attackCampaignDestruction() {
  console.log("\n=== ATTACK 2: Destroy Success Campaign (within grace period) ===\n");

  const setup = await setupSuccessCampaign();

  // Attempt to destroy the Success campaign cell
  console.log("Attempting to destroy Success campaign cell...");
  try {
    await setup.builder.destroyCampaign(
      new ccc.SignerCkbPrivateKey(setup.client, creatorKey),
      {
        campaignOutPoint: { txHash: setup.finalizeTxHash, index: 0 },
        campaignCapacity: setup.campaignCapacity,
      }
    );
    console.log("  FAIL: Transaction was accepted — Success campaign destroyed!");
    failed++;
  } catch (error: any) {
    const msg = error?.message || String(error);
    if (msg.includes("Script") || msg.includes("error") || msg.includes("reject") || msg.includes("failed")) {
      console.log(`  PASS: Transaction correctly rejected!`);
      console.log(`  Error: ${msg.slice(0, 200)}`);
      passed++;
    } else {
      console.log(`  FAIL: Unexpected error: ${msg.slice(0, 200)}`);
      failed++;
    }
  }
}

// ---------------------------------------------------------------------------
// Attack 3: Premature finalization — finalize before deadline
// ---------------------------------------------------------------------------

async function attackPrematureFinalization() {
  console.log("\n=== ATTACK 3: Premature Finalization (before deadline) ===\n");

  const client = createCkbClient("devnet", rpcUrl);
  const builder = new TransactionBuilder(client, campaignContract, campaignLockContract, pledgeContract, pledgeLockContract, receiptContract);

  const creatorSigner = new ccc.SignerCkbPrivateKey(client, creatorKey);
  const creatorAddr = await creatorSigner.getRecommendedAddress();
  const creatorLockHash = (await ccc.Address.fromString(creatorAddr, client)).script.hash();

  // Create campaign with VERY far future deadline
  const currentBlock = await getCurrentBlock(client);
  const deadline = currentBlock + BigInt(10000); // far in the future
  const fundingGoal = BigInt(100 * 100000000);

  console.log(`Creating campaign with far-future deadline (block ${deadline})`);
  const campaignTxHash = await builder.createCampaign(creatorSigner, {
    creatorLockHash,
    fundingGoal,
    deadlineBlock: deadline,
  });
  await waitForTx(client, campaignTxHash);

  // Attempt to finalize BEFORE deadline
  console.log("Attempting premature finalization (current block << deadline)...");
  try {
    await builder.finalizeCampaign(creatorSigner, {
      campaignOutPoint: { txHash: campaignTxHash, index: 0 },
      campaignData: {
        creatorLockHash,
        fundingGoal,
        deadlineBlock: deadline,
        totalPledged: BigInt(0),
      },
      newStatus: CampaignStatus.Success,
    });
    console.log("  FAIL: Premature finalization was accepted!");
    failed++;
  } catch (error: any) {
    const msg = error?.message || String(error);
    if (msg.includes("Script") || msg.includes("error") || msg.includes("reject") || msg.includes("failed") || msg.includes("since")) {
      console.log(`  PASS: Premature finalization correctly rejected!`);
      console.log(`  Error: ${msg.slice(0, 200)}`);
      passed++;
    } else {
      console.log(`  FAIL: Unexpected error: ${msg.slice(0, 200)}`);
      failed++;
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== CKB Kickstarter v1.1 Security Attack Tests ===");
  console.log(`RPC: ${rpcUrl}`);
  console.log("Testing that hardened contracts reject attack vectors...\n");

  try {
    await attackFailSafeBackdoor();
    await attackCampaignDestruction();
    await attackPrematureFinalization();

    console.log(`\n\n=== SECURITY TEST RESULTS ===`);
    console.log(`Passed: ${passed}/3`);
    console.log(`Failed: ${failed}/3`);

    if (failed > 0) {
      console.log("\nWARNING: Some attack vectors were NOT properly blocked!");
      process.exit(1);
    } else {
      console.log("\nAll attack vectors correctly rejected. Security fixes validated.");
    }
  } catch (error) {
    console.error("\n\nTEST ERROR:", error);
    process.exit(1);
  }
}

main().catch(console.error);
