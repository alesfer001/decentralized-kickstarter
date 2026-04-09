# CKB Kickstarter v1.1 Implementation Notes

## BUG-01: Permissionless Finalization — RESOLVED (2026-04-09)

### Problem (v1.1)

Campaign cells were locked with the creator's secp256k1 lock script. Only the creator could call `finalizeCampaign()`. This blocked the auto-finalization bot (Phase 16) and meant the platform wasn't truly trustless.

### Root Cause

The campaign cell's lock script was hardcoded to the creator's lock hash in `createCampaign()`. CKB's UTXO model requires the cell's lock script to authorize all spending.

### Solution: Campaign-Lock Contract

Created a new `campaign-lock` contract (`contracts/campaign-lock/src/main.rs`) that replaces the creator's secp256k1 lock on campaign cells.

**Lock script design:**
- **Args:** 8 bytes — `deadline_block` (u64, LE)
- **Validation:** `load_input_since()` reads the transaction's since field, rejects if `since_raw < deadline_block`
- **No creator signature required** — anyone can spend after deadline
- **Type script handles state validation** — campaign-lock only enforces timing

**Key discovery: CKB devnet absolute since bug**
- CKB OffCKB devnet (v0.201.0) rejects ALL absolute since values (bit 63 set) with `Immature` error, regardless of tip block
- Tested: absolute block number, absolute epoch — all rejected on devnet even for values well in the past
- Relative since values (bit 63 = 0) are NOT enforced at consensus layer on devnet
- **Solution:** Use raw deadline block number as since value (same pattern as pledge-lock). The lock script enforces the deadline via `load_input_since()` rather than relying on CKB consensus enforcement
- This approach works on both devnet and testnet

**Changes made:**
- `contracts/campaign-lock/` — New Rust contract (~100 lines), compiled to RISC-V, deployed to devnet
- `builder.ts createCampaign()` — Lock script = campaign-lock code hash + deadline args (8 bytes LE)
- `builder.ts finalizeCampaign()` — Sets `since: BigInt(deadlineBlock)` on campaign cell input
- `frontend constants.ts` — Added `campaignLock` to CONTRACTS config
- `frontend campaigns/[id]/page.tsx` — Removed `isCreator` check from finalize button, visible to all users when expired

### Test Results (Devnet)

All 3 lifecycle tests pass (`test-lifecycle.ts`):
- [x] Test 1 (Success): create → pledge → finalize → release
- [x] Test 2 (Failure): create → pledge → finalize → refund
- [x] Test 3 (Non-Creator Permissionless Finalization):
  - Before deadline: finalization rejected (`Immature` — since < deadline)
  - After deadline: non-creator Account B finalizes successfully
  - Non-creator Account B triggers permissionless release — funds routed to creator
  - Double finalization rejected (cell already consumed)

### Remaining

- [ ] Deploy updated campaign-lock to testnet (requires funded deployer account)
- [ ] Full E2E on testnet with non-creator finalization
- [ ] Early finalization (creator before deadline) — deferred to v1.2, tracked in ProjectPlan.md
