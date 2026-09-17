/**
 * Test script for creating a campaign on OffCKB devnet
 *
 * This script:
 * 1. Loads the deployed contracts from deployment/deployed-contracts-devnet.json
 * 2. Creates a signer from OffCKB test account #0
 * 3. Creates a test campaign transaction
 * 4. Waits for confirmation and checks the campaign cell
 *
 * Run with: npx ts-node test-create-campaign.ts
 */

import { ccc } from "@ckb-ccc/core";
import { readTotalPledged, readCampaignStatus } from "./src/serializer";
import { CKB, setupDevnet, waitForTx, campaignTypeArgs, loadDevnetContracts } from "./test-helpers";

async function main() {
  console.log("=== Create Campaign Test ===\n");

  const contracts = loadDevnetContracts();
  console.log(`- Campaign code hash: ${contracts.campaign.codeHash}`);
  console.log(`- Pledge-lock code hash: ${contracts.pledgeLock.codeHash}\n`);

  const { client, builder, creator, creatorLock } = await setupDevnet();

  const deadlineBlock = BigInt(await client.getTip()) + 10000n;
  console.log("Creating campaign transaction...");
  const txHash = await builder.createCampaign(creator, {
    creatorLockHash: creatorLock.hash(),
    fundingGoal: 1000n * CKB,
    deadlineBlock,
    title: "Create campaign test",
  });
  console.log(`Campaign created! TX: ${txHash}`);

  await waitForTx(client, txHash);
  const typeArgs = await campaignTypeArgs(client, txHash);
  const cell = await builder.findLiveCampaignCell(typeArgs);
  const data = ccc.hexFrom(cell.outputData);

  const problems: string[] = [];
  if (ccc.bytesFrom(typeArgs).length !== 64) problems.push("campaign type args are not 64 bytes");
  if (readTotalPledged(data) !== 0n) problems.push("new campaign does not start at total_pledged 0");
  if (readCampaignStatus(data) !== 0) problems.push("new campaign is not Active");
  if (problems.length > 0) throw new Error(problems.join("; "));
  console.log("Campaign cell confirmed: 64-byte type args, Active, total_pledged 0");
}

main()
  .then(() => {
    console.log("\n=== Test Complete ===");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nError:", error);
    process.exit(1);
  });
