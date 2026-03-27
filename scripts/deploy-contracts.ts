/**
 * Deploy campaign and pledge contracts to CKB.
 *
 * Supports devnet, testnet, and mainnet via environment variables:
 *   CKB_NETWORK        - "devnet" (default), "testnet", or "mainnet"
 *   DEPLOYER_PRIVATE_KEY - Private key for the deployer account
 *   CKB_RPC_URL         - Optional RPC URL override
 *
 * Examples:
 *   # Devnet (default)
 *   npx ts-node scripts/deploy-contracts.ts
 *
 *   # Testnet
 *   CKB_NETWORK=testnet DEPLOYER_PRIVATE_KEY=0x... npx ts-node scripts/deploy-contracts.ts
 */
import { ccc } from "@ckb-ccc/core";
import * as fs from "fs";
import * as path from "path";

type NetworkType = "devnet" | "testnet" | "mainnet";

// --- Configuration from environment ---

const NETWORK = (process.env.CKB_NETWORK as NetworkType) || "devnet";

// Default devnet private key (publicly known OffCKB account #0)
const DEFAULT_DEVNET_KEY = "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6";

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || (NETWORK === "devnet" ? DEFAULT_DEVNET_KEY : "");

const RPC_URLS: Record<NetworkType, string> = {
  devnet: "http://127.0.0.1:8114",
  testnet: "https://testnet.ckbapp.dev/",
  mainnet: "https://mainnet.ckbapp.dev/",
};

const RPC_URL = process.env.CKB_RPC_URL || RPC_URLS[NETWORK];

// --- Devnet script overrides ---

const DEVNET_SCRIPTS: Record<ccc.KnownScript, ccc.ScriptInfoLike | undefined> = {
  [ccc.KnownScript.Secp256k1Blake160]: {
    codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
    hashType: "type",
    cellDeps: [
      {
        cellDep: {
          outPoint: {
            txHash: "0x75be96e1871693f030db27ddae47890a28ab180e88e36ebb3575d9f1377d3da7",
            index: 0,
          },
          depType: "depGroup",
        },
      },
    ],
  },
  [ccc.KnownScript.Secp256k1Multisig]: undefined,
  [ccc.KnownScript.Secp256k1MultisigV2]: undefined,
  [ccc.KnownScript.TypeId]: undefined,
  [ccc.KnownScript.AnyoneCanPay]: undefined,
  [ccc.KnownScript.NervosDao]: undefined,
  [ccc.KnownScript.XUdt]: undefined,
  [ccc.KnownScript.JoyId]: undefined,
  [ccc.KnownScript.COTA]: undefined,
  [ccc.KnownScript.PWLock]: undefined,
  [ccc.KnownScript.OmniLock]: undefined,
  [ccc.KnownScript.NostrLock]: undefined,
  [ccc.KnownScript.UniqueType]: undefined,
  [ccc.KnownScript.AlwaysSuccess]: undefined,
  [ccc.KnownScript.InputTypeProxyLock]: undefined,
  [ccc.KnownScript.OutputTypeProxyLock]: undefined,
  [ccc.KnownScript.LockProxyLock]: undefined,
  [ccc.KnownScript.SingleUseLock]: undefined,
  [ccc.KnownScript.TypeBurnLock]: undefined,
  [ccc.KnownScript.EasyToDiscoverType]: undefined,
  [ccc.KnownScript.TimeLock]: undefined,
};

function createClient(): ccc.Client {
  switch (NETWORK) {
    case "devnet":
      return new ccc.ClientPublicTestnet({
        url: RPC_URL,
        scripts: DEVNET_SCRIPTS,
        fallbacks: [],
      });
    case "testnet":
      return new ccc.ClientPublicTestnet(
        RPC_URL !== RPC_URLS.testnet ? { url: RPC_URL } : undefined
      );
    case "mainnet":
      return new ccc.ClientPublicMainnet(
        RPC_URL !== RPC_URLS.mainnet ? { url: RPC_URL } : undefined
      );
  }
}

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

async function waitForTx(client: ccc.Client, txHash: string, timeout = 120000) {
  console.log(`  Waiting for confirmation...`);
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const tx = await client.getTransaction(txHash);
      if (tx && tx.status === "committed") {
        console.log(`  Confirmed!`);
        return;
      }
    } catch {
      // not found yet
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.warn(`  Warning: TX ${txHash} not confirmed within ${timeout / 1000}s (may still confirm)`);
}

async function main() {
  console.log(`=== CKB Contract Deployment ===`);
  console.log(`Network:  ${NETWORK}`);
  console.log(`RPC URL:  ${RPC_URL}`);

  if (!PRIVATE_KEY) {
    console.error("ERROR: DEPLOYER_PRIVATE_KEY environment variable is required for non-devnet deployments.");
    process.exit(1);
  }

  const client = createClient();
  const signer = new ccc.SignerCkbPrivateKey(client, PRIVATE_KEY);

  const address = await signer.getRecommendedAddress();
  console.log(`Deployer: ${address}`);

  // Check balance
  const balance = await signer.getBalance();
  console.log(`Balance:  ${Number(balance) / 100000000} CKB`);

  if (balance < BigInt(100000) * BigInt(100000000)) {
    console.warn("WARNING: Balance may be insufficient for deployment. Need ~100,000 CKB.");
  }

  const contractsDir = path.resolve(__dirname, "..", "contracts");

  const campaignBinary = path.join(
    contractsDir, "campaign", "target", "riscv64imac-unknown-none-elf", "release", "campaign-contract"
  );
  const pledgeBinary = path.join(
    contractsDir, "pledge", "target", "riscv64imac-unknown-none-elf", "release", "pledge"
  );
  const pledgeLockBinary = path.join(
    contractsDir, "pledge-lock", "target", "riscv64imac-unknown-none-elf", "release", "pledge-lock"
  );
  const receiptBinary = path.join(
    contractsDir, "receipt", "target", "riscv64imac-unknown-none-elf", "release", "receipt"
  );

  // Deploy campaign contract
  const campaign = await deployContract(signer, campaignBinary, "Campaign");

  // Wait for confirmation (important on testnet/mainnet)
  if (NETWORK !== "devnet") {
    await waitForTx(client, campaign.txHash);
  } else {
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Deploy pledge contract
  const pledge = await deployContract(signer, pledgeBinary, "Pledge");

  if (NETWORK !== "devnet") {
    await waitForTx(client, pledge.txHash);
  } else {
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Deploy pledge-lock contract
  const pledgeLock = await deployContract(signer, pledgeLockBinary, "Pledge-Lock");

  if (NETWORK !== "devnet") {
    await waitForTx(client, pledgeLock.txHash);
  } else {
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Deploy receipt contract
  const receipt = await deployContract(signer, receiptBinary, "Receipt");

  if (NETWORK !== "devnet") {
    await waitForTx(client, receipt.txHash);
  }

  const result = {
    network: NETWORK,
    deployedAt: new Date().toISOString(),
    campaign: { codeHash: campaign.codeHash, txHash: campaign.txHash, index: campaign.index },
    pledge: { codeHash: pledge.codeHash, txHash: pledge.txHash, index: pledge.index },
    pledgeLock: { codeHash: pledgeLock.codeHash, txHash: pledgeLock.txHash, index: pledgeLock.index },
    receipt: { codeHash: receipt.codeHash, txHash: receipt.txHash, index: receipt.index },
  };

  console.log("\n=== Deployment Complete ===");
  console.log(JSON.stringify(result, null, 2));

  // Save deployment artifacts
  const deployDir = path.resolve(__dirname, "..", "deployment");
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }
  const outPath = path.join(deployDir, `deployed-contracts-${NETWORK}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\nSaved to: ${outPath}`);

  if (NETWORK !== "devnet") {
    console.log("\n=== Next Steps ===");
    console.log("Set these environment variables for the frontend:");
    console.log(`  NEXT_PUBLIC_NETWORK=${NETWORK}`);
    console.log(`  NEXT_PUBLIC_CAMPAIGN_CODE_HASH=${campaign.codeHash}`);
    console.log(`  NEXT_PUBLIC_CAMPAIGN_TX_HASH=${campaign.txHash}`);
    console.log(`  NEXT_PUBLIC_PLEDGE_CODE_HASH=${pledge.codeHash}`);
    console.log(`  NEXT_PUBLIC_PLEDGE_TX_HASH=${pledge.txHash}`);
    console.log(`  NEXT_PUBLIC_PLEDGE_LOCK_CODE_HASH=${pledgeLock.codeHash}`);
    console.log(`  NEXT_PUBLIC_PLEDGE_LOCK_TX_HASH=${pledgeLock.txHash}`);
    console.log(`  NEXT_PUBLIC_RECEIPT_CODE_HASH=${receipt.codeHash}`);
    console.log(`  NEXT_PUBLIC_RECEIPT_TX_HASH=${receipt.txHash}`);
    console.log("\nSet these for the indexer:");
    console.log(`  CKB_NETWORK=${NETWORK}`);
    console.log(`  CAMPAIGN_CODE_HASH=${campaign.codeHash}`);
    console.log(`  PLEDGE_CODE_HASH=${pledge.codeHash}`);
    console.log(`  PLEDGE_LOCK_CODE_HASH=${pledgeLock.codeHash}`);
    console.log(`  RECEIPT_CODE_HASH=${receipt.codeHash}`);
  }
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
