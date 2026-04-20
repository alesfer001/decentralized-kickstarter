# Phase 6: Security Hardening — Officeyutong Review Fixes - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Address all 6 issues identified by CKB core developer Officeyutong in the CKBuilder Projects code review. Two HIGH-severity issues are mainnet blockers; four MEDIUM/SMALL issues are hardening items.

All contract changes (Issues 1-5) will be bundled into a single deployment cycle (devnet build → E2E test → testnet deploy). Issue 6 is off-chain only and can be done independently.

Does NOT include: new features, Phase 17 (auto-finalization bot), Phase 18 (business model), or mainnet deployment.

</domain>

<decisions>
## Implementation Decisions

### Issue 1 — Fail-safe refund backdoor (pledge-lock)
- **D-01:** Remove the `None` branch in pledge-lock that defaults to backer refund when campaign cell_dep is missing. Replace with an error return. Campaign cell_dep is now mandatory for all post-deadline spending.
- **D-02:** Add a grace period fail-safe as an alternative safety net. If `since >= deadline_block + GRACE_PERIOD` (e.g., 180 days in blocks ≈ 1,555,200 blocks at 8s/block) AND no campaign cell_dep is found, allow refund. This protects backers if campaign cell is genuinely lost, without enabling the backdoor during normal operation.
- **D-03:** For campaign destruction protection: the campaign type script will scan transaction inputs for pledge cells (by type script hash) during the destruction path. If any pledge cells are being consumed in the same transaction, allow destruction (it's part of a release/refund). If no pledge cells are present, reject destruction — prevents creator from destroying campaign while pledges still reference it. Alternative: off-chain enforcement only via builder (simpler but weaker).

### Issue 2 — Receipt creation + refund permissionlessness
- **D-04:** Harden receipt creation: locate the sibling pledge cell in transaction outputs by matching type script hash, then cross-check that `pledge_data.amount == receipt.pledge_amount` AND `pledge_data.backer_lock_hash == receipt.backer_lock_hash`.
- **D-05:** Drop receipt from the refund input path. Refund is validated entirely by pledge-lock (routes capacity to backer_lock_hash from lock args). Receipt remains as proof-of-contribution for UI/indexer but is not consumed during refund. This makes refund fully permissionless — no backer signature needed. Receipt can be destroyed separately by its owner (backer) at any time.
- **D-06 (alternative):** If receipts must be consumed during refund for accounting, lock receipt cells with pledge-lock instead of backer's secp256k1. This is more complex and changes the pledge-with-receipt transaction structure.

### Issue 3 — Partial refund cross-check
- **D-07:** In `validate_partial_refund` (pledge type), scan transaction inputs for a receipt cell being destroyed. Assert `input_pledge.amount - output_pledge.amount == destroyed_receipt.pledge_amount`. This prevents arbitrary partial refund amounts.

### Issue 4 — Merge deadline + lock args
- **D-08:** Add a deadline check to the merge path: if actual block height >= deadline_block (derived from lock args), reject the merge. Merges only make sense before the deadline — after deadline, funds should be released or refunded, not consolidated.
- **D-09:** In `validate_merge`, assert all group inputs share identical lock args (campaign_type_script_hash, deadline_block, backer_lock_hash). Currently only checks lock hash equality, which is sufficient since identical lock args produce identical lock hash. But explicit args comparison adds defense in depth.

### Issue 5 — Finalization since enforcement
- **D-10:** Add `load_input_since` check in campaign type script's finalization path. Verify `since >= deadline_block` from the campaign data. This makes the campaign type script self-enforcing — even if a future lock script change removes deadline enforcement, finalization is still gated by deadline.

### Issue 6 — Smaller items
- **D-11:** Indexer `createCkbClient` should use the network from env var (already partially implemented). Verify and fix any remaining hard-coded `ClientPublicTestnet` references.
- **D-12:** In `validate_finalization`, check that reserved bytes [57..64] are identical between old and new campaign data, and that metadata tail (bytes 65+) is unchanged.
- **D-13:** The 20% capacity buffer is already shown in the pledge form (Phase 15.5.3 BUG-4 fix). Verify it's still accurate and visible.

### Claude's Discretion
- Exact grace period block count for D-02 (if implementing grace period)
- Whether D-03 uses on-chain enforcement (scan inputs) or off-chain enforcement (builder check)
- Receipt lock strategy for D-05 vs D-06 (recommend D-05 for simplicity)
- Error code numbering for new error cases
- Whether to add new error constants or reuse existing ones
- Test scenario ordering in E2E validation plan

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Review Source
- `docs/ProjectPlan.md` §Phase 16 — All 6 issues with descriptions and acceptance criteria
- Memory: `reference_officeyutong_review.md` — Summarized review findings

### Contracts Being Modified
- `contracts/pledge-lock/src/main.rs` — Pledge lock script (Issues 1, 4): fail-safe branch at lines 335-340, merge at lines 207-276, since check at lines 301-319
- `contracts/receipt/src/main.rs` — Receipt type script (Issue 2): creation at lines 74-125, destruction at lines 129-172
- `contracts/pledge/src/main.rs` — Pledge type script (Issue 3): partial refund at lines 181-217
- `contracts/campaign/src/main.rs` — Campaign type script (Issues 1, 5, 6b): finalization at lines 139-174, destruction at lines 261-264

### Transaction Builder
- `off-chain/transaction-builder/src/builder.ts` — `permissionlessRefund` (Issue 2 refund path change), `mergeContributions` (Issue 4)
- `off-chain/transaction-builder/src/types.ts` — Parameter types

### Indexer
- `off-chain/indexer/src/indexer.ts` — Network client initialization (Issue 6a)

### Frontend
- `off-chain/frontend/src/app/campaigns/[id]/page.tsx` — Pledge form capacity breakdown (Issue 6c)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Pledge-lock `find_campaign_in_cell_deps()` — already scans cell_deps for campaign by type hash. Will be reused, not changed.
- Pledge-lock `PledgeLockArgs::from_bytes()` — args parsing can be reused for lock args comparison in merge validation.
- Campaign type `CampaignData::from_bytes()` — standard data parsing, will add reserved bytes check.
- Receipt `ReceiptData::from_bytes()` — used by both receipt and pledge contracts for cross-checking.

### Established Patterns
- Error codes as `const ERROR_*: i8` with grouped ranges (10s, 20s, 30s, 40s)
- `for i in 0..` with `SysError::IndexOutOfBound` break for cell iteration
- `load_cell_type_hash()` for finding cells by type script
- `load_cell_data()` + struct parsing for reading cell data
- `checked_add()` / `checked_sub()` for safe arithmetic

### Key Integration Points
- Plan 01 (pledge-lock): Remove lines 335-340 (None branch), add grace period check, add deadline guard to merge path, add lock args comparison
- Plan 02 (campaign type): Add `load_input_since` + deadline check in finalization, add input scan in destruction, add reserved/metadata check
- Plan 03 (receipt): Add pledge cell lookup by type hash + amount/backer cross-check in creation
- Plan 04 (pledge type): Add receipt lookup in partial refund, cross-check amount difference
- Plan 05 (tx builder): Modify `permissionlessRefund` to not require receipt as input

</code_context>

<specifics>
## Specific Ideas

- For Issue 1, the grace period approach (D-02) is elegant — it preserves the safety net for genuinely lost campaigns while closing the backdoor during normal operation. 180 days is long enough that all normal releases/refunds will have completed.
- For Issue 2, dropping receipt from refund inputs (D-05) is strongly preferred — it makes refund truly permissionless with minimal code change. The receipt's only purpose becomes proof-of-contribution for the indexer/UI.
- For Issue 5, the since check can reuse the same `ckb_std::since` pattern from pledge-lock and campaign-lock.
- For campaign destruction protection (D-03), on-chain enforcement is better than off-chain — a determined attacker can bypass the builder and submit raw transactions.
- Issues 3 and 4 are straightforward hardening — small code additions with clear validation logic.

</specifics>

<deferred>
## Deferred Ideas

- **External audit** — Officeyutong recommended external audit after fixes land (~1100 lines Rust). Parked for Phase 19 or post-grant.
- **Incremental indexing** — Officeyutong suggested switching from full-rescan to incremental before scaling. Parked for Phase 19.
- **On-chain total_pledged enforcement** — Would require pledge cells as cell_deps during finalization. Too complex for this phase.

</deferred>

---

*Phase: 06-security-hardening-officeyutong-review*
*Context gathered: 2026-04-16*
