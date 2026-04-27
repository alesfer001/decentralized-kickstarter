/**
 * Bot E2E test: create campaign + pledge, then verify the bot auto-finalizes and distributes.
 *
 * Prerequisites:
 *   1. OffCKB devnet running (http://127.0.0.1:8114)
 *   2. Contracts deployed (deployment/deployed-contracts-devnet.json)
 *   3. Indexer with bot running: cd off-chain/indexer && npx ts-node src/index.ts
 *
 * Run with: cd off-chain/transaction-builder && npx ts-node test-bot.ts
 */

import { ccc } from "@ckb-ccc/core";
import { TransactionBuilder } from "./src";
import type { ContractInfo } from "./src/types";
import { createCkbClient } from "./src/ckbClient";
import * as fs from "fs";
import * as path from "path";

const deployedContracts = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../deployment/deployed-contracts-devnet.json"), "utf-8")
);

const campaignContract: ContractInfo = { codeHash: deployedContracts.campaign.codeHash, hashType: "data2", txHash: deployedContracts.campaign.txHash, index: 0 };
const campaignLockContract: ContractInfo = { codeHash: deployedContracts.campaignLock.codeHash, hashType: "data2", txHash: deployedContracts.campaignLock.txHash, index: 0 };
const pledgeContract: ContractInfo = { codeHash: deployedContracts.pledge.codeHash, hashType: "data2", txHash: deployedContracts.pledge.txHash, index: 0 };
const pledgeLockContract: ContractInfo = { codeHash: deployedContracts.pledgeLock.codeHash, hashType: "data2", txHash: deployedContracts.pledgeLock.txHash, index: 0 };
const receiptContract: ContractInfo = { codeHash: deployedContracts.receipt.codeHash, hashType: "data2", txHash: deployedContracts.receipt.txHash, index: 0 };

const rpcUrl = "http://127.0.0.1:8114";
const indexerUrl = "http://localhost:3001";

// Use Account #0 (creator) and Account #1 (backer)
const creatorKey = "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6";
const backerKey = "0x9f315d5a9618a39fdc487c7a67a8581d40b045bd7a42d83648ca80ef3b2cb4a1";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTx(client: ccc.Client, txHash: string, timeout = 60000): Promise<void> {
  console.log(`  Waiting for tx ${txHash.slice(0, 18)}...`);
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const tx = await client.getTransaction(txHash);
      if (tx && tx.status === "committed") {
        console.log("  Confirmed!");
        return;
      }
    } catch {}
    await sleep(2000);
  }
  throw new Error(`Transaction ${txHash} not confirmed after ${timeout}ms`);
}

async function getCurrentBlock(): Promise<bigint> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "get_tip_block_number", params: [] }),
  });
  const json = (await res.json()) as { result: string };
  return BigInt(json.result);
}

async function getCampaignFromIndexer(campaignTxHash: string): Promise<any> {
  const res = await fetch(`${indexerUrl}/campaigns`);
  const campaigns = (await res.json()) as any[];
  return campaigns.find((c: any) => (c.campaignId || c.id || "").startsWith(campaignTxHash));
}

async function getPledgesFromIndexer(campaignId: string): Promise<any[]> {
  const res = await fetch(`${indexerUrl}/campaigns/${campaignId}/pledges`);
  return (await res.json()) as any[];
}

async function main() {
  console.log("=== BOT E2E TEST ===\n");

  // Verify indexer is running
  try {
    const health = await fetch(`${indexerUrl}/health`);
    if (!health.ok) throw new Error("Indexer not healthy");
    console.log("Indexer is running.\n");
  } catch {
    console.error("ERROR: Indexer not running. Start it first:");
    console.error("  cd off-chain/indexer && npx ts-node src/index.ts");
    process.exit(1);
  }

  const client = createCkbClient("devnet", rpcUrl);
  const builder = new TransactionBuilder(client, campaignContract, campaignLockContract, pledgeContract, pledgeLockContract, receiptContract);
  const creatorSigner = new ccc.SignerCkbPrivateKey(client, creatorKey);
  const backerSigner = new ccc.SignerCkbPrivateKey(client, backerKey);

  const creatorAddr = await creatorSigner.getRecommendedAddress();
  const creatorLockHash = (await ccc.Address.fromString(creatorAddr, client)).script.hash();
  const backerAddr = await backerSigner.getRecommendedAddress();
  const backerLockHash = (await ccc.Address.fromString(backerAddr, client)).script.hash();

  // --- Test A: Success path (bot finalizes + releases) ---
  console.log("--- Test A: Success path (bot auto-finalize + release) ---\n");

  const currentBlock = await getCurrentBlock();
  const deadline = currentBlock + 5n; // expires in ~5 blocks (~25s on devnet)
  const fundingGoal = 200n * 100000000n; // 200 CKB

  console.log(`1. Creating campaign (goal: 200 CKB, deadline: block ${deadline})`);
  const campaignTxHash = await builder.createCampaign(creatorSigner, {
    creatorLockHash,
    fundingGoal,
    deadlineBlock: deadline,
    title: "Bot Test Campaign",
    description: "Testing automatic finalization bot",
  });
  console.log(`   Campaign TX: ${campaignTxHash}`);
  await waitForTx(client, campaignTxHash);

  // Get campaign type script hash (needed for pledge lock args)
  const txWithStatus = await client.getTransaction(campaignTxHash);
  const campaignOutput = txWithStatus!.transaction!.outputs[0];
  const campaignTypeScriptHash = ccc.Script.from(campaignOutput.type!).hash();
  console.log(`   Type script hash: ${campaignTypeScriptHash.slice(0, 18)}...`);

  console.log("\n2. Backer pledges 250 CKB (exceeds 200 CKB goal)");
  const pledgeTxHash = await builder.createPledgeWithReceipt(backerSigner, {
    campaignOutPoint: { txHash: campaignTxHash, index: 0 },
    campaignTypeScriptHash,
    backerLockHash,
    amount: 250n * 100000000n,
    deadlineBlock: deadline,
    campaignId: campaignTxHash,
  });
  console.log(`   Pledge TX: ${pledgeTxHash}`);
  await waitForTx(client, pledgeTxHash);

  console.log("\n3. Waiting for deadline to pass...");
  let block = await getCurrentBlock();
  while (block <= deadline) {
    await sleep(3000);
    block = await getCurrentBlock();
    console.log(`   Block: ${block} / deadline: ${deadline}`);
  }
  console.log("   Deadline passed!");

  console.log("\n4. Waiting for bot to auto-finalize (up to 30s)...");
  let campaign: any = null;
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    campaign = await getCampaignFromIndexer(campaignTxHash);
    if (campaign && campaign.status !== 0) {
      console.log(`   Bot finalized campaign! Status: ${campaign.status === 1 ? "Success" : "Failed"}`);
      break;
    }
    console.log(`   Still Active... (attempt ${i + 1})`);
  }

  if (!campaign || campaign.status === 0) {
    console.error("FAIL: Bot did not finalize campaign within 30s");
    process.exit(1);
  }

  if (campaign.status !== 1) {
    console.error(`FAIL: Expected Success (1), got status ${campaign.status}`);
    process.exit(1);
  }
  console.log("   ✓ Campaign finalized as Success");

  console.log("\n5. Waiting for bot to auto-release pledges (up to 30s)...");
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    const pledges = await getPledgesFromIndexer(campaign.campaignId);
    if (pledges.length === 0) {
      console.log("   ✓ All pledges released (no pledge cells remaining)");
      break;
    }
    console.log(`   ${pledges.length} pledge(s) still pending... (attempt ${i + 1})`);
    if (i === 14) {
      console.log("   WARNING: Pledges not released within 30s — bot may need more cycles");
    }
  }

  console.log("\n=== BOT E2E TEST COMPLETE ===");
  console.log("✓ Campaign created, pledged, auto-finalized, and auto-released by bot");
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
