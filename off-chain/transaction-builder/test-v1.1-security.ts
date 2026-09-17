/**
 * v1.1 Security Attack Scenario Tests
 *
 * Validates that the hardened contracts (Officeyutong review fixes) REJECT malicious
 * transactions. Every attack is submitted to the chain and must fail with the specific
 * script and error code below; a local builder error or any other rejection is a FAIL.
 *
 * Attack scenarios:
 *   1. Fail-safe backdoor: refund a Success campaign's pledge without the campaign cell_dep
 *      -> pledge-lock ERROR_CAMPAIGN_CELL_DEP_MISSING (21)
 *   2. Campaign destruction: destroy a Success campaign (paying the creator) within the
 *      grace period -> campaign type ERROR_DESTRUCTION_NOT_ALLOWED (13)
 *   3. Premature finalization: finalize a funded campaign with a mature since below the
 *      deadline -> campaign-lock ERROR_SINCE_BELOW_DEADLINE (13)
 *
 * Prerequisites:
 *   1. OffCKB devnet running (nvm use v18 && offckb node)
 *   2. All 5 contracts deployed (npx ts-node deploy-contracts.ts)
 *
 * Run with: npx ts-node test-v1.1-security.ts
 */

import { ccc } from "@ckb-ccc/core";
import { CampaignStatus } from "./src/types";
import { withCampaignStatus } from "./src/serializer";
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

/** Create a campaign with goal 100 CKB and a 150 CKB pledge, optionally finalized */
async function setupFundedCampaign(d: Devnet, blocksToDeadline: bigint, finalize: boolean) {
  const goal = 100n * CKB;
  const amount = 150n * CKB;
  const deadline = BigInt(await d.client.getTip()) + blocksToDeadline;

  const campaignTx = await d.builder.createCampaign(d.creator, {
    creatorLockHash: d.creatorLock.hash(),
    fundingGoal: goal,
    deadlineBlock: deadline,
    title: "Security test campaign",
  });
  await waitForTx(d.client, campaignTx);
  const typeArgs = await campaignTypeArgs(d.client, campaignTx);

  const pledgeTx = await d.builder.createPledgeWithReceipt(d.backer, {
    campaignOutPoint: { txHash: campaignTx, index: 0 },
    campaignTypeArgs: typeArgs,
    deadlineBlock: deadline,
    backerLockHash: d.backerLock.hash(),
    amount,
    campaignId: campaignTx,
  });
  await waitForTx(d.client, pledgeTx);

  if (finalize) {
    await waitForBlock(d.client, deadline);
    const finalizeTx = await d.builder.finalizeCampaign(d.creator, {
      campaignTypeArgs: typeArgs,
      campaignOutPoint: { txHash: campaignTx, index: 0 },
      campaignData: { creatorLockHash: d.creatorLock.hash(), fundingGoal: goal, deadlineBlock: deadline, totalPledged: amount },
      newStatus: CampaignStatus.Success,
    });
    await waitForTx(d.client, finalizeTx);
  }

  return {
    deadline,
    pledgeTx,
    pledgeCapacity: (await outputOf(d.client, pledgeTx, 1)).output.capacity,
    campaignCell: await d.builder.findLiveCampaignCell(typeArgs),
  };
}

// ---------------------------------------------------------------------------
// Attack 1: Fail-safe backdoor — refund without campaign cell_dep
// ---------------------------------------------------------------------------

async function attackFailSafeBackdoor(d: Devnet) {
  console.log("\n=== ATTACK 1: Fail-safe backdoor (refund without campaign cell_dep) ===");
  const setup = await setupFundedCampaign(d, 12n, true);

  await checks.expectScriptRejection(
    "refund of a Success campaign's pledge without the campaign cell_dep is rejected",
    "Inputs[0].Lock",
    21,
    () =>
      d.builder.permissionlessRefund(d.backer, {
        pledgeOutPoint: { txHash: setup.pledgeTx, index: 1 },
        pledgeCapacity: setup.pledgeCapacity,
        // campaignCellDep intentionally omitted: this was the backdoor
        backerLockScript: lockLike(d.backerLock),
        deadlineBlock: setup.deadline,
      })
  );
}

// ---------------------------------------------------------------------------
// Attack 2: Campaign destruction — destroy a Success campaign within the grace period
// ---------------------------------------------------------------------------

async function attackCampaignDestruction(d: Devnet) {
  console.log("\n=== ATTACK 2: Destroy a Success campaign within the grace period ===");
  const setup = await setupFundedCampaign(d, 12n, true);
  const cell = setup.campaignCell;

  // Everything the builder's destroyCampaign leaves out: the campaign-lock dep and a since
  // at the deadline, so the lock passes and only the grace period can stop it. The capacity
  // goes to the creator, so the payout check passes too.
  await checks.expectScriptRejection(
    "destroying a Success campaign before the grace period is rejected",
    "Inputs[0].Type",
    13,
    async () => {
      const tx = ccc.Transaction.from({
        inputs: [{ previousOutput: cell.outPoint, since: setup.deadline }],
        outputs: [{ capacity: cell.cellOutput.capacity - 100000n, lock: d.creatorLock }],
        outputsData: ["0x"],
        cellDeps: [d.contracts.campaignLock, d.contracts.campaign].map((c) => ({
          outPoint: { txHash: c.txHash, index: c.index },
          depType: "code" as const,
        })),
      });
      tx.witnesses.push("0x");
      return d.creator.sendTransaction(tx);
    }
  );
}

// ---------------------------------------------------------------------------
// Attack 3: Premature finalization — finalize before the deadline
// ---------------------------------------------------------------------------

async function attackPrematureFinalization(d: Devnet) {
  console.log("\n=== ATTACK 3: Premature finalization (before deadline) ===");
  // Funded, so Success would be justified: only the deadline can stop it
  const setup = await setupFundedCampaign(d, 10000n, false);
  const cell = setup.campaignCell;

  await checks.expectScriptRejection(
    "finalizing with a since below the deadline is rejected by campaign-lock",
    "Inputs[0].Lock",
    13,
    async () => {
      // The builder always uses since = deadline, which the node would refuse as immature
      // before any script runs. A mature since below the deadline reaches the lock script.
      const since = BigInt(await d.client.getTip()) - 1n;
      const tx = ccc.Transaction.from({
        inputs: [{ previousOutput: cell.outPoint, since }],
        outputs: [{ capacity: cell.cellOutput.capacity, lock: cell.cellOutput.lock, type: cell.cellOutput.type }],
        outputsData: [withCampaignStatus(ccc.hexFrom(cell.outputData), CampaignStatus.Success)],
        cellDeps: [d.contracts.campaignLock, d.contracts.campaign].map((c) => ({
          outPoint: { txHash: c.txHash, index: c.index },
          depType: "code" as const,
        })),
      });
      tx.witnesses.push("0x");
      await tx.completeFeeBy(d.creator, 2000);
      return d.creator.sendTransaction(tx);
    }
  );
}

async function main() {
  console.log("=== CKB Kickstarter v1.1 security attack tests ===");
  const d = await setupDevnet();
  await attackFailSafeBackdoor(d);
  await attackCampaignDestruction(d);
  await attackPrematureFinalization(d);
  checks.finish("Security");
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
