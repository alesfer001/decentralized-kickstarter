# Wave 02 Summary: Transaction Builder Operations, Indexer Polling, and Deployment Script

**Completed:** 2026-03-27
**Plan:** 02-02-PLAN.md
**Status:** All 9 tasks implemented

## Tasks Completed

### Task 02-02-01: Extend TransactionBuilder constructor and factory
- Added `pledgeLockContract` and `receiptContract` private fields to `TransactionBuilder`
- Updated constructor to accept 5 parameters (client, campaignContract, pledgeContract, pledgeLockContract, receiptContract)
- Updated `createTransactionBuilder` factory function signature with new contract params
- Updated imports for new type definitions and serializer functions
- **File:** `off-chain/transaction-builder/src/builder.ts`

### Task 02-02-02: Implement createPledgeWithReceipt operation
- Added `createPledgeWithReceipt` method producing two outputs atomically:
  - [0] Pledge cell with custom pledge lock (72-byte lock args: campaign_type_script_hash + deadline + backer_lock_hash)
  - [1] Receipt cell owned by backer (40-byte data: pledge_amount + backer_lock_hash)
- Cell deps include pledge type, pledge lock, receipt type, and campaign cell
- Uses `completeInputsByCapacity` and `completeFeeBy` for backer's cells
- **File:** `off-chain/transaction-builder/src/builder.ts`

### Task 02-02-03: Implement permissionlessRelease operation
- Added `permissionlessRelease` method for post-deadline release when campaign succeeded
- Sets `since` field to deadline block number for absolute block enforcement
- Routes pledge funds to creator's lock script
- Signer only provides fee cells (not the pledge owner)
- **File:** `off-chain/transaction-builder/src/builder.ts`

### Task 02-02-04: Implement permissionlessRefund operation
- Added `permissionlessRefund` method consuming both pledge and receipt cells
- Returns pledge + receipt capacity to backer's lock script
- Campaign cell_dep is optional (supports fail-safe refund without it)
- **File:** `off-chain/transaction-builder/src/builder.ts`

### Task 02-02-05: Implement mergeContributions operation
- Added `mergeContributions` method merging N pledge cells into 1
- Validates N >= 2 and matching array lengths
- All inputs use `since: BigInt(0)` for before-deadline merge path
- Preserves total capacity and total amount in merged output
- **File:** `off-chain/transaction-builder/src/builder.ts`

### Task 02-02-06: Update indexer to poll and parse receipt cells
- Updated `CampaignIndexer.indexAll` to accept optional `receiptCodeHash` and `pledgeLockCodeHash`
- Added receipt cell fetching by type script with `scriptSearchMode: "exact"`
- Derives `campaign_id` for receipts by inspecting pledge cell in same transaction
- Updated `startBackgroundIndexing` to pass new code hashes
- Added `dbToReceipt`, `getReceipts`, `getReceiptsForCampaign`, `getReceiptsForBacker` methods
- Updated `replaceLiveCells` call to include receipts
- **File:** `off-chain/indexer/src/indexer.ts`

### Task 02-02-07: Add receipt API endpoints and update campaign response
- Added 3 new REST endpoints: `GET /receipts`, `GET /receipts/backer/:lockHash`, `GET /receipts/campaign/:campaignId`
- Added `receiptCount` field to both `/campaigns` list and `/campaigns/:id` detail responses
- **File:** `off-chain/indexer/src/api.ts`

### Task 02-02-08: Update indexer entry point with new env vars
- Added `RECEIPT_CODE_HASH` and `PLEDGE_LOCK_CODE_HASH` environment variable reads
- Updated initial `indexAll` call and `startBackgroundIndexing` to pass new hashes
- Updated log message to include receipt count
- **File:** `off-chain/indexer/src/index.ts`

### Task 02-02-09: Extend deployment script for 4 contracts
- Added binary paths for `pledge-lock` and `receipt` contracts
- Added deployment calls with confirmation waits for both new contracts
- Extended result object with `pledgeLock` and `receipt` entries
- Added env var output for new contracts (NEXT_PUBLIC_PLEDGE_LOCK_*, NEXT_PUBLIC_RECEIPT_*, PLEDGE_LOCK_CODE_HASH, RECEIPT_CODE_HASH)
- **File:** `scripts/deploy-contracts.ts`

## Foundation Work (Prerequisites)
Also added v1.1 foundation types and functions that were needed by the wave 02 tasks:

- **tx-builder types.ts:** `CreatePledgeWithReceiptParams`, `PermissionlessReleaseParams`, `PermissionlessRefundParams`, `MergeContributionsParams`
- **tx-builder serializer.ts:** `serializeReceiptData`, `serializePledgeLockArgs`
- **indexer types.ts:** `ReceiptData`, `Receipt` interfaces
- **indexer parser.ts:** `parseReceiptData`, `parsePledgeLockArgs` functions
- **indexer database.ts:** `DBReceipt` interface, `receipts` table with indexes, `getAllReceipts`, `getReceiptsForCampaign`, `getReceiptsForBacker` methods, updated `replaceLiveCells` to accept receipts

## Files Modified (10 total)
1. `off-chain/transaction-builder/src/types.ts` - v1.1 parameter interfaces
2. `off-chain/transaction-builder/src/serializer.ts` - Receipt/pledge-lock serialization
3. `off-chain/transaction-builder/src/builder.ts` - 4 new operations + updated constructor/factory
4. `off-chain/indexer/src/types.ts` - Receipt domain types
5. `off-chain/indexer/src/parser.ts` - Receipt/pledge-lock parsing
6. `off-chain/indexer/src/database.ts` - Receipts table, DBReceipt, query methods
7. `off-chain/indexer/src/indexer.ts` - Receipt polling, query methods, updated indexAll
8. `off-chain/indexer/src/api.ts` - Receipt endpoints, receiptCount in campaign response
9. `off-chain/indexer/src/index.ts` - New env vars, updated calls
10. `scripts/deploy-contracts.ts` - Deploy all 4 contracts

## Acceptance Criteria Verification
All acceptance criteria from the plan are satisfied. Key patterns verified:
- `pledgeLockContract`, `receiptContract` fields in builder
- `serializeReceiptData`, `serializePledgeLockArgs` imports in builder
- `createPledgeWithReceipt`, `permissionlessRelease`, `permissionlessRefund`, `mergeContributions` methods
- `since:` field usage for deadline enforcement
- `pledgeLockArgs`, `sinceValue`, `backerOutputCapacity`, `mergedPledgeData` variables
- `fail-safe refund` optional campaign cell_dep pattern
- Receipt indexer: `parseReceiptData`, `DBReceipt`, `dbToReceipt`, receipt query methods
- Receipt API: `/receipts`, `/receipts/backer`, `/receipts/campaign`, `receiptCount`
- Indexer entry: `RECEIPT_CODE_HASH`, `PLEDGE_LOCK_CODE_HASH`, `result.receipts`
- Deploy script: `pledgeLockBinary`, `receiptBinary`, `Pledge-Lock`, `Receipt`
