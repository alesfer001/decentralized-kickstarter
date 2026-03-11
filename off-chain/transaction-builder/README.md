# CKB Kickstarter Transaction Builder

Transaction builder library for creating campaigns and pledges on the CKB blockchain.

## Installation

```bash
npm install
```

## Usage

### Creating a Campaign

```typescript
import { createTransactionBuilder } from "./src";
import { ccc } from "@ckb-ccc/core";

// Initialize
const builder = createTransactionBuilder(
  "http://127.0.0.1:28114", // OffCKB devnet
  {
    codeHash: "0x...", // Campaign contract code hash
    hashType: "type",
    txHash: "0x...",
    index: 0,
  },
  {
    codeHash: "0x...", // Pledge contract code hash
    hashType: "type",
    txHash: "0x...",
    index: 0,
  }
);

// Connect wallet (JoyID example)
const signer = new ccc.SignerCkbJoyId(client, "My DApp");
await signer.connect();

// Create campaign
const txHash = await builder.createCampaign(signer, {
  creatorLockHash: await builder.getLockHashFromAddress(signer.getAddress()),
  fundingGoal: BigInt(1000) * BigInt(100000000), // 1000 CKB in shannons
  deadlineBlock: BigInt(1000000), // Block number
});

console.log(`Campaign created: ${txHash}`);

// Wait for confirmation
await builder.waitForTransaction(txHash);
```

### Creating a Pledge

```typescript
const txHash = await builder.createPledge(signer, {
  campaignId: "0x...", // Campaign cell hash
  backerLockHash: await builder.getLockHashFromAddress(signer.getAddress()),
  amount: BigInt(100) * BigInt(100000000), // 100 CKB in shannons
});

console.log(`Pledge created: ${txHash}`);
```

## Data Structures

### Campaign (65 bytes)
- `creatorLockHash`: 32 bytes
- `fundingGoal`: 8 bytes (u64)
- `deadlineBlock`: 8 bytes (u64)
- `totalPledged`: 8 bytes (u64)
- `status`: 1 byte (0=Active, 1=Success, 2=Failed)
- `reserved`: 8 bytes

### Pledge (72 bytes)
- `campaignId`: 32 bytes
- `backerLockHash`: 32 bytes
- `amount`: 8 bytes (u64)

## Development

```bash
# Build
npm run build

# Run example
npm run dev
```

## Notes

- All amounts are in shannons (1 CKB = 100,000,000 shannons)
- Capacity calculations include 20% buffer for safety
- Default fee rate: 1000 shannons/KB
- Transaction confirmation timeout: 60 seconds
