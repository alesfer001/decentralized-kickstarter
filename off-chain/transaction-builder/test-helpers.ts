/**
 * Shared helpers for the devnet integration scripts.
 *
 * Contracts are always read from deployment/deployed-contracts-devnet.json, so the scripts
 * follow every redeploy without edits.
 */

import * as fs from "fs";
import * as path from "path";
import { ccc } from "@ckb-ccc/core";
import { TransactionBuilder } from "./src";
import type { ContractInfo } from "./src/types";
import { createCkbClient } from "./src/ckbClient";

export const RPC_URL = "http://127.0.0.1:8114";
export const CKB = BigInt(100000000);

/** OffCKB devnet accounts #0, #1 and #3 (publicly known keys, devnet only). The trigger is
 *  deliberately not account #2, which the local indexer uses as its bot key. */
export const CREATOR_KEY = "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6";
export const BACKER_KEY = "0x9f315d5a9618a39fdc487c7a67a8581d40b045bd7a42d83648ca80ef3b2cb4a1";
export const TRIGGER_KEY = "0xf4a1fc19468b51ba9d1f0f5441fa3f4d91e625b2af105e1e37cc54bf9b19c0a1";

export interface DevnetContracts {
  campaign: ContractInfo;
  campaignLock: ContractInfo;
  pledge: ContractInfo;
  pledgeLock: ContractInfo;
  receipt: ContractInfo;
}

/** Load the five contracts from the devnet deployment artifact */
export function loadDevnetContracts(): DevnetContracts {
  const deploymentPath = path.resolve(__dirname, "../../deployment/deployed-contracts-devnet.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const contract = (name: string): ContractInfo => ({
    codeHash: deployment[name].codeHash,
    hashType: "data2",
    txHash: deployment[name].txHash,
    index: deployment[name].index,
  });
  return {
    campaign: contract("campaign"),
    campaignLock: contract("campaignLock"),
    pledge: contract("pledge"),
    pledgeLock: contract("pledgeLock"),
    receipt: contract("receipt"),
  };
}

/** Client, builder and the three devnet signers with their lock scripts */
export async function setupDevnet() {
  const contracts = loadDevnetContracts();
  const client = createCkbClient("devnet", RPC_URL);
  const builder = new TransactionBuilder(
    client,
    contracts.campaign,
    contracts.campaignLock,
    contracts.pledge,
    contracts.pledgeLock,
    contracts.receipt
  );
  const creator = new ccc.SignerCkbPrivateKey(client, CREATOR_KEY);
  const backer = new ccc.SignerCkbPrivateKey(client, BACKER_KEY);
  const trigger = new ccc.SignerCkbPrivateKey(client, TRIGGER_KEY);
  const creatorLock = (await creator.getAddressObjs())[0].script;
  const backerLock = (await backer.getAddressObjs())[0].script;
  const triggerLock = (await trigger.getAddressObjs())[0].script;
  return { contracts, client, builder, creator, backer, trigger, creatorLock, backerLock, triggerLock };
}

/** All five contract code cells as cell deps */
export function allCellDeps(contracts: DevnetContracts) {
  return [contracts.pledge, contracts.pledgeLock, contracts.receipt, contracts.campaign, contracts.campaignLock].map(
    (c) => ({ outPoint: { txHash: c.txHash, index: c.index }, depType: "code" as const })
  );
}

export function lockLike(script: ccc.Script) {
  return { codeHash: script.codeHash, hashType: script.hashType, args: script.args };
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForTx(client: ccc.Client, txHash: string, timeout = 90000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const tx = await client.getTransaction(txHash).catch(() => undefined);
    if (tx?.status === "committed") {
      // Let the node's indexer catch up before cells are looked up
      await sleep(2000);
      return;
    }
    await sleep(1500);
  }
  throw new Error(`Transaction ${txHash} not confirmed after ${timeout}ms`);
}

/** Wait until the tip is past `target`, so a since of `target` is mature */
export async function waitForBlock(client: ccc.Client, target: bigint): Promise<void> {
  while (BigInt(await client.getTip()) <= target) await sleep(2000);
}

/** Type args of the campaign created by `campaignTxHash` (its stable identity) */
export async function campaignTypeArgs(client: ccc.Client, campaignTxHash: string): Promise<string> {
  const tx = await client.getTransaction(campaignTxHash);
  const type = tx?.transaction?.outputs[0].type;
  if (!type) throw new Error(`No campaign cell in ${campaignTxHash}`);
  return ccc.hexFrom(type.args);
}

export async function outputOf(client: ccc.Client, txHash: string, index: number) {
  const tx = (await client.getTransaction(txHash))!.transaction!;
  return { output: tx.outputs[index], data: ccc.hexFrom(tx.outputsData[index]) };
}

export class Checks {
  passed = 0;
  failed = 0;

  check(label: string, condition: boolean, detail = "") {
    if (condition) {
      console.log(`   PASS: ${label}${detail ? ` (${detail})` : ""}`);
      this.passed++;
    } else {
      console.error(`   FAIL: ${label}${detail ? ` (${detail})` : ""}`);
      this.failed++;
    }
  }

  /**
   * Assert a transaction is rejected on chain by a specific script with a specific error
   * code. `source` is the CKB script group, e.g. "Inputs[0].Lock" or "Outputs[1].Type".
   * A local builder error, a different script or a different code is a FAIL.
   */
  async expectScriptRejection(label: string, source: string, code: number, submit: () => Promise<string>) {
    try {
      const txHash = await submit();
      this.check(label, false, `transaction was ACCEPTED: ${txHash}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const gotSource = message.match(/source: ([A-Za-z]+\[\d+\]\.[A-Za-z]+)/)?.[1];
      const gotCode = message.match(/error code (-?\d+)/)?.[1];
      const onChain = message.includes("TransactionFailedToVerify");
      this.check(
        label,
        onChain && gotSource === source && gotCode === String(code),
        onChain
          ? `expected ${source} error ${code}, got ${gotSource ?? "?"} error ${gotCode ?? "?"}`
          : `not an on-chain rejection: ${message.slice(0, 200).replace(/\s+/g, " ")}`
      );
    }
  }

  /** Print the summary and exit non-zero on any failure */
  finish(title: string): never {
    console.log(`\n=== ${title}: ${this.passed} passed, ${this.failed} failed ===`);
    process.exit(this.failed === 0 ? 0 : 1);
  }
}
