# Wave 1 Summary: Foundation Types, Serializers, and Indexer Schema

**Completed:** 2026-03-27
**Status:** All 5 tasks done

## Tasks Completed

### 02-01-01: Add v1.1 transaction builder type definitions
- Added 4 new exported interfaces to `off-chain/transaction-builder/src/types.ts`:
  - `CreatePledgeWithReceiptParams` (pledge + receipt atomic creation)
  - `PermissionlessReleaseParams` (anyone-trigger release to creator)
  - `PermissionlessRefundParams` (anyone-trigger refund to backer)
  - `MergeContributionsParams` (merge N pledge cells into 1)
- Updated `builder.ts` import line to include all 4 new types

### 02-01-02: Add receipt and pledge-lock serialization functions
- Added `serializeReceiptData()` to `off-chain/transaction-builder/src/serializer.ts`
  - 40-byte layout: pledge_amount (u64 LE) + backer_lock_hash (32B)
- Added `serializePledgeLockArgs()` to same file
  - 72-byte layout: campaign_type_script_hash (32B) + deadline_block (u64 LE) + backer_lock_hash (32B)

### 02-01-03: Add receipt and pledge-lock parser functions to indexer
- Added `parseReceiptData()` to `off-chain/indexer/src/parser.ts`
  - Parses 40-byte receipt cell data (inverse of serializeReceiptData)
- Added `parsePledgeLockArgs()` to same file
  - Parses 72-byte pledge lock args (inverse of serializePledgeLockArgs)

### 02-01-04: Add Receipt types to indexer types.ts
- Added `ReceiptData` interface (pledgeAmount + backerLockHash)
- Added `Receipt` interface extending ReceiptData (id, txHash, index, campaignId, status, createdAt)

### 02-01-05: Add receipts table and methods to indexer database
- Added `DBReceipt` interface after existing `DBPledge`
- Added `receipts` table to `createSchema()` with indexes on campaign_id and backer_lock_hash
- Updated `replaceLiveCells()` to accept optional `receipts: DBReceipt[]` parameter
- Added `DELETE FROM receipts` in the atomic transaction
- Added 3 query methods: `getAllReceipts()`, `getReceiptsForCampaign()`, `getReceiptsForBacker()`

## Files Modified
- `off-chain/transaction-builder/src/types.ts` - 4 new interfaces
- `off-chain/transaction-builder/src/builder.ts` - updated import line
- `off-chain/transaction-builder/src/serializer.ts` - 2 new serialization functions
- `off-chain/indexer/src/parser.ts` - 2 new parser functions
- `off-chain/indexer/src/types.ts` - 2 new interfaces
- `off-chain/indexer/src/database.ts` - DBReceipt interface, receipts table, 3 query methods

## Commits
1. `feat(tx-builder): add v1.1 type definitions for trustless pledge operations`
2. `feat(tx-builder): add receipt and pledge-lock serialization functions`
3. `feat(indexer): add receipt and pledge-lock parser functions`
4. `feat(indexer): add Receipt and ReceiptData type definitions`
5. `feat(indexer): add receipts table schema and query methods`
