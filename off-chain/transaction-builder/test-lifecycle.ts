/**
 * Integration test for the full campaign lifecycle (v1.2 pledge path)
 *
 *   1. Success: create -> pledge with receipt -> finalize -> permissionless release -> reclaim receipt
 *   2. Failure: create -> pledge with receipt -> finalize -> permissionless refund -> reclaim receipt
 *   3. Non-creator finalization: premature finalize rejected by campaign-lock, finalize after
 *      the deadline by a non-creator, creator self-pledge released, double finalization rejected
 *   4. Anyone finalizes a failed campaign and a third party triggers the refund
 *
 * A pledge transaction outputs [campaign, pledge, receipt]; the pledge is output 1.
 *
 * Prerequisites:
 *   1. OffCKB devnet running (nvm use v18 && offckb node)
 *   2. All 5 contracts deployed (npx ts-node deploy-contracts.ts)
 *
 * Run with: npx ts-node test-lifecycle.ts
 */

import { ccc } from "@ckb-ccc/core";
import { CampaignStatus } from "./src/types";
import { readCampaignStatus, readTotalPledged, readPledgeAmount, withCampaignStatus } from "./src/serializer";
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

/** Total capacity a transaction's outputs send to `lock` */
async function paidTo(client: ccc.Client, txHash: string, lock: ccc.Script): Promise<bigint> {
  const tx = (await client.getTransaction(txHash))!.transaction!;
  return tx.outputs.filter((o) => o.lock.eq(lock)).reduce((sum, o) => sum + o.capacity, 0n);
}

/** Create a campaign and return its creation tx hash and type args */
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

async function pledge(d: Devnet, signer: ccc.Signer, campaign: { txHash: string; typeArgs: string }, deadline: bigint, amount: bigint) {
  const backerLockHash = (await signer.getAddressObjs())[0].script.hash();
  const txHash = await d.builder.createPledgeWithReceipt(signer, {
    campaignOutPoint: { txHash: campaign.txHash, index: 0 },
    campaignTypeArgs: campaign.typeArgs,
    deadlineBlock: deadline,
    backerLockHash,
    amount,
    campaignId: campaign.txHash,
  });
  await waitForTx(d.client, txHash);
  return txHash;
}

async function finalize(
  d: Devnet,
  signer: ccc.Signer,
  campaign: { txHash: string; typeArgs: string },
  goal: bigint,
  deadline: bigint,
  totalPledged: bigint,
  expected: CampaignStatus.Success | CampaignStatus.Failed
) {
  const txHash = await d.builder.finalizeCampaign(signer, {
    campaignTypeArgs: campaign.typeArgs,
    campaignOutPoint: { txHash: campaign.txHash, index: 0 },
    campaignData: { creatorLockHash: d.creatorLock.hash(), fundingGoal: goal, deadlineBlock: deadline, totalPledged },
    newStatus: expected,
  });
  await waitForTx(d.client, txHash);
  const cell = await d.builder.findLiveCampaignCell(campaign.typeArgs);
  const data = ccc.hexFrom(cell.outputData);
  checks.check(`campaign finalized as ${CampaignStatus[expected]}`, readCampaignStatus(data) === expected);
  checks.check("total_pledged carried through finalization", readTotalPledged(data) === totalPledged);
  return cell;
}

async function reclaim(d: Devnet, pledgeTxHash: string, finalized: ccc.Cell) {
  const receipt = await outputOf(d.client, pledgeTxHash, 2);
  const txHash = await d.builder.reclaimReceipt(d.backer, {
    receiptOutPoint: { txHash: pledgeTxHash, index: 2 },
    campaignCellDep: { txHash: finalized.outPoint.txHash, index: Number(finalized.outPoint.index) },
  });
  await waitForTx(d.client, txHash);
  const back = await paidTo(d.client, txHash, d.backerLock);
  checks.check(
    "backer reclaimed the receipt deposit, less a small fee",
    back < receipt.output.capacity && receipt.output.capacity - back < CKB / 100n,
    `${Number(back) / 1e8} CKB of ${Number(receipt.output.capacity) / 1e8}`
  );
  const live = await d.client.getCellLive({ txHash: pledgeTxHash, index: 2 }, false);
  checks.check("receipt cell is spent", !live);
}

/**
 * Hand-built finalization, so it reaches the chain: the builder refuses a status that
 * contradicts the accumulator and always uses since = deadline.
 */
async function submitFinalizeTx(d: Devnet, signer: ccc.Signer, campaignCell: ccc.Cell, status: CampaignStatus, since: bigint) {
  const tx = ccc.Transaction.from({
    inputs: [{ previousOutput: campaignCell.outPoint, since }],
    outputs: [{ capacity: campaignCell.cellOutput.capacity, lock: campaignCell.cellOutput.lock, type: campaignCell.cellOutput.type }],
    outputsData: [withCampaignStatus(ccc.hexFrom(campaignCell.outputData), status)],
    cellDeps: [d.contracts.campaignLock, d.contracts.campaign].map((c) => ({
      outPoint: { txHash: c.txHash, index: c.index },
      depType: "code" as const,
    })),
  });
  tx.witnesses.push("0x");
  await tx.completeFeeBy(signer, 2000);
  return signer.sendTransaction(tx);
}

async function testSuccessLifecycle(d: Devnet) {
  console.log("\n=== TEST 1: Success lifecycle ===");
  const goal = 100n * CKB;
  const amount = 150n * CKB;
  const deadline = BigInt(await d.client.getTip()) + 12n;
  const campaign = await createCampaign(d, goal, deadline, "Lifecycle: success");

  const pledgeTx = await pledge(d, d.backer, campaign, deadline, amount);
  const pledgeCell = await outputOf(d.client, pledgeTx, 1);
  checks.check("pledge cell records the amount", readPledgeAmount(pledgeCell.data) === amount);

  await waitForBlock(d.client, deadline);
  const finalized = await finalize(d, d.creator, campaign, goal, deadline, amount, CampaignStatus.Success);

  const releaseTx = await d.builder.permissionlessRelease(d.backer, {
    pledgeOutPoint: { txHash: pledgeTx, index: 1 },
    pledgeCapacity: pledgeCell.output.capacity,
    campaignCellDep: { txHash: finalized.outPoint.txHash, index: Number(finalized.outPoint.index) },
    creatorLockScript: lockLike(d.creatorLock),
    deadlineBlock: deadline,
  });
  await waitForTx(d.client, releaseTx);
  checks.check("creator received exactly the pledged amount", (await paidTo(d.client, releaseTx, d.creatorLock)) === amount);
  const overhead = pledgeCell.output.capacity - amount;
  const backerBack = await paidTo(d.client, releaseTx, d.backerLock);
  checks.check("backer got the cell overhead back, less at most 1 CKB", backerBack <= overhead && overhead - backerBack <= CKB);

  await reclaim(d, pledgeTx, finalized);
}

async function testFailureLifecycle(d: Devnet) {
  console.log("\n=== TEST 2: Failure lifecycle ===");
  const goal = 1000n * CKB;
  const amount = 100n * CKB;
  const deadline = BigInt(await d.client.getTip()) + 12n;
  const campaign = await createCampaign(d, goal, deadline, "Lifecycle: failure");

  const pledgeTx = await pledge(d, d.backer, campaign, deadline, amount);
  const pledgeCell = await outputOf(d.client, pledgeTx, 1);

  await waitForBlock(d.client, deadline);
  const finalized = await finalize(d, d.creator, campaign, goal, deadline, amount, CampaignStatus.Failed);

  const refundTx = await d.builder.permissionlessRefund(d.backer, {
    pledgeOutPoint: { txHash: pledgeTx, index: 1 },
    pledgeCapacity: pledgeCell.output.capacity,
    campaignCellDep: { txHash: finalized.outPoint.txHash, index: Number(finalized.outPoint.index) },
    backerLockScript: lockLike(d.backerLock),
    deadlineBlock: deadline,
  });
  await waitForTx(d.client, refundTx);
  const refunded = await paidTo(d.client, refundTx, d.backerLock);
  checks.check(
    "backer got the whole pledge cell back, less at most 1 CKB",
    refunded <= pledgeCell.output.capacity && pledgeCell.output.capacity - refunded <= CKB
  );
  checks.check("creator received nothing from the refund", (await paidTo(d.client, refundTx, d.creatorLock)) === 0n);

  await reclaim(d, pledgeTx, finalized);
}

async function testNonCreatorFinalization(d: Devnet) {
  console.log("\n=== TEST 3: Non-creator permissionless finalization ===");
  const goal = 100n * CKB;
  const amount = 150n * CKB;
  const deadline = BigInt(await d.client.getTip()) + 20n;
  const campaign = await createCampaign(d, goal, deadline, "Lifecycle: non-creator finalization");

  // The creator backs their own campaign: release pays both shares into one output
  const pledgeTx = await pledge(d, d.creator, campaign, deadline, amount);
  const pledgeCell = await outputOf(d.client, pledgeTx, 1);

  // A mature since below the deadline: only the campaign-lock deadline gate can stop it
  const early = BigInt(await d.client.getTip()) - 1n;
  await checks.expectScriptRejection(
    "finalization before the deadline is rejected by campaign-lock",
    "Inputs[0].Lock",
    13,
    async () => submitFinalizeTx(d, d.backer, await d.builder.findLiveCampaignCell(campaign.typeArgs), CampaignStatus.Success, early)
  );

  await waitForBlock(d.client, deadline);
  const finalized = await finalize(d, d.backer, campaign, goal, deadline, amount, CampaignStatus.Success);

  const releaseTx = await d.builder.permissionlessRelease(d.backer, {
    pledgeOutPoint: { txHash: pledgeTx, index: 1 },
    pledgeCapacity: pledgeCell.output.capacity,
    campaignCellDep: { txHash: finalized.outPoint.txHash, index: Number(finalized.outPoint.index) },
    creatorLockScript: lockLike(d.creatorLock),
    deadlineBlock: deadline,
  });
  await waitForTx(d.client, releaseTx);
  const toCreator = await paidTo(d.client, releaseTx, d.creatorLock);
  checks.check(
    "self-pledge release pays the whole cell to the creator, less at most 1 CKB",
    toCreator <= pledgeCell.output.capacity && pledgeCell.output.capacity - toCreator <= CKB
  );

  await checks.expectScriptRejection(
    "a finalized campaign cannot be finalized again",
    "Inputs[0].Type",
    10,
    async () => submitFinalizeTx(d, d.creator, await d.builder.findLiveCampaignCell(campaign.typeArgs), CampaignStatus.Failed, deadline)
  );
}

async function testThirdPartyRefund(d: Devnet) {
  console.log("\n=== TEST 4: Anyone finalizes, a third party triggers the refund ===");
  const goal = 10000n * CKB;
  const amount = 100n * CKB;
  const deadline = BigInt(await d.client.getTip()) + 12n;
  const campaign = await createCampaign(d, goal, deadline, "Lifecycle: third-party refund");

  const pledgeTx = await pledge(d, d.backer, campaign, deadline, amount);
  const pledgeCell = await outputOf(d.client, pledgeTx, 1);

  await waitForBlock(d.client, deadline);
  const finalized = await finalize(d, d.trigger, campaign, goal, deadline, amount, CampaignStatus.Failed);

  const refundTx = await d.builder.permissionlessRefund(d.trigger, {
    pledgeOutPoint: { txHash: pledgeTx, index: 1 },
    pledgeCapacity: pledgeCell.output.capacity,
    campaignCellDep: { txHash: finalized.outPoint.txHash, index: Number(finalized.outPoint.index) },
    backerLockScript: lockLike(d.backerLock),
    deadlineBlock: deadline,
  });
  await waitForTx(d.client, refundTx);
  const refunded = await paidTo(d.client, refundTx, d.backerLock);
  checks.check(
    "refund triggered by a third party still goes to the backer",
    refunded <= pledgeCell.output.capacity && pledgeCell.output.capacity - refunded <= CKB
  );
  checks.check("triggering wallet received nothing", (await paidTo(d.client, refundTx, d.triggerLock)) === 0n);
}

async function main() {
  console.log("=== CKB Kickstarter lifecycle integration tests ===");
  const d = await setupDevnet();
  await testSuccessLifecycle(d);
  await testFailureLifecycle(d);
  await testNonCreatorFinalization(d);
  await testThirdPartyRefund(d);
  checks.finish("Lifecycle");
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
