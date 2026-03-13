/**
 * Deploy campaign and pledge contracts to OffCKB devnet.
 * Outputs new code hashes and tx hashes for updating config files.
 */
import { ccc } from "@ckb-ccc/core";
import { createCkbClient } from "./src/ckbClient";
import * as fs from "fs";
import * as path from "path";

// OffCKB devnet account #0 (creator)
const PRIVATE_KEY = "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6";

async function deployContract(signer: ccc.Signer, binaryPath: string, name: string) {
  const binary = fs.readFileSync(binaryPath);
  console.log(`\nDeploying ${name} (${binary.length} bytes)...`);

  const tx = ccc.Transaction.from({
    outputs: [
      {
        lock: (await signer.getRecommendedAddressObj()).script,
      },
    ],
    outputsData: [ccc.hexFrom(binary)],
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 1000);

  const txHash = await signer.sendTransaction(tx);
  console.log(`  TX hash: ${txHash}`);

  const dataHash = ccc.hashCkb(binary);
  console.log(`  Code hash: ${dataHash}`);

  return { txHash, codeHash: dataHash, index: 0 };
}

async function main() {
  const client = createCkbClient("devnet");
  const signer = new ccc.SignerCkbPrivateKey(client, PRIVATE_KEY);

  const contractsDir = path.resolve(__dirname, "..", "..", "contracts");

  const campaignBinary = path.join(
    contractsDir, "campaign", "target", "riscv64imac-unknown-none-elf", "release", "campaign-contract"
  );
  const pledgeBinary = path.join(
    contractsDir, "pledge", "target", "riscv64imac-unknown-none-elf", "release", "pledge"
  );

  const campaign = await deployContract(signer, campaignBinary, "Campaign");
  await new Promise(r => setTimeout(r, 2000));
  const pledge = await deployContract(signer, pledgeBinary, "Pledge");

  console.log("\n=== Deployment Complete ===");
  console.log(JSON.stringify({
    campaign: { codeHash: campaign.codeHash, txHash: campaign.txHash, index: campaign.index },
    pledge: { codeHash: pledge.codeHash, txHash: pledge.txHash, index: pledge.index },
  }, null, 2));
}

main().catch(err => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
