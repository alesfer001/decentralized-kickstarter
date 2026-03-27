# Phase 2: Off-Chain Integration - Research

**Researched:** 2026-03-26
**Phase requirements:** TXB-01, TXB-02, TXB-03, TXB-04, MERGE-01, IDX-01, IDX-02

---

## 1. Transaction Builder: New Operations

The existing `TransactionBuilder` class in `off-chain/transaction-builder/src/builder.ts` has 6 operations using a consistent pattern: build `ccc.Transaction.from({...})`, complete inputs/fees via signer, then `signer.sendTransaction(tx)`. The constructor takes `client`, `campaignContract`, and `pledgeContract` as `ContractInfo`.

### 1.1 Constructor Changes

The builder must accept two additional `ContractInfo` parameters for the new contracts:

```typescript
// Current:
constructor(client, campaignContract, pledgeContract)

// Required:
constructor(client, campaignContract, pledgeContract, pledgeLockContract, receiptContract)
```

Both `createTransactionBuilder()` factory and `ContractInfo` interface (already defined in `types.ts`) can be reused as-is. The `ContractInfo` type already has `codeHash`, `hashType`, `txHash`, `index` -- everything needed for cell_deps.

### 1.2 Operation: createPledgeWithReceipt (TXB-01)

This replaces the existing `createPledge`. The transaction must produce TWO output cells atomically: a pledge cell locked with the custom pledge-lock script, and a receipt cell owned by the backer.

**On-chain validation requirements (from contracts):**
- **Pledge type script** (`contracts/pledge/src/main.rs`): Validates creation -- campaign_id non-zero, backer_lock_hash non-zero, amount > 0. The cell data is 72 bytes: `campaign_id(32B) + backer_lock_hash(32B) + amount(8B)`.
- **Receipt type script** (`contracts/receipt/src/main.rs`): Validates creation -- pledge_amount > 0, backer_lock_hash non-zero, AND searches all tx outputs for a pledge cell whose lock args contain matching backer_lock_hash at offset [40..72]. Receipt data is 40 bytes: `pledge_amount(8B LE) + backer_lock_hash(32B)`.
- **Pledge lock script** (`contracts/pledge-lock/src/main.rs`): Lock args are 72 bytes: `campaign_type_script_hash(32B) + deadline_block(8B LE) + backer_lock_hash(32B)`.

**Transaction structure:**
```
inputs:
  [0..N] backer's CKB cells (secp256k1 lock, auto-selected by completeInputsByCapacity)
outputs:
  [0] pledge cell
        lock: { codeHash: pledgeLockContract.codeHash, hashType: pledgeLockContract.hashType,
                args: campaign_type_script_hash(32B) + deadline_block(8B LE) + backer_lock_hash(32B) }
        type: { codeHash: pledgeContract.codeHash, hashType: pledgeContract.hashType, args: "0x" }
        capacity: pledgeAmount + baseCellCapacity
  [1] receipt cell
        lock: backer's secp256k1 lock (backer owns receipt)
        type: { codeHash: receiptContract.codeHash, hashType: receiptContract.hashType, args: "0x" }
        capacity: minimum for 40 bytes data
  [2..] change cell (auto-added by completeFeeBy)
outputsData:
  [0] serializePledgeData(campaignId, backerLockHash, amount)  -- 72 bytes
  [1] serializeReceiptData(pledgeAmount, backerLockHash)       -- 40 bytes
cellDeps:
  [0] pledge type script code cell
  [1] pledge lock script code cell
  [2] receipt type script code cell
  [3] campaign cell (live cell, needed so receipt script can verify pledge context)
```

**Key parameter:** `campaignTypeScriptHash` -- this is the hash of the campaign cell's full type script (code_hash + hash_type + args including TypeID). This is NOT the campaign code_hash; it is computed from the actual deployed campaign cell's type script. The caller must provide this or the builder must compute it from the campaign cell's outpoint.

**New interface needed:**
```typescript
interface CreatePledgeWithReceiptParams {
  campaignOutPoint: { txHash: string; index: number };  // to locate campaign cell
  campaignTypeScriptHash: string;  // hash of campaign's type script (for pledge lock args)
  deadlineBlock: bigint;           // from campaign data (for pledge lock args)
  backerLockHash: string;          // backer's lock script hash
  amount: bigint;                  // pledge amount in shannons
  campaignId: string;              // for pledge cell data (campaign identifier)
}
```

**Critical detail:** The `completeInputsByCapacity(signer)` and `completeFeeBy(signer)` pattern from existing code works because the signer IS the backer. The signer's cells are automatically found and consumed as inputs. No wallet coupling issue here -- the backer signs the whole transaction.

### 1.3 Operation: permissionlessRelease (TXB-02)

Anyone can trigger this after deadline when campaign status is Success. The pledge lock script routes funds to the creator's lock hash.

**On-chain validation (pledge-lock/main.rs):**
- `since` field must be absolute block number >= deadline_block from lock args
- Campaign cell in cell_deps must have type script hash matching lock args, status = Success
- Output capacity to creator_lock_hash >= input capacity - MAX_FEE (1 CKB)

**Transaction structure:**
```
inputs:
  [0] pledge cell (lock: custom pledge lock)
      since: absolute block number >= deadline  (0x0000_0000_XXXX_XXXX format)
  [1] fee cell (caller provides outpoint)
outputs:
  [0] creator cell
        lock: reconstructed from creator_lock_hash (need full lock script, not just hash)
        capacity: pledge cell capacity (minus fee)
  [1] change from fee cell
outputsData:
  [0] "0x"
  [1] "0x"
cellDeps:
  [0] campaign cell (live cell, status = Success)
  [1] pledge lock code cell
  [2] pledge type script code cell (pledge being destroyed)
  [3] secp256k1 cell dep (for fee cell's lock)
```

**Critical challenge: Reconstructing creator lock script from hash.**
The pledge lock only knows `creator_lock_hash` (32 bytes from campaign cell data). To create an output to the creator, we need the FULL lock script (code_hash + hash_type + args), not just the hash. Two approaches:
1. The indexer stores the creator's full lock script (already done -- `creator_lock_code_hash`, `creator_lock_hash_type`, `creator_lock_args` columns in campaigns table)
2. The caller provides the creator lock script as a parameter

Approach 1 is better for permissionless operation. The builder should accept `creatorLockScript: { codeHash, hashType, args }`.

**Since field encoding:**
CKB since for absolute block number uses the top bit = 0, metric flag bits = 00 (block number), so the value is just the block number as u64. In the CCC SDK, this is set on the input's `since` property.

```typescript
// Setting since on an input in CCC:
const tx = ccc.Transaction.from({
  inputs: [{
    previousOutput: { txHash: pledgeOutPoint.txHash, index: pledgeOutPoint.index },
    since: sinceValue,  // absolute block number as bigint/hex
  }],
  ...
});
```

The since value for absolute block number is simply the block number. CKB validates that the transaction cannot be included in a block before this number.

**New interface:**
```typescript
interface PermissionlessReleaseParams {
  pledgeOutPoint: { txHash: string; index: number };
  pledgeCapacity: bigint;
  campaignCellDep: { txHash: string; index: number };  // live campaign cell for cell_dep
  creatorLockScript: { codeHash: string; hashType: string; args: string };
  deadlineBlock: bigint;  // for since field
  feeProviderOutPoint: { txHash: string; index: number };  // or use signer
  feeProviderCapacity: bigint;
}
```

**Fee handling design choice (D-03 from Context):** The caller provides a fee cell as parameter. However, looking at the existing pattern, `completeFeeBy(signer)` automatically selects fee cells. For permissionless operations, the caller IS the fee provider (they just don't own the pledge). So the pattern can be:

```typescript
// The signer provides fee cells. The pledge cell is added as an explicit input.
// completeFeeBy will add signer's cells for fee. The pledge cell input has since set.
```

This is simpler than requiring explicit fee cell outpoints. The signer automatically covers fees.

### 1.4 Operation: permissionlessRefund (TXB-03)

Anyone can trigger this after deadline when campaign status is Failed (or no campaign cell_dep for fail-safe refund). The pledge lock script routes funds to the backer's lock hash.

**On-chain validation (pledge-lock/main.rs):**
- Same since/deadline check as release
- Campaign cell_dep with status = Failed, OR no campaign cell_dep (fail-safe refund)
- Output capacity to backer_lock_hash >= input capacity - MAX_FEE

**Additionally, receipt destruction (receipt/main.rs):**
- Receipt cell is consumed as input
- Output to backer_lock_hash with capacity >= pledge_amount - MAX_FEE
- The receipt destruction validates the refund amount matches

**Transaction structure:**
```
inputs:
  [0] pledge cell (lock: custom pledge lock, since: >= deadline)
  [1] receipt cell (type: receipt type script, lock: backer's secp256k1)
  [2..] fee cells (signer auto-provides)
outputs:
  [0] backer cell
        lock: backer's lock script (reconstructed from backer_lock_hash or from receipt)
        capacity: pledge capacity (minus fee)
  [1] change from fee
outputsData:
  [0] "0x"
cellDeps:
  [0] campaign cell (status = Failed) -- optional for fail-safe
  [1] pledge lock code cell
  [2] pledge type script code cell
  [3] receipt type script code cell
  [4] secp256k1 cell dep
```

**Critical: Backer lock script reconstruction.**
Same challenge as creator lock. The backer_lock_hash is in the lock args and receipt data, but we need the full lock script for the output. Options:
1. Caller provides backer's full lock script
2. Since the receipt cell is locked with the backer's secp256k1 lock, we can read the receipt cell's lock script from the chain

Option 2 is elegant -- query the receipt cell from RPC, read its `cellOutput.lock`, and use that as the output lock. This makes it truly permissionless.

**New interface:**
```typescript
interface PermissionlessRefundParams {
  pledgeOutPoint: { txHash: string; index: number };
  pledgeCapacity: bigint;
  receiptOutPoint: { txHash: string; index: number };
  receiptCapacity: bigint;
  campaignCellDep?: { txHash: string; index: number };  // optional for fail-safe
  backerLockScript: { codeHash: string; hashType: string; args: string };
  deadlineBlock: bigint;
}
```

### 1.5 Operation: mergeContributions (TXB-04, MERGE-01)

Merge N pledge cells for the same campaign into 1. Allowed before deadline (since=0).

**On-chain validation:**
- **Pledge lock (pledge-lock/main.rs `validate_merge`):** since=0 (before deadline path), >=2 group inputs, exactly 1 group output, output capacity == sum(input capacities), output lock hash == input lock hash.
- **Pledge type (pledge/main.rs `validate_merge_pledge`):** All inputs same campaign_id, output amount == sum(input amounts), output references same campaign.

**Transaction structure:**
```
inputs:
  [0..N-1] pledge cells (all same campaign, same pledge lock)
           since: 0 (no time constraint -- allows merge before deadline)
  [N..] fee cells (signer auto-provides)
outputs:
  [0] merged pledge cell
        lock: same pledge lock as inputs (same args)
        type: same pledge type script
        capacity: sum of all input pledge capacities
  [1] change from fee
outputsData:
  [0] serializePledgeData(campaignId, backerLockHash, totalAmount)
cellDeps:
  [0] pledge lock code cell
  [1] pledge type script code cell
  [2] secp256k1 cell dep
```

**Key: All pledge cells must share the same lock script** (same campaign_type_script_hash, same deadline, same backer_lock_hash). This means merge only works for pledges from the same backer to the same campaign. The lock script uses GroupInput/GroupOutput which groups by lock script hash.

**New interface:**
```typescript
interface MergeContributionsParams {
  pledgeOutPoints: Array<{ txHash: string; index: number }>;  // N >= 2
  pledgeCapacities: bigint[];  // capacity of each input
  campaignId: string;
  backerLockHash: string;
  pledgeLockArgs: string;  // full 72-byte args hex for the pledge lock
  totalAmount: bigint;     // sum of amounts for output pledge data
}
```

### 1.6 Serializer Additions

New serialization functions needed in `off-chain/transaction-builder/src/serializer.ts`:

```typescript
// Receipt data: pledge_amount(8B LE) + backer_lock_hash(32B) = 40 bytes
function serializeReceiptData(pledgeAmount: bigint, backerLockHash: string): string {
  const amount = u64ToHexLE(pledgeAmount);
  const hash = backerLockHash.startsWith("0x") ? backerLockHash.slice(2) : backerLockHash;
  return "0x" + amount + hash;
}

// Pledge lock args: campaign_type_script_hash(32B) + deadline(8B LE) + backer_lock_hash(32B) = 72 bytes
function serializePledgeLockArgs(
  campaignTypeScriptHash: string,
  deadlineBlock: bigint,
  backerLockHash: string
): string {
  const campaignHash = campaignTypeScriptHash.startsWith("0x")
    ? campaignTypeScriptHash.slice(2) : campaignTypeScriptHash;
  const deadline = u64ToHexLE(deadlineBlock);
  const backerHash = backerLockHash.startsWith("0x")
    ? backerLockHash.slice(2) : backerLockHash;
  return "0x" + campaignHash + deadline + backerHash;
}
```

The existing `u64ToHexLE` function can be reused directly. The existing `serializePledgeData` can also be reused for the pledge cell data in the merged output.

### 1.7 Type Definition Additions

New types needed in `off-chain/transaction-builder/src/types.ts`:

```typescript
interface CreatePledgeWithReceiptParams {
  campaignOutPoint: { txHash: string; index: number };
  campaignTypeScriptHash: string;
  deadlineBlock: bigint;
  backerLockHash: string;
  amount: bigint;
  campaignId: string;
}

interface PermissionlessReleaseParams {
  pledgeOutPoint: { txHash: string; index: number };
  pledgeCapacity: bigint;
  campaignCellDep: { txHash: string; index: number };
  creatorLockScript: { codeHash: string; hashType: string; args: string };
  deadlineBlock: bigint;
}

interface PermissionlessRefundParams {
  pledgeOutPoint: { txHash: string; index: number };
  pledgeCapacity: bigint;
  receiptOutPoint: { txHash: string; index: number };
  receiptCapacity: bigint;
  campaignCellDep?: { txHash: string; index: number };
  backerLockScript: { codeHash: string; hashType: string; args: string };
  deadlineBlock: bigint;
}

interface MergeContributionsParams {
  pledgeOutPoints: Array<{ txHash: string; index: number }>;
  pledgeCapacities: bigint[];
  campaignId: string;
  backerLockHash: string;
  pledgeLockArgs: string;
  totalAmount: bigint;
}
```

---

## 2. Cell Collection Patterns

### 2.1 Finding Pledge Cells (by pledge lock code hash)

For v1.1, pledge cells use the **custom pledge lock** (not secp256k1). To find them, search by lock script code hash:

```typescript
// Search by pledge LOCK script code hash (different from pledge TYPE script code hash)
const searchKey = {
  script: {
    codeHash: pledgeLockCodeHash,
    hashType: "data2" as const,
    args: "0x",  // prefix match -- finds all pledge lock cells regardless of args
  },
  scriptType: "lock" as const,  // searching by LOCK, not type
  scriptSearchMode: "prefix" as const,  // matches any args starting with "0x"
};

for await (const cell of client.findCells(searchKey, "asc", 1000)) {
  // cell.cellOutput.lock.args contains the 72-byte pledge lock args
  // Parse: campaign_type_script_hash(32B) + deadline(8B) + backer_lock_hash(32B)
}
```

**Important distinction from existing indexer:** The current indexer searches by TYPE script (`scriptType: "type"`). For pledge-lock cells, we need to search by LOCK script (`scriptType: "lock"`) because the pledge lock is what identifies v1.1 pledge cells. These cells also have a pledge TYPE script, so they appear in both searches.

To find pledge cells for a specific campaign, filter by the first 32 bytes of lock args (campaign_type_script_hash).

### 2.2 Finding Campaign Cell for cell_dep

For release/refund, the campaign cell must be included as a cell_dep. The campaign uses TypeID, so its type script hash is unique and stable across state transitions. To find the current live campaign cell:

```typescript
// Search by campaign type script hash
// The campaign's type script args contain the TypeID (first 32 bytes)
const searchKey = {
  script: {
    codeHash: campaignCodeHash,
    hashType: "data2" as const,
    args: campaignTypeId,  // the TypeID portion of args
  },
  scriptType: "type" as const,
  scriptSearchMode: "prefix" as const,
};
```

Alternatively, the indexer already tracks campaign cells. The `campaigns` table has `tx_hash` and `output_index` which give the current outpoint. This outpoint can be used directly as the cell_dep.

### 2.3 Finding Receipt Cells (by receipt type script)

```typescript
const searchKey = {
  script: {
    codeHash: receiptCodeHash,
    hashType: "data2" as const,
    args: "0x",
  },
  scriptType: "type" as const,
  scriptSearchMode: "prefix" as const,
};
```

Receipt cells are locked with the backer's secp256k1 lock. To find receipts for a specific backer, iterate results and check the lock script. Or search by lock script and filter by type.

---

## 3. Lock Args and Cell Data Encoding

### 3.1 Pledge Lock Args (72 bytes)

From `contracts/pledge-lock/src/main.rs` lines 55-63:

| Offset | Size | Field | Encoding |
|--------|------|-------|----------|
| 0-31 | 32B | campaign_type_script_hash | raw bytes |
| 32-39 | 8B | deadline_block | u64 LE |
| 40-71 | 32B | backer_lock_hash | raw bytes |

The `campaign_type_script_hash` is the CKB hash of the campaign cell's type script (including TypeID args). This is what the lock script uses to find and verify the campaign cell_dep.

### 3.2 Receipt Cell Data (40 bytes)

From `contracts/receipt/src/main.rs` lines 43-49:

| Offset | Size | Field | Encoding |
|--------|------|-------|----------|
| 0-7 | 8B | pledge_amount | u64 LE |
| 8-39 | 32B | backer_lock_hash | raw bytes |

### 3.3 Pledge Cell Data (72 bytes) -- unchanged from v1.0

From `contracts/pledge/src/main.rs` lines 36-44:

| Offset | Size | Field | Encoding |
|--------|------|-------|----------|
| 0-31 | 32B | campaign_id | raw bytes |
| 32-63 | 32B | backer_lock_hash | raw bytes |
| 64-71 | 8B | amount | u64 LE |

### 3.4 Since Value Encoding

For absolute block number since: the value is simply the block number as a u64. CKB since bit layout for absolute block number:
- Bit 63 (relative flag) = 0 (absolute)
- Bits 62-61 (metric flag) = 00 (block number)
- Bits 60-0 = block number

So for a deadline of block 1000, the since value is just `1000n` (or `0x3E8`).

The pledge lock script (`main.rs:290-308`) checks:
1. If since_raw == 0: before deadline path (only merge allowed)
2. If since_raw != 0: parse as Since, verify absolute + block number, verify block >= deadline

---

## 4. SQLite Schema Additions (IDX-01)

### 4.1 New `receipts` Table

Following the existing pattern in `off-chain/indexer/src/database.ts`:

```sql
CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,              -- outpoint string: "{txHash}_{index}"
  tx_hash TEXT NOT NULL,
  output_index INTEGER NOT NULL,
  campaign_id TEXT NOT NULL,        -- derived from associated pledge's campaign_id
  backer_lock_hash TEXT NOT NULL,   -- from receipt data bytes 8-39
  pledge_amount TEXT NOT NULL,      -- from receipt data bytes 0-7 (as string for bigint)
  status TEXT NOT NULL DEFAULT 'live',  -- 'live' or 'spent'
  block_number TEXT NOT NULL,       -- block where receipt was created
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_receipts_campaign ON receipts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_receipts_backer ON receipts(backer_lock_hash);
```

### 4.2 New DB Interface

```typescript
interface DBReceipt {
  id: string;
  tx_hash: string;
  output_index: number;
  campaign_id: string;
  backer_lock_hash: string;
  pledge_amount: string;
  status: string;
  block_number: string;
  created_at: string;
}
```

### 4.3 New Database Methods

Following the existing pattern (all methods use `better-sqlite3` prepared statements):

```typescript
// In Database class:
getAllReceipts(): DBReceipt[]
getReceiptsForCampaign(campaignId: string): DBReceipt[]
getReceiptsForBacker(lockHash: string): DBReceipt[]
```

### 4.4 Updated replaceLiveCells

The existing `replaceLiveCells` method does a full clear+rebuild. It needs to accept receipts:

```typescript
replaceLiveCells(campaigns: DBCampaign[], pledges: DBPledge[], receipts: DBReceipt[]) {
  const transaction = this.db.transaction(() => {
    this.db.exec("DELETE FROM campaigns");
    this.db.exec("DELETE FROM pledges");
    this.db.exec("DELETE FROM receipts");
    // ... insert all
  });
  transaction();
}
```

### 4.5 Migration for Existing Databases

Add to the `migrate()` method:

```typescript
// Create receipts table if it doesn't exist (v1.1 migration)
this.db.exec(`
  CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    tx_hash TEXT NOT NULL,
    output_index INTEGER NOT NULL,
    campaign_id TEXT NOT NULL,
    backer_lock_hash TEXT NOT NULL,
    pledge_amount TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'live',
    block_number TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);
```

---

## 5. Indexer Polling Changes (IDX-01, IDX-02)

### 5.1 New Environment Variables

From D-11 in Context:

```
RECEIPT_CODE_HASH      -- receipt type script code hash
PLEDGE_LOCK_CODE_HASH  -- pledge lock script code hash
```

Added to `off-chain/indexer/src/index.ts` alongside existing `CAMPAIGN_CODE_HASH` and `PLEDGE_CODE_HASH`.

### 5.2 Updated indexAll Method

The `CampaignIndexer.indexAll()` method in `off-chain/indexer/src/indexer.ts` currently takes `(campaignCodeHash, pledgeCodeHash)`. It needs additional parameters:

```typescript
async indexAll(
  campaignCodeHash: string,
  pledgeCodeHash: string,
  receiptCodeHash?: string,     // new
  pledgeLockCodeHash?: string   // new
): Promise<{ campaigns: number; pledges: number; receipts: number }>
```

### 5.3 Receipt Cell Polling

New search added to `indexAll`:

```typescript
// Fetch receipt cells by type script
if (receiptCodeHash) {
  const receiptSearchKey = {
    script: {
      codeHash: receiptCodeHash,
      hashType: "data2" as const,
      args: "0x",
    },
    scriptType: "type" as const,
    scriptSearchMode: "prefix" as const,
  };

  for await (const cell of this.client.findCells(receiptSearchKey, "asc", 1000)) {
    // Parse receipt data (40 bytes): pledge_amount(8B LE) + backer_lock_hash(32B)
    // Derive campaign_id by finding the associated pledge cell in the same tx
  }
}
```

**Deriving campaign_id for receipts:** The receipt cell itself does not store campaign_id. To link a receipt to a campaign, the indexer must either:
1. Look at the transaction that created the receipt and find the pledge cell output in the same tx (the pledge cell data contains campaign_id)
2. Match backer_lock_hash between receipt and pledge cells

Option 1 is more reliable. The indexer calls `client.getTransaction(receipt.txHash)` and finds the output with pledge type script, then reads its data.

### 5.4 Pledge-Lock Cell Polling (IDX-02)

For v1.1 pledge cells (locked with custom pledge lock), the indexer can find them by lock code hash:

```typescript
if (pledgeLockCodeHash) {
  const pledgeLockSearchKey = {
    script: {
      codeHash: pledgeLockCodeHash,
      hashType: "data2" as const,
      args: "0x",
    },
    scriptType: "lock" as const,
    scriptSearchMode: "prefix" as const,
  };

  for await (const cell of this.client.findCells(pledgeLockSearchKey, "asc", 1000)) {
    // These cells also have pledge TYPE script, so they already appear
    // in the pledge type search. But searching by lock gives additional info:
    // - lock args contain campaign_type_script_hash, deadline, backer_lock_hash
    // - Can determine pledge lock status (locked/released/refunded) by whether cell is live
  }
}
```

**Merge handling (IDX-02):** After a merge, N pledge cells are consumed and 1 new one is created. Since the indexer does a full clear+rebuild each poll, it naturally reflects the current state -- only live cells are indexed. The merged cell has the total amount in its data, so `calculateTotalPledged` automatically reports the correct total.

### 5.5 New Parser Functions

Add to `off-chain/indexer/src/parser.ts`:

```typescript
// Parse receipt data from cell data bytes (40 bytes)
function parseReceiptData(hexData: string): { pledgeAmount: bigint; backerLockHash: string } {
  const data = hexData.startsWith("0x") ? hexData.slice(2) : hexData;
  if (data.length < 80) {  // 40 bytes = 80 hex chars
    throw new Error(`Invalid receipt data length: ${data.length}`);
  }
  const pledgeAmount = hexToU64LE(data.slice(0, 16));
  const backerLockHash = "0x" + data.slice(16, 80);
  return { pledgeAmount, backerLockHash };
}

// Parse pledge lock args (72 bytes)
function parsePledgeLockArgs(hexArgs: string): {
  campaignTypeScriptHash: string;
  deadlineBlock: bigint;
  backerLockHash: string;
} {
  const data = hexArgs.startsWith("0x") ? hexArgs.slice(2) : hexArgs;
  if (data.length < 144) {  // 72 bytes = 144 hex chars
    throw new Error(`Invalid pledge lock args length: ${data.length}`);
  }
  const campaignTypeScriptHash = "0x" + data.slice(0, 64);
  const deadlineBlock = hexToU64LE(data.slice(64, 80));
  const backerLockHash = "0x" + data.slice(80, 144);
  return { campaignTypeScriptHash, deadlineBlock, backerLockHash };
}
```

---

## 6. API Endpoint Additions

### 6.1 New Routes

Following the existing Express pattern in `off-chain/indexer/src/api.ts`:

```typescript
// GET /receipts -- all receipt cells
this.app.get("/receipts", async (req, res) => {
  const receipts = this.indexer.getReceipts();
  const serialized = receipts.map((r) => ({
    receiptId: r.id,
    campaignId: r.campaignId,
    backer: r.backerLockHash,
    pledgeAmount: r.pledgeAmount.toString(),
    status: r.status,
    txHash: r.txHash,
    index: r.index,
    createdAt: r.createdAt.toString(),
  }));
  res.json(serialized);
});

// GET /receipts/backer/:lockHash -- receipts for a specific backer
this.app.get("/receipts/backer/:lockHash", async (req, res) => {
  const receipts = this.indexer.getReceiptsForBacker(req.params.lockHash);
  // ... same serialization
});

// GET /receipts/campaign/:campaignId -- receipts for a specific campaign
this.app.get("/receipts/campaign/:campaignId", async (req, res) => {
  const receipts = this.indexer.getReceiptsForCampaign(req.params.campaignId);
  // ... same serialization
});
```

### 6.2 Extended Campaign Response

The existing `GET /campaigns/:id` response should include receipt counts (D-10):

```typescript
// Add to existing campaign serialization:
{
  ...existingFields,
  receiptCount: this.indexer.getReceiptsForCampaign(campaign.id).length,
  backerCount: new Set(
    this.indexer.getReceiptsForCampaign(campaign.id).map(r => r.backerLockHash)
  ).size,
}
```

### 6.3 New Indexer Domain Types

Add to `off-chain/indexer/src/types.ts`:

```typescript
interface ReceiptData {
  pledgeAmount: bigint;
  backerLockHash: string;
}

interface Receipt extends ReceiptData {
  id: string;
  txHash: string;
  index: number;
  campaignId: string;
  status: string;
  createdAt: bigint;
}
```

---

## 7. Deployment Script Changes

### 7.1 Binary Paths

From `scripts/build-contracts.sh`, all 4 contract binaries:

```
contracts/campaign/target/riscv64imac-unknown-none-elf/release/campaign-contract
contracts/pledge/target/riscv64imac-unknown-none-elf/release/pledge
contracts/pledge-lock/target/riscv64imac-unknown-none-elf/release/pledge-lock
contracts/receipt/target/riscv64imac-unknown-none-elf/release/receipt
```

### 7.2 Deployment Script Updates

Extend `scripts/deploy-contracts.ts` to deploy all 4 contracts. The existing `deployContract` function works unchanged -- it takes a binary path and deploys it as a cell. Add two more calls:

```typescript
// Existing:
const campaign = await deployContract(signer, campaignBinary, "Campaign");
const pledge = await deployContract(signer, pledgeBinary, "Pledge");

// New:
const pledgeLockBinary = path.join(
  contractsDir, "pledge-lock", "target", "riscv64imac-unknown-none-elf", "release", "pledge-lock"
);
const receiptBinary = path.join(
  contractsDir, "receipt", "target", "riscv64imac-unknown-none-elf", "release", "receipt"
);

const pledgeLock = await deployContract(signer, pledgeLockBinary, "Pledge-Lock");
if (NETWORK !== "devnet") await waitForTx(client, pledgeLock.txHash);
else await new Promise((r) => setTimeout(r, 2000));

const receipt = await deployContract(signer, receiptBinary, "Receipt");
if (NETWORK !== "devnet") await waitForTx(client, receipt.txHash);
```

### 7.3 Updated Output Format

Extend the result JSON to include all 4 contracts:

```json
{
  "network": "devnet",
  "deployedAt": "...",
  "campaign": { "codeHash": "...", "txHash": "...", "index": 0 },
  "pledge": { "codeHash": "...", "txHash": "...", "index": 0 },
  "pledgeLock": { "codeHash": "...", "txHash": "...", "index": 0 },
  "receipt": { "codeHash": "...", "txHash": "...", "index": 0 }
}
```

### 7.4 New Environment Variables Output

After deployment, print additional env vars:

```
NEXT_PUBLIC_PLEDGE_LOCK_CODE_HASH=...
NEXT_PUBLIC_PLEDGE_LOCK_TX_HASH=...
NEXT_PUBLIC_RECEIPT_CODE_HASH=...
NEXT_PUBLIC_RECEIPT_TX_HASH=...
PLEDGE_LOCK_CODE_HASH=...
RECEIPT_CODE_HASH=...
```

---

## 8. Integration Test Structure

### 8.1 Test File

New file: `off-chain/transaction-builder/test-v1.1-lifecycle.ts` (per D-12).

### 8.2 Test Setup Pattern

Following the existing `test-lifecycle.ts` pattern:

```typescript
import { ccc } from "@ckb-ccc/core";
import { TransactionBuilder } from "./src";
import { ContractInfo } from "./src/types";
import { createCkbClient } from "./src/ckbClient";

// Load contract info from deployment artifact
const deploymentPath = "../deployment/deployed-contracts-devnet.json";
// OR hardcode after fresh deployment

const rpcUrl = "http://127.0.0.1:8114";
const creatorKey = "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6";
const backerKey = "0x9f315d5a9618a39fdc487c7a67a8581d40b045bd7a42d83648ca80ef3b2cb4a1";
// Can use a 3rd account for permissionless trigger:
const triggerKey = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
```

### 8.3 Test Scenarios (from D-13)

**Scenario 1: Success lifecycle with permissionless release**
1. Create campaign (with TypeID) using creatorSigner
2. Create pledge with receipt using backerSigner
3. Wait for deadline
4. Creator finalizes campaign as Success
5. Third party triggers permissionless release (triggerSigner)
6. Verify: creator's balance increased by pledge amount (minus fee)

**Scenario 2: Failure lifecycle with permissionless refund**
1. Create campaign with high goal
2. Create pledge with receipt (insufficient amount)
3. Wait for deadline
4. Creator finalizes as Failed
5. Third party triggers permissionless refund
6. Verify: backer received refund, receipt cell consumed

**Scenario 3: Merge then release**
1. Create campaign
2. Same backer makes 3 separate pledges with receipts
3. Merge the 3 pledge cells into 1
4. Wait for deadline
5. Finalize as Success
6. Permissionless release from merged cell
7. Verify: creator received total of all 3 pledges

### 8.4 Assertion Patterns

The existing test uses console.log for output and throws on failure. Same pattern:

```typescript
// Verify balance change:
const balanceAfter = await signer.getBalance();
const expectedMinimum = balanceBefore + pledgeAmount - BigInt(100_000_000); // MAX_FEE
if (balanceAfter < expectedMinimum) {
  throw new Error(`Balance verification failed: expected >= ${expectedMinimum}, got ${balanceAfter}`);
}
console.log(`   VERIFIED: Balance increased by ~${Number(balanceAfter - balanceBefore) / 1e8} CKB`);
```

### 8.5 Campaign TypeID Computation

For test scenario setup, the campaign's type script hash must be computed after creation. After `createCampaign` returns txHash, the campaign cell's type script is at output index 0. The full type script includes the TypeID args. To get the hash:

```typescript
// After campaign creation:
const campaignTx = await client.getTransaction(campaignTxHash);
const campaignCell = campaignTx.transaction.outputs[0];
const campaignTypeScript = campaignCell.type;
// The type script hash is what goes into pledge lock args
const campaignTypeScriptHash = campaignTypeScript.hash();  // CCC SDK method
```

This hash is then passed to `createPledgeWithReceipt` as `campaignTypeScriptHash`.

---

## 9. Risk Areas and Gotchas

### 9.1 Since Field in CCC SDK

The CCC SDK's `ccc.Transaction.from()` accepts `since` on input objects. Verify the exact API:

```typescript
inputs: [{
  previousOutput: { txHash, index },
  since: BigInt(deadlineBlock),  // May need hex string: "0x" + deadlineBlock.toString(16)
}]
```

Need to test whether CCC expects a BigInt, number, or hex string for the since field.

### 9.2 completeInputsByCapacity with Custom Lock

For permissionless operations, the pledge cell has a CUSTOM lock (not secp256k1). The `completeInputsByCapacity(signer)` method only finds cells owned by the signer. The pledge cell must be added as an EXPLICIT input -- it is not auto-collected. Only fee cells should come from the signer.

The pattern is: add pledge cell as explicit input in the Transaction.from() call, then call `completeFeeBy(signer)` to add fee inputs. Do NOT call `completeInputsByCapacity(signer)` -- the pledge cell provides the capacity, and the fee cell covers the fee.

### 9.3 Receipt Destruction Requires Signer

The receipt cell is locked with the backer's secp256k1 lock. Even in "permissionless" refund, the receipt cell input needs to be signed by the backer's key. This means:
- If the backer triggers the refund: they sign both the receipt input and provide fee
- If a third party triggers: they need the backer to have pre-signed the receipt input, OR the receipt should use a different lock (e.g., anyone-can-pay)

**Re-examining the contract:** The receipt type script only validates data, not authorization. The receipt cell's LOCK script determines who can spend it. If locked with backer's secp256k1, only the backer can spend it. For truly permissionless refund, the receipt cell would need an anyone-can-unlock lock.

**Resolution:** Looking at the architecture doc section 4 (Permissionless Refund), the receipt cell IS consumed as an input. The receipt is locked with the backer's lock. This means the "permissionless" refund still requires the backer's participation (they must sign for the receipt cell). The "permissionless" aspect is that ANYONE can route the pledge funds -- but the backer must provide their receipt. In practice, the backer triggers refund themselves using both their receipt and a fee cell.

**Alternative interpretation:** "Permissionless" means the pledge lock doesn't require any specific signer -- it validates based on campaign status and output destinations. The receipt just proves the backer's identity. The backer themselves calls the refund.

### 9.4 Cell Dep Ordering

CKB validates cell_deps by index. The transaction builder must ensure cell_deps are in a consistent order. The pledge lock script iterates cell_deps to find the campaign cell (by type script hash match), so ordering does not matter for correctness -- but the code must include ALL required cell_deps.

### 9.5 Merge Lock Hash Matching

The pledge lock's merge validation checks that output lock hash equals input lock hash (line 252-260 of pledge-lock/main.rs). This means all pledge cells being merged MUST have identical lock args (same campaign_type_script_hash, same deadline, same backer_lock_hash). You cannot merge pledges from different backers.
