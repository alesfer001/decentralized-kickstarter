# Phase 5: Permissionless Finalization (Campaign Lock Script) - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the creator's secp256k1 lock on campaign cells with a custom campaign-lock script that allows anyone to finalize expired campaigns. This unblocks Phase 16 (auto-finalization bot) and makes the platform fully trustless.

Does NOT include: early finalization (deferred to v1.2), on-chain status enforcement, or migration of existing v1.1 campaigns.

</domain>

<decisions>
## Implementation Decisions

### Lock Script Validation Logic
- **D-01:** Campaign-lock uses CKB's `since` field to enforce deadline — the transaction must set `since >= deadline_block` (from lock args). CKB natively rejects transactions before the deadline. Same pattern as pledge-lock.
- **D-02:** Lock args contain only `deadline_block` (8 bytes). Minimal — the lock only needs the deadline. All other campaign data (creator hash, goal, status) lives in the type script's cell data.
- **D-03:** Lock validates ONLY the since field against deadline. No additional checks — the campaign type script already validates state transitions (Active→Success/Failed), immutable fields, and TypeID. Minimal code, minimal attack surface.

### Finalization Status Determination
- **D-04:** Keep current model — finalizer submits the new status (Success/Failed) in transaction data, type script validates the transition format. Off-chain indexer determines correct status. A malicious finalizer could theoretically set wrong status, but pledge lock + fail-safe refund (D-06 from Phase 1) protect backers regardless.

### Deployment & Migration Strategy
- **D-05:** Clean slate on testnet — wipe indexer DB, all new campaigns use campaign-lock. Old v1.1 campaigns become orphans. No backward-compatibility code needed.
- **D-06:** Immediate coordinated rollout — deploy contracts + update frontend constants + remove isCreator restriction in one push. No feature flags.

### Testing Approach
- **D-07:** Devnet lifecycle + testnet E2E — native simulator unit tests for the lock script, full lifecycle on devnet (create→pledge→non-creator finalize→release/refund), then deploy to testnet and repeat.
- **D-08:** Explicit non-creator finalization test — use a second devnet account to finalize an expired campaign. Also test that finalization before deadline is rejected by the since field.

### Claude's Discretion
- Internal error code numbering for campaign-lock script
- Exact since field encoding (absolute block number vs relative)
- Helper function organization within the new contract
- Order of deployment steps (contract deploy → indexer reset → frontend update)
- Whether to add the campaign-lock contract as a cell_dep in other transactions

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contract Architecture
- `docs/IMPLEMENTATION-NOTES.md` — BUG-01 root cause analysis, v1.2 approach, implementation checklist
- `docs/ProjectPlan.md` §Phase 15.5 — Original bug descriptions from testnet E2E testing

### Existing Contracts (patterns to follow)
- `contracts/campaign/src/main.rs` — Campaign type script: TypeID validation, state transitions, CampaignData struct
- `contracts/pledge-lock/src/main.rs` — Pledge lock script: since field enforcement pattern, lock args layout, ckb-std usage
- `contracts/pledge-lock/src/lib.rs` — Library exports pattern

### Transaction Builder
- `off-chain/transaction-builder/src/builder.ts` — `createCampaign()` (lines 36-100): lock assignment at line 51; `finalizeCampaign()` (lines 170-258): campaign cell consumption and recreation
- `off-chain/transaction-builder/src/types.ts` — ContractInfo interface, transaction parameter types
- `off-chain/transaction-builder/src/serializer.ts` — Serialization utilities

### Frontend
- `off-chain/frontend/src/app/campaigns/[id]/page.tsx` — Campaign detail page with isCreator finalization check
- `off-chain/frontend/src/lib/constants.ts` — Contract code hashes and deployment info

### Deployment
- `deployment/deployed-contracts-testnet.json` — Current testnet contract deployment config

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `contracts/pledge-lock/` — Reference implementation for a lock script using `since` field enforcement. Campaign-lock follows the same pattern but simpler (no backer hash, no release/refund routing).
- `contracts/campaign/src/main.rs` — CampaignData struct with `from_bytes()`/`to_bytes()` if needed for reading cell data in lock script (though D-03 says lock doesn't need to read campaign data).
- Deployment scripts in `off-chain/transaction-builder/src/deploy-contracts.ts` — handles contract deployment to devnet/testnet.

### Established Patterns
- Lock scripts use `ckb_std::since::Since` for deadline enforcement
- Lock args are fixed-size byte arrays parsed with `from_le_bytes()`
- Contracts use `#[repr(u8)]` enums, `debug!()` for logging, `Result<(), i8>` for errors
- Transaction builder uses CCC SDK pattern: build tx → `completeInputsByCapacity` → `completeFeeBy` → `sendTransaction`

### Integration Points
- `createCampaign()` in builder.ts line 51: change `lock: lockScript` to use campaign-lock code hash + deadline args
- `finalizeCampaign()` in builder.ts: must set `since` field on the campaign cell input to the deadline block
- Frontend campaign detail page: remove `isCreator` check for finalize button visibility
- Indexer DB reset: clear SQLite database for clean slate

</code_context>

<specifics>
## Specific Ideas

- The campaign-lock script should be extremely simple — just validate since >= deadline from args. This is intentionally minimal because the type script already handles all state validation.
- Early finalization (creator spending before deadline) is explicitly deferred to v1.2 — do not add creator_lock_hash to args or any pre-deadline spending path.
- The since field value should use absolute block number mode (not relative or epoch-based).

</specifics>

<deferred>
## Deferred Ideas

- **Early finalization** — Allow creator to finalize before deadline when goal is already met. Parked in v1.2 section of ProjectPlan.md.
- **On-chain status enforcement** — Lock script or type script reads total_pledged vs goal to enforce correct Success/Failed status. Would require pledge cells as cell_deps, significantly more complex.

</deferred>

---

*Phase: 05-permissionless-finalization-campaign-lock-script*
*Context gathered: 2026-04-06*
