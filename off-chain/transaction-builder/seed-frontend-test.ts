/**
 * Seed script for frontend testing
 * Creates campaigns and pledges in various states for manual UI testing (v1.2 pledge path).
 *
 * Run with: npx ts-node seed-frontend-test.ts
 *
 * Prerequisites:
 *   1. OffCKB devnet running (nvm use v18 && offckb node)
 *   2. All 5 contracts deployed (npx ts-node deploy-contracts.ts)
 *   3. Indexer running (cd ../indexer && npm run dev). Start it with BOT_PRIVATE_KEY unset
 *      if campaigns B-D should stay undistributed for manual testing.
 *
 * Seeded data is additive. The old cleanup step is gone: since v1.1 pledge cells are
 * locked by the pledge lock and campaign cells can only be destroyed after the grace period,
 * so neither devnet account can simply spend them. Reset the devnet to start clean.
 */

import { CampaignStatus } from "./src/types";
import { CKB, setupDevnet, waitForTx, waitForBlock, campaignTypeArgs } from "./test-helpers";

type Devnet = Awaited<ReturnType<typeof setupDevnet>>;

interface SeedCampaign {
  title: string;
  description: string;
  goal: bigint;
  pledge: bigint;
}

async function createWithPledge(d: Devnet, seed: SeedCampaign, deadline: bigint) {
  const txHash = await d.builder.createCampaign(d.creator, {
    creatorLockHash: d.creatorLock.hash(),
    fundingGoal: seed.goal,
    deadlineBlock: deadline,
    title: seed.title,
    description: seed.description,
  });
  console.log(`  Created: ${txHash}`);
  await waitForTx(d.client, txHash);
  const typeArgs = await campaignTypeArgs(d.client, txHash);

  const pledgeTx = await d.builder.createPledgeWithReceipt(d.backer, {
    campaignOutPoint: { txHash, index: 0 },
    campaignTypeArgs: typeArgs,
    deadlineBlock: deadline,
    backerLockHash: d.backerLock.hash(),
    amount: seed.pledge,
    campaignId: txHash,
  });
  console.log(`  Pledge (${seed.pledge / CKB} CKB): ${pledgeTx}`);
  await waitForTx(d.client, pledgeTx);
  return { txHash, typeArgs };
}

async function finalize(
  d: Devnet,
  campaign: { txHash: string; typeArgs: string },
  seed: SeedCampaign,
  deadline: bigint,
  expected: CampaignStatus.Success | CampaignStatus.Failed
) {
  const txHash = await d.builder.finalizeCampaign(d.creator, {
    campaignTypeArgs: campaign.typeArgs,
    campaignOutPoint: { txHash: campaign.txHash, index: 0 },
    campaignData: {
      creatorLockHash: d.creatorLock.hash(),
      fundingGoal: seed.goal,
      deadlineBlock: deadline,
      totalPledged: seed.pledge,
    },
    newStatus: expected,
  });
  console.log(`  Finalized as ${CampaignStatus[expected]}: ${txHash}`);
  await waitForTx(d.client, txHash);
}

async function main() {
  const d = await setupDevnet();
  const currentBlock = BigInt(await d.client.getTip());
  console.log(`Current block: ${currentBlock}\n`);

  const a: SeedCampaign = {
    title: "CKB Developer Tools Suite",
    description: "Building a comprehensive set of developer tools for the CKB ecosystem, including a visual debugger, transaction inspector, and contract testing framework.",
    goal: 500n * CKB,
    pledge: 100n * CKB,
  };
  const b: SeedCampaign = {
    title: "Nervos Community Meetup Fund",
    description: "Organizing quarterly Nervos community meetups across major cities. Funds cover venue rental, speaker travel, and refreshments.",
    goal: 100n * CKB,
    pledge: 200n * CKB,
  };
  const c: SeedCampaign = {
    title: "Decentralized Social Network on CKB",
    description: "A fully on-chain social network with user-owned data. Posts, follows, and interactions are all stored as CKB cells.",
    goal: 1000n * CKB,
    pledge: 100n * CKB,
  };
  const dd: SeedCampaign = {
    title: "CKB Block Explorer Redesign",
    description: "Redesigning the CKB block explorer with a modern UI, real-time updates, and better cell visualization.",
    goal: 100n * CKB,
    pledge: 150n * CKB,
  };

  // B, C and D share a short deadline so the script waits once
  const shortDeadline = currentBlock + 20n;

  console.log("=== Campaign A: Active campaign (far deadline, has pledge) ===");
  await createWithPledge(d, a, currentBlock + 10000n);

  console.log("\n=== Campaign B: Expired + goal met (needs finalize → Success) ===");
  await createWithPledge(d, b, shortDeadline);

  console.log("\n=== Campaign C: Failed campaign (finalized, pledge ready for refund) ===");
  const campaignC = await createWithPledge(d, c, shortDeadline);

  console.log("\n=== Campaign D: Successful campaign (finalized, pledge ready for release) ===");
  const campaignD = await createWithPledge(d, dd, shortDeadline);

  console.log(`\nWaiting for deadline block ${shortDeadline}...`);
  await waitForBlock(d.client, shortDeadline);
  console.log("  Campaign B expired (not finalized — test this in the UI)");

  await finalize(d, campaignC, c, shortDeadline, CampaignStatus.Failed);
  await finalize(d, campaignD, dd, shortDeadline, CampaignStatus.Success);

  console.log("\n\n========================================");
  console.log("  SEED DATA COMPLETE — 4 campaigns created");
  console.log("========================================");
  console.log("\nTest scenarios in the frontend:");
  console.log("  A: Active — verify the pledge form (100 CKB minimum, cost breakdown)");
  console.log("  B: Expired + funded — click 'Finalize Campaign' (any account)");
  console.log("  C: Failed — click 'Trigger Refund' (any account), then reclaim the receipt deposit as Account #1");
  console.log("  D: Success — click 'Trigger Release' (any account), then reclaim the receipt deposit as Account #1");
  console.log("\nDevnet accounts:");
  console.log(`  #0 (creator): ${await d.creator.getRecommendedAddress()}`);
  console.log(`  #1 (backer):  ${await d.backer.getRecommendedAddress()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
