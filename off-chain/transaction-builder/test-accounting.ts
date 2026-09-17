/**
 * Balance accounting test — where every shannon goes across a campaign's life
 *
 * The other tests check that transactions are accepted or rejected. This one checks the
 * money: for each step it reads every wallet's full balance before and after, computes the
 * exact network fee from the transaction itself (inputs minus outputs), and asserts that
 * the balance changes add up to the shannon.
 *
 *   Success path: create → pledge → finalize → permissionless release (backer triggers)
 *   Failure path: create → pledge → finalize → permissionless refund (creator triggers)
 *
 * "Balance" means every live cell under a wallet's lock, including typed cells such as the
 * receipt. "Spendable" means cells with no type script and no data — what a wallet can
 * actually send. The gap between the two is capacity parked in receipts.
 *
 * Prerequisites:
 *   1. OffCKB devnet running (nvm use v18 && offckb node)
 *   2. All 5 contracts deployed (npx ts-node deploy-contracts.ts)
 *
 * Run with: npx ts-node test-accounting.ts
 */

import * as fs from "fs";
import * as path from "path";
import { ccc } from "@ckb-ccc/core";
import { TransactionBuilder } from "./src";
import type { ContractInfo } from "./src/types";
import { CampaignStatus } from "./src/types";
import { createCkbClient } from "./src/ckbClient";
import { readCampaignStatus } from "./src/serializer";

const rpcUrl = "http://127.0.0.1:8114";
const creatorKey = "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6";
const backerKey = "0x9f315d5a9618a39fdc487c7a67a8581d40b045bd7a42d83648ca80ef3b2cb4a1";

const CKB = BigInt(100000000);

const deployment = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../deployment/deployed-contracts-devnet.json"), "utf-8")
);
const contract = (name: string): ContractInfo => ({ ...deployment[name], hashType: "data2" as const });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`   PASS: ${label}${detail ? ` (${detail})` : ""}`);
    passed++;
  } else {
    console.error(`   FAIL: ${label}${detail ? ` (${detail})` : ""}`);
    failed++;
  }
}

/** Shannons as a signed CKB string with all 8 decimals, so off-by-a-shannon shows up */
function fmt(shannons: bigint): string {
  const sign = shannons < 0n ? "-" : "";
  const abs = shannons < 0n ? -shannons : shannons;
  return `${sign}${abs / CKB}.${(abs % CKB).toString().padStart(8, "0")} CKB`;
}

async function waitForTx(client: ccc.Client, txHash: string, timeout = 90000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const tx = await client.getTransaction(txHash).catch(() => undefined);
    if (tx?.status === "committed") {
      // Give the node's indexer a moment to catch up with the block before balances are read
      await sleep(2500);
      return;
    }
    await sleep(1500);
  }
  throw new Error(`Transaction ${txHash} not confirmed after ${timeout}ms`);
}

async function waitForBlock(client: ccc.Client, target: bigint): Promise<void> {
  while (BigInt(await client.getTip()) <= target) await sleep(2000);
}

interface Wallet {
  total: bigint;
  spendable: bigint;
}

/** Sum every live cell under a lock, straight from the node's indexer */
async function readWallet(client: ccc.Client, lock: ccc.Script): Promise<Wallet> {
  let total = 0n;
  let spendable = 0n;
  for await (const cell of client.findCellsOnChain(
    { script: lock, scriptType: "lock", scriptSearchMode: "exact", withData: true },
    "asc",
    100
  )) {
    const capacity = BigInt(cell.cellOutput.capacity);
    total += capacity;
    if (!cell.cellOutput.type && ccc.bytesFrom(cell.outputData).length === 0) spendable += capacity;
  }
  return { total, spendable };
}

/** Exact fee of a committed transaction: sum of input capacities minus sum of outputs */
async function txFee(client: ccc.Client, txHash: string): Promise<bigint> {
  const tx = (await client.getTransaction(txHash))!.transaction!;
  let inputs = 0n;
  for (const input of tx.inputs) {
    const prev = (await client.getTransaction(input.previousOutput.txHash))!.transaction!;
    inputs += BigInt(prev.outputs[Number(input.previousOutput.index)].capacity);
  }
  const outputs = tx.outputs.reduce((sum, o) => sum + BigInt(o.capacity), 0n);
  return inputs - outputs;
}

async function outputCapacity(client: ccc.Client, txHash: string, index: number): Promise<bigint> {
  return BigInt((await client.getTransaction(txHash))!.transaction!.outputs[index].capacity);
}

async function main() {
  const client = createCkbClient("devnet", rpcUrl);
  const builder = new TransactionBuilder(
    client,
    contract("campaign"),
    contract("campaignLock"),
    contract("pledge"),
    contract("pledgeLock"),
    contract("receipt")
  );

  const creator = new ccc.SignerCkbPrivateKey(client, creatorKey);
  const backer = new ccc.SignerCkbPrivateKey(client, backerKey);
  const creatorLock = (await creator.getAddressObjs())[0].script;
  const backerLock = (await backer.getAddressObjs())[0].script;
  const lockLike = (s: ccc.Script) => ({ codeHash: s.codeHash, hashType: s.hashType, args: s.args });

  const snapshot = async () => ({
    creator: await readWallet(client, creatorLock),
    backer: await readWallet(client, backerLock),
  });

  const pledgeAmount = 150n * CKB;
  const deadline = BigInt(await client.getTip()) + 15n;

  // Two campaigns sharing one deadline: goal 100 CKB succeeds, goal 1000 CKB fails
  const scenarios: Array<{ name: string; goal: bigint; expected: CampaignStatus }> = [
    { name: "success", goal: 100n * CKB, expected: CampaignStatus.Success },
    { name: "failure", goal: 1000n * CKB, expected: CampaignStatus.Failed },
  ];

  const state: Record<string, { campaignTx: string; typeArgs: string; campaignCapacity: bigint; pledgeTx: string; pledgeCapacity: bigint; receiptCapacity: bigint }> = {};

  for (const s of scenarios) {
    // --- Create ---------------------------------------------------------------
    console.log(`\n=== [${s.name}] Create campaign (goal ${fmt(s.goal)}) ===`);
    let before = await snapshot();
    const campaignTx = await builder.createCampaign(creator, {
      creatorLockHash: creatorLock.hash(),
      fundingGoal: s.goal,
      deadlineBlock: deadline,
      title: `Accounting ${s.name}`,
    });
    await waitForTx(client, campaignTx);
    let after = await snapshot();
    const createFee = await txFee(client, campaignTx);
    const campaignCapacity = await outputCapacity(client, campaignTx, 0);
    console.log(`   campaign cell ${fmt(campaignCapacity)}, fee ${fmt(createFee)}`);
    check(
      "creator paid exactly campaign cell + fee",
      before.creator.total - after.creator.total === campaignCapacity + createFee,
      `paid ${fmt(before.creator.total - after.creator.total)}`
    );
    check("backer untouched by campaign creation", before.backer.total === after.backer.total);
    const typeArgs = ccc.hexFrom((await client.getTransaction(campaignTx))!.transaction!.outputs[0].type!.args);

    // --- Pledge ---------------------------------------------------------------
    console.log(`\n=== [${s.name}] Pledge ${fmt(pledgeAmount)} ===`);
    before = await snapshot();
    const pledgeTx = await builder.createPledgeWithReceipt(backer, {
      campaignOutPoint: { txHash: campaignTx, index: 0 },
      campaignTypeArgs: typeArgs,
      deadlineBlock: deadline,
      backerLockHash: backerLock.hash(),
      amount: pledgeAmount,
      campaignId: campaignTx,
    });
    await waitForTx(client, pledgeTx);
    after = await snapshot();

    const pledgeFee = await txFee(client, pledgeTx);
    const pledgeCapacity = await outputCapacity(client, pledgeTx, 1);
    const receiptCapacity = await outputCapacity(client, pledgeTx, 2);
    const campaignAfterPledge = await builder.findLiveCampaignCell(typeArgs);
    console.log(
      `   pledge cell ${fmt(pledgeCapacity)} (= pledge ${fmt(pledgeAmount)} + overhead ${fmt(pledgeCapacity - pledgeAmount)})`
    );
    console.log(`   receipt cell ${fmt(receiptCapacity)}, fee ${fmt(pledgeFee)}`);

    check(
      "backer's spendable balance dropped by pledge cell + receipt cell + fee",
      before.backer.spendable - after.backer.spendable === pledgeCapacity + receiptCapacity + pledgeFee,
      `dropped ${fmt(before.backer.spendable - after.backer.spendable)}`
    );
    check(
      "backer's total balance dropped by pledge cell + fee (receipt stays in the wallet)",
      before.backer.total - after.backer.total === pledgeCapacity + pledgeFee
    );
    check("pledge fee is small (< 0.01 CKB)", pledgeFee > 0n && pledgeFee < CKB / 100n, fmt(pledgeFee));
    check("creator untouched by the pledge", before.creator.total === after.creator.total);
    check(
      "campaign cell capacity unchanged by the pledge",
      BigInt(campaignAfterPledge.cellOutput.capacity) === campaignCapacity
    );

    state[s.name] = { campaignTx, typeArgs, campaignCapacity, pledgeTx, pledgeCapacity, receiptCapacity };
  }

  // --- Finalize both ------------------------------------------------------------
  console.log(`\n=== Waiting for deadline block ${deadline} ===`);
  await waitForBlock(client, deadline);

  const finalized: Record<string, ccc.Cell> = {};
  for (const s of scenarios) {
    const st = state[s.name];
    console.log(`\n=== [${s.name}] Finalize (creator signs) ===`);
    const before = await snapshot();
    const finalizeTx = await builder.finalizeCampaign(creator, {
      campaignTypeArgs: st.typeArgs,
      campaignOutPoint: { txHash: st.campaignTx, index: 0 },
      campaignData: { creatorLockHash: creatorLock.hash(), fundingGoal: s.goal, deadlineBlock: deadline, totalPledged: pledgeAmount },
    });
    await waitForTx(client, finalizeTx);
    const after = await snapshot();
    const fee = await txFee(client, finalizeTx);
    finalized[s.name] = await builder.findLiveCampaignCell(st.typeArgs);

    check(`campaign finalized as ${CampaignStatus[s.expected]}`, readCampaignStatus(ccc.hexFrom(finalized[s.name].outputData)) === s.expected);
    check(
      "creator paid only the finalize fee",
      before.creator.total - after.creator.total === fee,
      fmt(fee)
    );
    check("campaign cell capacity unchanged by finalize", BigInt(finalized[s.name].cellOutput.capacity) === st.campaignCapacity);
    check("backer untouched by finalize", before.backer.total === after.backer.total);
  }

  // --- Success: release, triggered by the backer ------------------------------
  {
    const st = state.success;
    console.log("\n=== [success] Permissionless release (backer triggers) ===");
    const before = await snapshot();
    const releaseTx = await builder.permissionlessRelease(backer, {
      pledgeOutPoint: { txHash: st.pledgeTx, index: 1 },
      pledgeCapacity: st.pledgeCapacity,
      campaignCellDep: { txHash: finalized.success.outPoint.txHash, index: Number(finalized.success.outPoint.index) },
      creatorLockScript: lockLike(creatorLock),
      deadlineBlock: deadline,
    });
    await waitForTx(client, releaseTx);
    const after = await snapshot();
    const fee = await txFee(client, releaseTx);

    console.log(`   creator received ${fmt(after.creator.total - before.creator.total)}, fee ${fmt(fee)} (taken from the pledge)`);
    check(
      "creator received the whole pledge cell minus the fee",
      after.creator.total - before.creator.total === st.pledgeCapacity - fee
    );
    check("release fee is within the pledge lock's 1 CKB cap", fee > 0n && fee <= CKB, fmt(fee));
    check("triggering wallet (backer) paid nothing to trigger", before.backer.total === after.backer.total);
    console.log(
      `   NOTE: creator got ${fmt(st.pledgeCapacity - fee)} for a ${fmt(pledgeAmount)} pledge — ` +
        `the ${fmt(st.pledgeCapacity - pledgeAmount)} cell overhead went to the creator too`
    );
  }

  // --- Failure: refund, triggered by the creator ------------------------------
  {
    const st = state.failure;
    console.log("\n=== [failure] Permissionless refund (creator triggers) ===");
    const before = await snapshot();
    const refundTx = await builder.permissionlessRefund(creator, {
      pledgeOutPoint: { txHash: st.pledgeTx, index: 1 },
      pledgeCapacity: st.pledgeCapacity,
      campaignCellDep: { txHash: finalized.failure.outPoint.txHash, index: Number(finalized.failure.outPoint.index) },
      backerLockScript: lockLike(backerLock),
      deadlineBlock: deadline,
    });
    await waitForTx(client, refundTx);
    const after = await snapshot();
    const fee = await txFee(client, refundTx);

    console.log(`   backer received ${fmt(after.backer.total - before.backer.total)}, fee ${fmt(fee)} (taken from the pledge)`);
    check(
      "backer got the whole pledge cell back minus the fee",
      after.backer.total - before.backer.total === st.pledgeCapacity - fee
    );
    check("triggering wallet (creator) paid nothing to trigger", before.creator.total === after.creator.total);
  }

  // --- Receipts: can the backer get that capacity back? -------------------------
  for (const s of scenarios) {
    const st = state[s.name];
    console.log(`\n=== [${s.name}] Backer tries to reclaim the ${fmt(st.receiptCapacity)} receipt ===`);
    try {
      const tx = ccc.Transaction.from({
        inputs: [{ previousOutput: { txHash: st.pledgeTx, index: 2 } }],
        outputs: [{ capacity: st.receiptCapacity, lock: backerLock }],
        outputsData: ["0x"],
        cellDeps: [{ outPoint: { txHash: deployment.receipt.txHash, index: deployment.receipt.index }, depType: "code" }],
      });
      await tx.addCellDepsOfKnownScripts(client, ccc.KnownScript.Secp256k1Blake160);
      // Pay the fee out of the receipt itself, so no other backer cell is needed
      await tx.completeFeeChangeToOutput(backer, 0, 2000);
      const hash = await backer.sendTransaction(tx);
      await waitForTx(client, hash);
      console.log(`   receipt reclaimed: ${hash}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`   receipt NOT reclaimable: ${message.slice(0, 200).replace(/\s+/g, " ")}`);
    }
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
