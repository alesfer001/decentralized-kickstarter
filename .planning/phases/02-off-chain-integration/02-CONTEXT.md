# Phase 2: Off-Chain Integration - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Build transaction builder operations and indexer tracking for the v1.1 script model, deploy all contracts to devnet, and run integration tests:
1. **Transaction Builder** — 4 new operations in existing builder.ts
2. **Indexer** — New receipts table, updated polling for receipt/merged cells
3. **Devnet Deployment** — Fresh devnet, all 4 contracts deployed
4. **Integration Tests** — Full v1.1 lifecycle test script

Does NOT include: frontend changes (Phase 3).
</domain>

<decisions>
## Implementation Decisions

### Transaction Builder
- **D-01:** Extend existing `off-chain/transaction-builder/src/builder.ts` with 4 new operations. Same class, same patterns.
- **D-02:** New operations: `createPledgeWithReceipt`, `permissionlessRelease`, `permissionlessRefund`, `mergeContributions`.
- **D-03:** For permissionless ops, caller provides fee cell as parameter. Transaction builder takes fee cell outpoint as input. Clean separation — no wallet coupling.
- **D-04:** Pledge lock args encoding: `campaign_type_script_hash (32B) + deadline (8B) + backer_lock_hash (32B) = 72 bytes`. Match Phase 1 PledgeLockArgs layout.
- **D-05:** Receipt cell data encoding: `pledge_amount (8B LE) + backer_lock_hash (32B) = 40 bytes`. Match Phase 1 ReceiptData layout.

### Devnet Deployment
- **D-06:** Fresh devnet deployment — all 4 contracts (campaign, pledge, pledge-lock, receipt) deployed from scratch. No migration from v1.0.
- **D-07:** Extend existing `deployment/deployed-contracts.json` with pledge-lock and receipt entries. Same pattern as v1.0.
- **D-08:** Use existing `scripts/deploy-contracts.ts` — add entries for new contracts.

### Indexer Schema
- **D-09:** New `receipts` table: `outpoint TEXT PRIMARY KEY, campaign_id TEXT, backer_lock_hash TEXT, pledge_amount INTEGER, status TEXT, block_number INTEGER`.
- **D-10:** Extend existing API: keep `/campaigns`, `/pledges`. Add `/receipts`, `/receipts/backer/:lockHash`. Extend `/campaigns/:id` response to include receipt counts.
- **D-11:** Indexer polls for receipt cells using the receipt type script code hash (new env var: `RECEIPT_CODE_HASH`). Also polls for pledge-lock cells using pledge lock code hash (new env var: `PLEDGE_LOCK_CODE_HASH`).

### Integration Testing
- **D-12:** New test script `off-chain/transaction-builder/test-v1.1-lifecycle.ts`. Tests full v1.1 flow on devnet.
- **D-13:** Test scenarios: create campaign (with TypeID) → pledge with receipt → finalize success → permissionless release → verify funds at creator. Also: finalize failure → permissionless refund → verify funds at backer. Also: merge N pledges → release from merged cell.

### Claude's Discretion
- Exact SQLite column types and indexes for receipts table
- Helper function organization within builder
- Test script structure and assertion patterns
- Serializer updates for new cell data formats
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 Contracts (to understand what tx builder must construct)
- `contracts/pledge-lock/src/main.rs` — Lock script logic: args layout, spending paths, validation rules
- `contracts/receipt/src/main.rs` — Receipt type script: creation/destruction validation
- `contracts/campaign/src/main.rs` — Updated campaign with TypeID
- `contracts/pledge/src/main.rs` — Updated pledge with merge/partial refund

### Existing Off-Chain Code
- `off-chain/transaction-builder/src/builder.ts` — Existing TransactionBuilder class to extend
- `off-chain/transaction-builder/src/types.ts` — Type definitions
- `off-chain/transaction-builder/src/serializer.ts` — Cell data serialization
- `off-chain/indexer/src/database.ts` — Existing SQLite schema
- `off-chain/indexer/src/indexer.ts` — Cell polling logic
- `off-chain/indexer/src/api.ts` — REST API endpoints

### Prior Phase Context
- `.planning/phases/01-on-chain-contracts/01-CONTEXT.md` — Phase 1 decisions (D-01 through D-16)
- `.planning/research/ARCHITECTURE.md` — Transaction structures for all operations

### Deployment
- `scripts/deploy-contracts.ts` — Contract deployment script
- `deployment/deployed-contracts.json` — Code hash storage
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TransactionBuilder` class with 6 existing operations (createCampaign, createPledge, finalizeCampaign, refundPledge, releasePledgeToCreator, destroyCampaign)
- `CampaignSerializer` / `PledgeSerializer` for cell data encoding
- `Database` class with SQLite schema for campaigns and pledges tables
- `CampaignIndexer` with background polling loop
- `IndexerAPI` with Express REST endpoints

### Established Patterns
- CCC SDK (`@ckb-ccc/core`) for transaction construction
- `ccc.Transaction.from({...})` pattern for building transactions
- SQLite with `better-sqlite3` for indexer storage
- Express 5 with CORS for REST API
- Environment variables for contract code hashes

### Integration Points
- Transaction builder imports from `@ckb-ccc/core`
- Indexer uses CCC client for RPC queries
- Frontend calls indexer REST API (already updated to Render URL)
- Deployment script outputs to `deployment/deployed-contracts*.json`
</code_context>

<specifics>
## Specific Ideas

- Permissionless release/refund needs careful cell collection — must find the pledge cell, campaign cell_dep, and fee cell
- Merge operation needs to collect N pledge cells with same campaign hash
- Indexer needs to handle the pledge-lock code hash (different from pledge type script code hash) for detecting v1.1 pledge cells
- Test script should run against fresh devnet with freshly deployed contracts
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.
</deferred>

---

*Phase: 02-off-chain-integration*
*Context gathered: 2026-03-27*
