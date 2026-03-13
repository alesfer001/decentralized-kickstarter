/**
 * Seed script for frontend testing
 * Creates campaigns and pledges in various states for manual UI testing.
 *
 * Run with: npx ts-node seed-frontend-test.ts
 *
 * Prerequisites:
 *   1. OffCKB devnet running (offckb node)
 *   2. Indexer running (cd ../indexer && npm run dev)
 */

import { ccc } from "@ckb-ccc/core";
import { TransactionBuilder } from "./src";
import type { ContractInfo } from "./src/types";
import { CampaignStatus } from "./src/types";
import { createCkbClient } from "./src/ckbClient";

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

const rpcUrl = "http://127.0.0.1:8114";
const creatorKey = "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6";
const backerKey = "0x9f315d5a9618a39fdc487c7a67a8581d40b045bd7a42d83648ca80ef3b2cb4a1";
const creatorAddress = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvwg2cen8extgq8s5puft8vf40px3f599cytcyd8";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTx(client: ccc.Client, txHash: string) {
  const start = Date.now();
  while (Date.now() - start < 60000) {
    const tx = await client.getTransaction(txHash);
    if (tx && tx.status === "committed") return;
    await sleep(3000);
  }
  throw new Error(`Tx ${txHash} not confirmed`);
}

/**
 * Find all live cells matching a type script code hash
 */
async function findCellsByType(client: ccc.Client, codeHash: string): Promise<ccc.Cell[]> {
  const cells: ccc.Cell[] = [];
  for await (const cell of client.findCells({
    script: { codeHash, hashType: "data2" as const, args: "0x" },
    scriptType: "type" as const,
    scriptSearchMode: "exact" as const,
  }, "asc", 1000)) {
    cells.push(cell);
  }
  return cells;
}

/**
 * Consume a batch of cells owned by the given signer.
 * Destroys typed cells by spending them into a plain CKB output (no type script).
 */
async function consumeCells(
  client: ccc.Client,
  cells: ccc.Cell[],
  signer: ccc.Signer,
  label: string
) {
  if (cells.length === 0) return;

  console.log(`  Consuming ${cells.length} ${label} cells...`);

  const address = await signer.getRecommendedAddress();
  const lockScript = (await ccc.Address.fromString(address, client)).script;

  let totalCapacity = BigInt(0);
  const inputs = cells.map((cell) => {
    totalCapacity += cell.cellOutput.capacity;
    return {
      previousOutput: {
        txHash: cell.outPoint.txHash,
        index: cell.outPoint.index,
      },
    };
  });

  const tx = ccc.Transaction.from({
    inputs,
    outputs: [{ capacity: totalCapacity, lock: lockScript }],
    outputsData: ["0x"],
    cellDeps: [
      { outPoint: { txHash: campaignContract.txHash, index: campaignContract.index }, depType: "code" as const },
      { outPoint: { txHash: pledgeContract.txHash, index: pledgeContract.index }, depType: "code" as const },
    ],
  });

  await tx.completeFeeBy(signer, 1000);
  const txHash = await signer.sendTransaction(tx);
  console.log(`  TX: ${txHash}`);
  await waitForTx(client, txHash);
}

/**
 * Remove all existing campaign and pledge cells from the devnet.
 * Groups cells by lock script owner (creator vs backer) and consumes them.
 */
async function cleanupExistingData(
  client: ccc.Client,
  creatorSigner: ccc.Signer,
  backerSigner: ccc.Signer
) {
  console.log("=== Cleaning up existing devnet data ===\n");

  const campaignCells = await findCellsByType(client, campaignContract.codeHash);
  const pledgeCells = await findCellsByType(client, pledgeContract.codeHash);

  console.log(`  Found ${campaignCells.length} campaign cells, ${pledgeCells.length} pledge cells`);

  if (campaignCells.length === 0 && pledgeCells.length === 0) {
    console.log("  Nothing to clean up!\n");
    return;
  }

  // Group all cells by lock args to determine which signer can spend them
  const creatorLockArg = "8e42b1999f265a0078503c4acec4d5e134534297";
  const backerLockArg = "758d311c8483e0602dfad7b69d9053e3f917457d";

  const creatorOwned: ccc.Cell[] = [];
  const backerOwned: ccc.Cell[] = [];

  for (const cell of [...pledgeCells, ...campaignCells]) {
    const args = cell.cellOutput.lock.args.toLowerCase();
    if (args.includes(creatorLockArg)) {
      creatorOwned.push(cell);
    } else if (args.includes(backerLockArg)) {
      backerOwned.push(cell);
    } else {
      console.log(`  Skipping cell owned by unknown account: ${cell.outPoint.txHash}:${cell.outPoint.index}`);
    }
  }

  // Consume backer-owned cells first (pledges), then creator-owned (campaigns)
  await consumeCells(client, backerOwned, backerSigner, "backer-owned");
  await consumeCells(client, creatorOwned, creatorSigner, "creator-owned");

  console.log("  Cleanup complete!\n");
}

async function main() {
  const client = createCkbClient("devnet", rpcUrl);
  const builder = new TransactionBuilder(client, campaignContract, pledgeContract);
  const creatorSigner = new ccc.SignerCkbPrivateKey(client, creatorKey);
  const backerSigner = new ccc.SignerCkbPrivateKey(client, backerKey);

  const creatorAddr = await creatorSigner.getRecommendedAddress();
  const creatorLockHash = (await ccc.Address.fromString(creatorAddr, client)).script.hash();
  const backerAddr = await backerSigner.getRecommendedAddress();
  const backerLockHash = (await ccc.Address.fromString(backerAddr, client)).script.hash();

  // Clean up any existing data first
  await cleanupExistingData(client, creatorSigner, backerSigner);

  const tip = await client.getTip();
  const currentBlock = BigInt(tip);
  console.log(`Current block: ${currentBlock}\n`);

  // ─── Campaign A: Active, not expired, with a pledge ───
  console.log("=== Campaign A: Active campaign (far deadline, has pledge) ===");
  const txA = await builder.createCampaign(creatorSigner, {
    creatorLockHash,
    fundingGoal: BigInt(500 * 1e8),
    deadlineBlock: currentBlock + BigInt(10000),
    title: "CKB Developer Tools Suite",
    description: "Building a comprehensive set of developer tools for the CKB ecosystem, including a visual debugger, transaction inspector, and contract testing framework.",
  });
  console.log(`  Created: ${txA}`);
  await waitForTx(client, txA);

  const pledgeA = await builder.createPledge(backerSigner, {
    campaignId: txA,
    backerLockHash,
    amount: BigInt(100 * 1e8),
  });
  console.log(`  Pledge: ${pledgeA}`);
  await waitForTx(client, pledgeA);

  // ─── Campaign B: Expired, goal MET, needs finalization ───
  console.log("\n=== Campaign B: Expired + goal met (needs finalize → Success) ===");
  const txB = await builder.createCampaign(creatorSigner, {
    creatorLockHash,
    fundingGoal: BigInt(100 * 1e8),
    deadlineBlock: currentBlock + BigInt(3),
    title: "Nervos Community Meetup Fund",
    description: "Organizing quarterly Nervos community meetups across major cities. Funds cover venue rental, speaker travel, and refreshments.",
  });
  console.log(`  Created: ${txB}`);
  await waitForTx(client, txB);

  const pledgeB = await builder.createPledge(backerSigner, {
    campaignId: txB,
    backerLockHash,
    amount: BigInt(200 * 1e8),
  });
  console.log(`  Pledge: ${pledgeB}`);
  await waitForTx(client, pledgeB);

  console.log("  Waiting for deadline...");
  let block = BigInt((await client.getTip()).toString());
  const deadlineB = currentBlock + BigInt(3);
  while (block <= deadlineB) {
    await sleep(3000);
    block = BigInt((await client.getTip()).toString());
  }
  console.log("  Expired! (Do NOT finalize yet — test this in the UI)");

  // ─── Campaign C: Already finalized as Failed, pledge ready for refund ───
  console.log("\n=== Campaign C: Failed campaign (finalized, pledge ready for refund) ===");
  const txC = await builder.createCampaign(creatorSigner, {
    creatorLockHash,
    fundingGoal: BigInt(1000 * 1e8),
    deadlineBlock: currentBlock + BigInt(3),
    title: "Decentralized Social Network on CKB",
    description: "A fully on-chain social network with user-owned data. Posts, follows, and interactions are all stored as CKB cells.",
  });
  console.log(`  Created: ${txC}`);
  await waitForTx(client, txC);

  const pledgeC = await builder.createPledge(backerSigner, {
    campaignId: txC,
    backerLockHash,
    amount: BigInt(50 * 1e8),
  });
  console.log(`  Pledge: ${pledgeC}`);
  await waitForTx(client, pledgeC);

  console.log("  Waiting for deadline...");
  block = BigInt((await client.getTip()).toString());
  const deadlineC = currentBlock + BigInt(3);
  while (block <= deadlineC) {
    await sleep(3000);
    block = BigInt((await client.getTip()).toString());
  }

  console.log("  Finalizing as Failed...");
  const finalizeC = await builder.finalizeCampaign(creatorSigner, {
    campaignOutPoint: { txHash: txC, index: 0 },
    campaignData: {
      creatorLockHash,
      fundingGoal: BigInt(1000 * 1e8),
      deadlineBlock: currentBlock + BigInt(3),
      totalPledged: BigInt(0),
      title: "Decentralized Social Network on CKB",
      description: "A fully on-chain social network with user-owned data. Posts, follows, and interactions are all stored as CKB cells.",
    },
    newStatus: CampaignStatus.Failed,
  });
  console.log(`  Finalized: ${finalizeC}`);
  await waitForTx(client, finalizeC);
  console.log("  Ready! (Backer can claim refund in UI)");

  // ─── Campaign D: Already finalized as Success, pledge ready for release ───
  console.log("\n=== Campaign D: Successful campaign (finalized, pledge ready for release) ===");
  const txD = await builder.createCampaign(creatorSigner, {
    creatorLockHash,
    fundingGoal: BigInt(100 * 1e8),
    deadlineBlock: currentBlock + BigInt(3),
    title: "CKB Block Explorer Redesign",
    description: "Redesigning the CKB block explorer with a modern UI, real-time updates, and better cell visualization.",
  });
  console.log(`  Created: ${txD}`);
  await waitForTx(client, txD);

  const pledgeD = await builder.createPledge(backerSigner, {
    campaignId: txD,
    backerLockHash,
    amount: BigInt(150 * 1e8),
  });
  console.log(`  Pledge: ${pledgeD}`);
  await waitForTx(client, pledgeD);

  console.log("  Waiting for deadline...");
  block = BigInt((await client.getTip()).toString());
  const deadlineD = currentBlock + BigInt(3);
  while (block <= deadlineD) {
    await sleep(3000);
    block = BigInt((await client.getTip()).toString());
  }

  console.log("  Finalizing as Success...");
  const finalizeD = await builder.finalizeCampaign(creatorSigner, {
    campaignOutPoint: { txHash: txD, index: 0 },
    campaignData: {
      creatorLockHash,
      fundingGoal: BigInt(100 * 1e8),
      deadlineBlock: currentBlock + BigInt(3),
      totalPledged: BigInt(0),
      title: "CKB Block Explorer Redesign",
      description: "Redesigning the CKB block explorer with a modern UI, real-time updates, and better cell visualization.",
    },
    newStatus: CampaignStatus.Success,
  });
  console.log(`  Finalized: ${finalizeD}`);
  await waitForTx(client, finalizeD);
  console.log("  Ready! (Backer can release to creator in UI)");

  console.log("\n\n========================================");
  console.log("  SEED DATA COMPLETE — 4 campaigns created");
  console.log("========================================");
  console.log("\nTest scenarios in the frontend:");
  console.log("  A: Active campaign — verify pledge form works");
  console.log("  B: Expired+met — switch to Account #0 (creator), click 'Finalize Campaign'");
  console.log("  C: Failed — switch to Account #1 (backer), click 'Claim Refund'");
  console.log("  D: Success — switch to Account #1 (backer), click 'Release to Creator'");
  console.log("\nDevnet accounts:");
  console.log("  #0 (creator): ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvwg2cen8extgq8s5puft8vf40px3f599cytcyd8");
  console.log("  #1 (backer):  ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt435c3epyrupszm7khk6weq5lrlyt52lg48ucew");
}

main().catch(console.error);
