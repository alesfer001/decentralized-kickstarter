# Phase 7: Automatic Finalization Bot - Pattern Map

**Mapped:** 2026-04-24
**Files analyzed:** 3 (1 new, 2 modified)
**Analogs found:** 3 / 3 (100% match)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `off-chain/indexer/src/bot.ts` | service | event-driven (polling loop) | `off-chain/transaction-builder/src/builder.ts` | role-match |
| `off-chain/indexer/src/indexer.ts` | service | event-driven (polling) | `off-chain/indexer/src/indexer.ts` (self) | exact (modification) |
| `off-chain/indexer/src/index.ts` | config/entry-point | request-response | `off-chain/indexer/src/index.ts` (self) | exact (modification) |

## Pattern Assignments

### `off-chain/indexer/src/bot.ts` (service, event-driven)

**Analog:** `off-chain/transaction-builder/src/builder.ts`

**Purpose:** The bot is an orchestration service that coordinates permissionless transaction submissions. It mirrors the TransactionBuilder's class-based pattern, dependency injection via constructor, and async method signatures.

**Imports pattern** (`off-chain/transaction-builder/src/builder.ts:1-4`):
```typescript
import { ccc } from "@ckb-ccc/core";
import { CampaignParams, PledgeParams, ContractInfo, TxResult, FinalizeCampaignParams, RefundPledgeParams, ReleasePledgeParams, DestroyCampaignParams, CreatePledgeWithReceiptParams, PermissionlessReleaseParams, PermissionlessRefundParams, MergeContributionsParams } from "./types";
import { serializeCampaignData, serializePledgeData, serializeCampaignDataWithStatus, calculateCellCapacity, getMetadataSize, serializeReceiptData, serializePledgeLockArgs, encodeDeadlineBlockAsLockArgs } from "./serializer";
import { createCkbClient, NetworkType } from "./ckbClient";
```

**Apply to bot.ts:** Import types, TransactionBuilder class, database, CCC modules.

**Class initialization pattern** (`off-chain/transaction-builder/src/builder.ts:8-31`):
```typescript
export class TransactionBuilder {
  private client: ccc.Client;
  private campaignContract: ContractInfo;
  private pledgeContract: ContractInfo;

  constructor(
    client: ccc.Client,
    campaignContract: ContractInfo,
    pledgeContract: ContractInfo
  ) {
    this.client = client;
    this.campaignContract = campaignContract;
    this.pledgeContract = pledgeContract;
  }
}
```

**Apply to bot.ts:** Create `FinalizationBot` class with constructor accepting client, builder, database, and config params.

**Async method signature pattern** (`off-chain/transaction-builder/src/builder.ts:39`):
```typescript
async createCampaign(signer: ccc.Signer, params: CampaignParams): Promise<string> {
  console.log("Building create campaign transaction...");
  // ... implementation
}
```

**Apply to bot.ts:** Methods like `processPendingFinalizations()`, `releaseSuccessfulPledges()`, `refundFailedPledges()` follow same async + console.log pattern.

**Error handling pattern** (`off-chain/transaction-builder/src/builder.ts:187-295`):
```typescript
async finalizeCampaign(signer: ccc.Signer, params: FinalizeCampaignParams): Promise<string> {
  console.log("Building finalize campaign transaction...");
  
  // ... calculations ...
  
  console.log("Signing finalize transaction...");
  const txHash = await signer.sendTransaction(tx);
  console.log(`Campaign finalized! TX: ${txHash}`);

  return txHash;
}
```

**Apply to bot.ts:** Wrap each finalization/release/refund call in try-catch, log success + txHash, catch errors and log with context. No rethrowing — skip campaign/pledge and continue.

---

### `off-chain/indexer/src/indexer.ts` (service, event-driven - MODIFICATION)

**Analog:** Self (existing file) — `off-chain/indexer/src/indexer.ts:398-412`

**Purpose:** Integrate bot into the existing polling loop without breaking current functionality.

**Current polling loop pattern** (`off-chain/indexer/src/indexer.ts:382-412`):
```typescript
startBackgroundIndexing(
  campaignCodeHash: string,
  pledgeCodeHash: string,
  intervalMs: number = 10000,
  receiptCodeHash?: string,
  pledgeLockCodeHash?: string
) {
  this.campaignCodeHash = campaignCodeHash;
  this.pledgeCodeHash = pledgeCodeHash;
  // ... store config ...

  this.pollingTimer = setInterval(async () => {
    try {
      await this.indexAll(
        this.campaignCodeHash,
        this.pledgeCodeHash,
        this.receiptCodeHash || undefined,
        this.pledgeLockCodeHash || undefined
      );
    } catch (error) {
      console.error("Background indexing error:", error);
    }
  }, intervalMs);

  console.log(`Background indexing started (every ${intervalMs / 1000}s)`);
}
```

**Modification pattern:** After `indexAll()` call in the polling loop, add bot method call:
```typescript
this.pollingTimer = setInterval(async () => {
  try {
    // 1. Index all campaigns/pledges from CKB
    await this.indexAll(...);
    
    // 2. (NEW) Run bot finalization checks
    if (this.bot) {
      await this.bot.processPendingFinalizations();
    }
  } catch (error) {
    console.error("Polling cycle error:", error);
  }
}, intervalMs);
```

**Database access pattern** (`off-chain/indexer/src/indexer.ts:126-140`):
```typescript
export class CampaignIndexer {
  private client: ccc.Client;
  private db: Database;

  constructor(rpcUrl: string, db: Database) {
    this.client = createCkbClient(rpcUrl);
    this.db = db;
  }
}
```

**Apply to bot integration:** Bot receives the same `Database` and `CampaignIndexer` instances to query campaigns/pledges.

**Helper method for getCurrentBlockNumber** (`off-chain/indexer/src/indexer.ts:500-505`):
```typescript
async getCurrentBlockNumber(): Promise<bigint> {
  return await this.client.getIndexer().tip();
}
```

**Apply to bot:** Use indexer's `getCurrentBlockNumber()` to fetch current block for expiry detection.

---

### `off-chain/indexer/src/index.ts` (entry-point/config - MODIFICATION)

**Analog:** Self (existing file) — `off-chain/indexer/src/index.ts:1-87`

**Purpose:** Initialize bot and pass it to the indexer's polling loop. Minimal changes to entry point.

**Environment variable loading pattern** (`off-chain/indexer/src/index.ts:9-24`):
```typescript
const RPC_URL = process.env.CKB_RPC_URL || "http://127.0.0.1:8114";
const PORT = parseInt(process.env.PORT || "3001");
const DB_PATH = process.env.DB_PATH || "./data/indexer.db";
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "10000");

const CAMPAIGN_CODE_HASH =
  process.env.CAMPAIGN_CODE_HASH ||
  "0xb71c1c0bc80ddc5a16ef041f2adf1f9a9339b56ecd63c135607e7e5ebb6ea3fc";
const PLEDGE_CODE_HASH =
  process.env.PLEDGE_CODE_HASH ||
  "0x423442d38b9e1fdfe68d0e878c4003317fe85408e202fd7de776205d289bc924";
```

**Apply to bot init:** Load `BOT_PRIVATE_KEY`, `LOW_BALANCE_THRESHOLD`, `PLEDGE_LOCK_CODE_HASH` from `process.env` in the same block.

**Indexer initialization pattern** (`off-chain/indexer/src/index.ts:31-51`):
```typescript
const db = new Database(DB_PATH);
console.log("SQLite database initialized");

const indexer = new CampaignIndexer(RPC_URL, db);

try {
  const tip = await indexer.getCurrentBlockNumber();
  console.log(`Connected to CKB node. Current block: ${tip}`);
} catch (error) {
  console.error("Failed to connect to CKB node:", error);
  db.close();
  process.exit(1);
}
```

**Apply to bot init:** After indexer creation, initialize bot with signer + config, test balance, print bot address.

**Startup sequence** (`off-chain/indexer/src/index.ts:52-62`):
```typescript
const api = new IndexerAPI(indexer);
api.start(PORT);

console.log("\nPerforming initial indexing...");
try {
  const result = await indexer.indexAll(CAMPAIGN_CODE_HASH, PLEDGE_CODE_HASH, RECEIPT_CODE_HASH || undefined, PLEDGE_LOCK_CODE_HASH || undefined);
  console.log(`Indexed ${result.campaigns} campaigns, ${result.pledges} pledges, and ${result.receipts} receipts`);
} catch (error) {
  console.error("Error during initial indexing:", error);
}

indexer.startBackgroundIndexing(CAMPAIGN_CODE_HASH, PLEDGE_CODE_HASH, POLL_INTERVAL, RECEIPT_CODE_HASH || undefined, PLEDGE_LOCK_CODE_HASH || undefined);
```

**Apply to bot init:** Initialize bot before `startBackgroundIndexing()` call. Pass bot instance to indexer for polling loop integration.

---

## Shared Patterns

### Signer Construction (Bot Wallet)
**Source:** `off-chain/transaction-builder/src/ckbClient.ts` + existing test patterns
**Apply to:** Bot initialization in `index.ts`

```typescript
import { ccc } from "@ckb-ccc/core";
import { createCkbClient } from "./ckbClient";

// In main():
const privateKeyHex = process.env.BOT_PRIVATE_KEY;
if (!privateKeyHex) {
  throw new Error("BOT_PRIVATE_KEY environment variable not set");
}

const client = createCkbClient("testnet", process.env.CKB_RPC_URL);
const signer = new ccc.SignerCkbPrivateKey(client, privateKeyHex);

// Get bot's address:
const botAddress = await signer.getRecommendedAddress();
console.log(`Bot address: ${botAddress}`);
```

### Effective Status Computation (Expiry Detection)
**Source:** `off-chain/indexer/src/api.ts:246-257`
**Apply to:** Bot's campaign scanning logic

```typescript
private computeEffectiveStatus(
  onChainStatus: CampaignStatus,
  deadlineBlock: bigint,
  totalPledged: bigint,
  fundingGoal: bigint,
  currentBlock: bigint
): string {
  if (onChainStatus === CampaignStatus.Success) return "success";
  if (onChainStatus === CampaignStatus.Failed) return "failed";
  if (currentBlock < deadlineBlock) return "active";
  return totalPledged >= fundingGoal ? "expired_success" : "expired_failed";
}
```

**Usage in bot:**
```typescript
// Scan for campaigns needing finalization
for (const campaign of this.db.getAllCampaigns()) {
  if (campaign.status !== 0) continue; // 0 = Active
  
  const effective = this.computeEffectiveStatus(
    campaign.status as CampaignStatus,
    BigInt(campaign.deadline_block),
    BigInt(campaign.total_pledged),
    BigInt(campaign.funding_goal),
    currentBlock
  );
  
  if (["expired_success", "expired_failed"].includes(effective)) {
    // Candidate for finalization
  }
}
```

### Database Query Pattern (Campaign/Pledge Lookup)
**Source:** `off-chain/indexer/src/database.ts:175-223`
**Apply to:** Bot's data fetching

```typescript
// Get all campaigns:
const campaigns = this.db.getAllCampaigns();

// Get pledges for a campaign:
const pledges = this.db.getPledgesForCampaign(campaign.tx_hash);

// Filter and iterate:
for (const pledge of pledges) {
  // Process pledge
}
```

### Error Handling with Logging (Transient Failure Resilience)
**Source:** `off-chain/transaction-builder/src/builder.ts` (try-catch pattern)
**Apply to:** All bot transaction submission methods

```typescript
try {
  const txHash = await this.builder.finalizeCampaign(this.signer, params);
  console.log(`Finalized campaign ${campaign.id}: ${txHash}`);
} catch (error) {
  console.error(`Failed to finalize campaign ${campaign.id}:`, error);
  // No state change — will retry next polling cycle
}
```

### Console Logging (No External Monitoring)
**Source:** Existing indexer + builder pattern
**Apply to:** All bot operations

```typescript
console.log("Bot check: scanning for expired campaigns...");
console.log(`Processing ${campaignsToFinalize.length} expired campaigns`);
console.log(`Bot balance: ${botBalance} CKB`);
console.warn(`Low balance warning: ${botBalance} CKB (threshold: ${threshold} CKB)`);
console.error(`Failed to finalize campaign:`, error);
```

---

## No Analog Found

None. All patterns for Phase 7 bot exist in the codebase:
- TransactionBuilder provides finalization/release/refund methods
- CampaignIndexer provides polling loop structure and database access
- api.ts provides effective status computation
- index.ts provides entry-point pattern and env var handling

---

## Implementation Notes

### File: `off-chain/indexer/src/bot.ts` (NEW)

**Class structure:**
- `FinalizationBot` class with constructor taking `(client: ccc.Client, signer: ccc.Signer, db: Database, builder: TransactionBuilder, config: BotConfig)`
- Private methods: `processPendingFinalizations()`, `releaseSuccessfulPledges()`, `refundFailedPledges()`, `checkBotBalance()`
- Public async methods called from indexer polling loop

**Key methods from research:**
1. `processPendingFinalizations()` — Scan DB for Active campaigns with expired effective status, call `finalizeCampaign()` for each
2. `releaseSuccessfulPledges()` — After finalization, find pledges linked to Success campaigns, call `permissionlessRelease()`
3. `refundFailedPledges()` — After finalization, find pledges linked to Failed campaigns, call `permissionlessRefund()`
4. `checkBotBalance()` — Query bot wallet balance, log warning if below threshold

**Config object:**
```typescript
interface BotConfig {
  lowBalanceThreshold: bigint; // in shannons (e.g., BigInt(50 * 100000000) = 50 CKB)
  pledgeLockCodeHash: string;
  campaignCodeHash: string;
  pledgeCodeHash: string;
}
```

### File: `off-chain/indexer/src/indexer.ts` (MODIFICATION)

**Changes:**
1. Add `private bot: FinalizationBot | null = null` field to CampaignIndexer class
2. Add `setBot(bot: FinalizationBot)` method for integration
3. In `startBackgroundIndexing()` polling loop, after `indexAll()`, call `await this.bot?.processPendingFinalizations()`
4. Keep all existing functionality unchanged

### File: `off-chain/indexer/src/index.ts` (MODIFICATION)

**Changes:**
1. Load env vars: `BOT_PRIVATE_KEY`, `LOW_BALANCE_THRESHOLD`, `PLEDGE_LOCK_CODE_HASH`
2. After `new CampaignIndexer()`, create `FinalizationBot` instance with signer + config
3. Call `indexer.setBot(bot)` to inject bot into polling loop
4. Add try-catch around bot init; if fails, log warning but continue (bot is optional)
5. Keep all existing API/DB/indexing functionality unchanged

---

## Metadata

**Analog search scope:** 
- `off-chain/indexer/src/` — 5 files (indexer.ts, index.ts, api.ts, database.ts, types.ts)
- `off-chain/transaction-builder/src/` — 5 files (builder.ts, ckbClient.ts, types.ts, serializer.ts)

**Files scanned:** 10
**Pattern extraction date:** 2026-04-24

---

*Phase: 07-automatic-finalization-bot*
*Context phase number: 7*
*Patterns complete — ready for planning*
