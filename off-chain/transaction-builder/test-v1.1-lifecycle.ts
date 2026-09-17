/**
 * v1.1 Lifecycle Integration Tests (on the v1.2 pledge path)
 *
 * Tests the trustless fund distribution flow:
 * - Pledge with receipt (campaign accumulator + pledge + receipt in one transaction)
 * - Permissionless release (third party triggers release to the creator)
 * - Permissionless refund (backer reclaims CKB after failure)
 * - Pledge merging (combine N pledge cells into 1)
 *
 * Scenarios:
 *   1. Success: create campaign -> pledge with receipt -> finalize success -> third-party release
 *   2. Failure: create campaign -> pledge with receipt -> finalize failure -> permissionless refund
 *   3. Merge:  create campaign -> 3 pledges -> merge -> release from merged cell -> reclaim receipts
 *
 * A pledge transaction outputs [campaign, pledge, receipt]; the pledge is output 1.
 *
 * Prerequisites:
 *   1. OffCKB devnet running (nvm use v18 && offckb node)
 *   2. All 5 contracts deployed (npx ts-node deploy-contracts.ts)
 *
 * Run with: npx ts-node test-v1.1-lifecycle.ts
 */

import { ccc } from "@ckb-ccc/core";
import { CampaignStatus } from "./src/types";
import { readCampaignStatus, readPledgeAmount, serializePledgeLockArgs } from "./src/serializer";
import {
  CKB,
  Checks,
  setupDevnet,
  waitForTx,
  waitForBlock,
  campaignTypeArgs,
  outputOf,
  lockLike,
} from "./test-helpers";

const checks = new Checks();

type Devnet = Awaited<ReturnType<typeof setupDevnet>>;

async function paidTo(client: ccc.Client, txHash: string, lock: ccc.Script): Promise<bigint> {
  const tx = (await client.getTransaction(txHash))!.transaction!;
  return tx.outputs.filter((o) => o.lock.eq(lock)).reduce((sum, o) => sum + o.capacity, 0n);
}

async function createCampaign(d: Devnet, goal: bigint, deadline: bigint, title: string) {
  const txHash = await d.builder.createCampaign(d.creator, {
    creatorLockHash: d.creatorLock.hash(),
    fundingGoal: goal,
    deadlineBlock: deadline,
    title,
  });
  await waitForTx(d.client, txHash);
  return { txHash, typeArgs: await campaignTypeArgs(d.client, txHash) };
}

async function pledge(d: Devnet, campaign: { txHash: string; typeArgs: string }, deadline: bigint, amount: bigint) {
  const txHash = await d.builder.createPledgeWithReceipt(d.backer, {
    campaignOutPoint: { txHash: campaign.txHash, index: 0 },
    campaignTypeArgs: campaign.typeArgs,
    deadlineBlock: deadline,
    backerLockHash: d.backerLock.hash(),
    amount,
    campaignId: campaign.txHash,
  });
  await waitForTx(d.client, txHash);
  return txHash;
}

async function finalize(
  d: Devnet,
  campaign: { txHash: string; typeArgs: string },
  goal: bigint,
  deadline: bigint,
  totalPledged: bigint,
  expected: CampaignStatus.Success | CampaignStatus.Failed
) {
  await waitForBlock(d.client, deadline);
  const txHash = await d.builder.finalizeCampaign(d.creator, {
    campaignTypeArgs: campaign.typeArgs,
    campaignOutPoint: { txHash: campaign.txHash, index: 0 },
    campaignData: { creatorLockHash: d.creatorLock.hash(), fundingGoal: goal, deadlineBlock: deadline, totalPledged },
    newStatus: expected,
  });
  await waitForTx(d.client, txHash);
  const cell = await d.builder.findLiveCampaignCell(campaign.typeArgs);
  checks.check(`campaign finalized as ${CampaignStatus[expected]}`, readCampaignStatus(ccc.hexFrom(cell.outputData)) === expected);
  return { txHash: cell.outPoint.txHash, index: Number(cell.outPoint.index) };
}

// ---------------------------------------------------------------------------
// Scenario 1: Success lifecycle with permissionless release
// ---------------------------------------------------------------------------

async function testSuccessWithPermissionlessRelease(d: Devnet) {
  console.log("\n=== SCENARIO 1: Success lifecycle with permissionless release ===");
  const goal = 100n * CKB;
  const amount = 150n * CKB;
  const deadline = BigInt(await d.client.getTip()) + 12n;
  const campaign = await createCampaign(d, goal, deadline, "v1.1: success");

  const pledgeTx = await pledge(d, campaign, deadline, amount);
  const pledgeCell = await outputOf(d.client, pledgeTx, 1);
  const campaignDep = await finalize(d, campaign, goal, deadline, amount, CampaignStatus.Success);

  const releaseTx = await d.builder.permissionlessRelease(d.trigger, {
    pledgeOutPoint: { txHash: pledgeTx, index: 1 },
    pledgeCapacity: pledgeCell.output.capacity,
    campaignCellDep: campaignDep,
    creatorLockScript: lockLike(d.creatorLock),
    deadlineBlock: deadline,
  });
  await waitForTx(d.client, releaseTx);

  checks.check("creator received exactly the pledged amount", (await paidTo(d.client, releaseTx, d.creatorLock)) === amount);
  const overhead = pledgeCell.output.capacity - amount;
  const backerBack = await paidTo(d.client, releaseTx, d.backerLock);
  checks.check("backer got the cell overhead back, less at most 1 CKB", backerBack <= overhead && overhead - backerBack <= CKB);
  checks.check("third-party trigger received nothing", (await paidTo(d.client, releaseTx, d.triggerLock)) === 0n);
}

// ---------------------------------------------------------------------------
// Scenario 2: Failure lifecycle with permissionless refund
// ---------------------------------------------------------------------------

async function testFailureWithPermissionlessRefund(d: Devnet) {
  console.log("\n=== SCENARIO 2: Failure lifecycle with permissionless refund ===");
  const goal = 1000n * CKB;
  const amount = 100n * CKB;
  const deadline = BigInt(await d.client.getTip()) + 12n;
  const campaign = await createCampaign(d, goal, deadline, "v1.1: failure");

  const pledgeTx = await pledge(d, campaign, deadline, amount);
  const pledgeCell = await outputOf(d.client, pledgeTx, 1);
  const campaignDep = await finalize(d, campaign, goal, deadline, amount, CampaignStatus.Failed);

  const refundTx = await d.builder.permissionlessRefund(d.backer, {
    pledgeOutPoint: { txHash: pledgeTx, index: 1 },
    pledgeCapacity: pledgeCell.output.capacity,
    campaignCellDep: campaignDep,
    backerLockScript: lockLike(d.backerLock),
    deadlineBlock: deadline,
  });
  await waitForTx(d.client, refundTx);

  const refunded = await paidTo(d.client, refundTx, d.backerLock);
  checks.check(
    "backer got the whole pledge cell back, less at most 1 CKB",
    refunded <= pledgeCell.output.capacity && pledgeCell.output.capacity - refunded <= CKB
  );
  checks.check("creator received nothing", (await paidTo(d.client, refundTx, d.creatorLock)) === 0n);
}

// ---------------------------------------------------------------------------
// Scenario 3: Merge pledges then release
// ---------------------------------------------------------------------------

async function testMergeThenRelease(d: Devnet) {
  console.log("\n=== SCENARIO 3: Merge pledges then release ===");
  const goal = 100n * CKB;
  const amount = 100n * CKB;
  // Three pledges and a merge have to land before the deadline
  const deadline = BigInt(await d.client.getTip()) + 40n;
  const campaign = await createCampaign(d, goal, deadline, "v1.1: merge");
  const campaignTypeScriptHash = (await d.builder.findLiveCampaignCell(campaign.typeArgs)).cellOutput.type!.hash();

  const pledgeTxs: string[] = [];
  for (let i = 0; i < 3; i++) pledgeTxs.push(await pledge(d, campaign, deadline, amount));

  const pledgeCells = await Promise.all(pledgeTxs.map((tx) => outputOf(d.client, tx, 1)));
  const pledgeCapacities = pledgeCells.map((c) => c.output.capacity);
  const totalCapacity = pledgeCapacities.reduce((sum, c) => sum + c, 0n);
  const totalAmount = amount * 3n;

  const mergeTx = await d.builder.mergeContributions(d.backer, {
    pledgeOutPoints: pledgeTxs.map((txHash) => ({ txHash, index: 1 })),
    pledgeCapacities,
    campaignId: campaign.txHash,
    backerLockHash: d.backerLock.hash(),
    pledgeLockArgs: serializePledgeLockArgs(campaignTypeScriptHash, deadline, d.backerLock.hash()),
    totalAmount,
  });
  await waitForTx(d.client, mergeTx);

  const merged = await outputOf(d.client, mergeTx, 0);
  checks.check("merged cell holds the sum of the input capacities", merged.output.capacity === totalCapacity);
  checks.check("merged cell records the sum of the amounts", readPledgeAmount(merged.data) === totalAmount);
  checks.check(
    "merged cell keeps the inputs' pledge type script",
    !!merged.output.type && merged.output.type.eq(pledgeCells[0].output.type!)
  );
  checks.check("merged cell keeps the inputs' pledge lock", merged.output.lock.eq(pledgeCells[0].output.lock));

  const campaignDep = await finalize(d, campaign, goal, deadline, totalAmount, CampaignStatus.Success);

  const releaseTx = await d.builder.permissionlessRelease(d.trigger, {
    pledgeOutPoint: { txHash: mergeTx, index: 0 },
    pledgeCapacity: merged.output.capacity,
    campaignCellDep: campaignDep,
    creatorLockScript: lockLike(d.creatorLock),
    deadlineBlock: deadline,
  });
  await waitForTx(d.client, releaseTx);

  checks.check("creator received exactly the merged amount", (await paidTo(d.client, releaseTx, d.creatorLock)) === totalAmount);
  const overhead = merged.output.capacity - totalAmount;
  const backerBack = await paidTo(d.client, releaseTx, d.backerLock);
  checks.check("backer got all three overheads back, less at most 1 CKB", backerBack <= overhead && overhead - backerBack <= CKB);

  for (const [i, pledgeTx] of pledgeTxs.entries()) {
    const receipt = await outputOf(d.client, pledgeTx, 2);
    const reclaimTx = await d.builder.reclaimReceipt(d.backer, {
      receiptOutPoint: { txHash: pledgeTx, index: 2 },
      campaignCellDep: campaignDep,
    });
    await waitForTx(d.client, reclaimTx);
    const back = await paidTo(d.client, reclaimTx, d.backerLock);
    checks.check(
      `receipt #${i + 1} reclaimed after the merged release`,
      back < receipt.output.capacity && receipt.output.capacity - back < CKB / 100n
    );
  }
}

async function main() {
  console.log("=== CKB Kickstarter v1.1 lifecycle integration tests ===");
  const d = await setupDevnet();
  await testSuccessWithPermissionlessRelease(d);
  await testFailureWithPermissionlessRefund(d);
  await testMergeThenRelease(d);
  checks.finish("v1.1 lifecycle");
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
