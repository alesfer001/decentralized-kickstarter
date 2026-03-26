# Pitfalls Research — CKB Trustless Fund Distribution (v1.1)

## Critical Vulnerabilities

### 1. Fake Cell Deps Attack
**Risk:** HIGH
**Description:** Anyone can place any cell in cell_deps. If the lock script doesn't verify the cell_dep's type script hash, an attacker could provide a fake "campaign cell" with status=Success to steal pledge funds.

**Prevention:**
- Lock script args include `campaign_type_script_hash` (set at pledge creation, immutable)
- Lock script MUST verify: `load_cell_type_hash(cell_dep_index, Source::CellDep) == campaign_type_script_hash`
- This ensures only a cell validated by the real campaign type script can be used

**Which phase:** Phase 1 (lock script implementation)

### 2. Capacity Overflow / Underflow
**Risk:** MEDIUM
**Description:** CKB capacity is u64. Arithmetic on capacity values could overflow if not handled carefully, especially when summing multiple pledge capacities during merge.

**Prevention:**
- Use checked arithmetic (`checked_add`, `checked_sub`) in Rust
- Validate total output capacity <= total input capacity (CKB consensus already enforces this, but defense in depth)

**Which phase:** Phase 1 (lock script implementation)

### 3. Receipt Forgery
**Risk:** HIGH
**Description:** If the receipt type script doesn't properly validate creation context, someone could forge receipt cells to claim refunds they're not entitled to.

**Prevention:**
- Receipt type script must verify it's created alongside a valid pledge cell
- Receipt amount must match pledge cell capacity
- Receipt must reference the correct campaign via args

**Which phase:** Phase 1 (receipt type script implementation)

### 4. Double-Spend via Race Condition
**Risk:** LOW (CKB consensus prevents)
**Description:** Two transactions trying to spend the same pledge cell simultaneously. CKB's UTXO model naturally prevents this — only one can be included in a block.

**Prevention:** Built into CKB consensus. No additional handling needed.

## Common Mistakes

### 5. Since Field Confusion
**Risk:** MEDIUM
**Warning signs:** Tests pass with epoch-based since but fail with block-based since, or vice versa.

**Details:**
- `since` has different modes: absolute/relative × block/epoch/timestamp
- The flag bits (bits 63-62) determine the mode
- Using absolute block number is simplest and matches our existing deadline model
- **Gotcha:** `since = 0` means no constraint, NOT "block 0"
- **Gotcha:** The since value must match the mode — absolute block uses raw block number in lower bits

**Prevention:**
- Use `ckb_std::since::Since` helper to parse/validate
- Stick to absolute block number (0x00 prefix)
- Test with block numbers near the deadline boundary (before, at, after)

**Which phase:** Phase 1 (lock script since validation)

### 6. Forgetting Minimum Cell Capacity
**Risk:** MEDIUM
**Warning signs:** Transactions rejected with "InsufficientCellCapacity" error.

**Details:** Every CKB cell must have enough capacity to cover its own storage (lock script, type script, args, data). For pledge cells with custom lock args (~72 bytes lock args + type script), minimum capacity is ~150-200 CKB.

**Prevention:**
- Calculate minimum capacity for each cell type in the transaction builder
- Validate pledge amounts are above minimum threshold
- Document minimum pledge amount in UI

**Which phase:** Phase 3 (transaction builder)

### 7. Campaign Cell Consumed Between Pledge and Release
**Risk:** MEDIUM
**Description:** If the campaign cell is destroyed (e.g., via campaign destruction) before all pledges are released, the lock script can't find it in cell_deps.

**Prevention:**
- Campaign type script should prevent destruction while pledge cells exist (or at least while pledges reference it)
- Alternative: encode campaign status in pledge lock args at finalization time (but we chose cell_deps approach)
- Mitigation: campaign destruction requires all pledges to be resolved first (already the case in v1.0)

**Which phase:** Phase 2 (campaign type script updates)

## Edge Cases

### 8. Who Pays Transaction Fees?
**Problem:** In permissionless release/refund, the triggering party (bot/user) needs to provide CKB for transaction fees. But they shouldn't subsidize the operation indefinitely.

**Options:**
1. Fee comes from pledge cell capacity (creator/backer receives slightly less)
2. Fee provided by a separate input cell from the triggering party
3. Creator pre-funds a fee cell during campaign creation

**Recommendation:** Option 1 is simplest — deduct a small fee from the pledge capacity. Lock script verifies output capacity >= input capacity - MAX_FEE.

**Which phase:** Phase 1 (lock script) + Phase 3 (transaction builder)

### 9. Empty Campaign (No Pledges)
**Edge case:** Campaign reaches deadline with zero pledges. Campaign should be directly destroyable without any pledge/receipt handling.

**Already handled:** v1.0 campaign destruction works when no pledges exist.

### 10. Partial Release/Refund
**Edge case:** Some pledges released but not all. Campaign cell must remain accessible via cell_deps until all pledges are resolved.

**Prevention:** Don't destroy campaign cell until all pledge cells for that campaign are consumed. This is a campaign type script concern.

**Which phase:** Phase 2 (campaign type script updates)

## Security Patterns

### Lock Script Security Checklist
- [ ] Verify cell_dep type script hash matches expected campaign
- [ ] Verify since field enforces deadline
- [ ] Verify output capacity goes to correct destination
- [ ] Verify output lock hash matches expected destination (creator or backer)
- [ ] Use checked arithmetic for all capacity calculations
- [ ] Handle all execution paths (before/after deadline × success/failed/active)
- [ ] Reject unknown/unexpected states explicitly (don't fall through)

### Receipt Type Script Security Checklist
- [ ] Verify receipt is created alongside a valid pledge cell
- [ ] Verify receipt amount matches pledge capacity
- [ ] Verify receipt references correct campaign
- [ ] Verify receipt can only be destroyed during refund (with matching contribution reduction)
- [ ] Verify backer_lock_hash in receipt is immutable after creation

### Testing Strategy
1. **Unit tests:** Test each lock script path independently (native simulator)
2. **Integration tests:** Full transaction tests with all scripts (ckb-testtool or devnet)
3. **Attack tests:** Attempt fake cell_deps, forged receipts, capacity manipulation
4. **Boundary tests:** Deadline exactly at current block, one block before/after
5. **Devnet E2E:** Full lifecycle test with real transactions

## Additional Critical Findings (from deep research)

### 11. Lock Script Dedup — Silent Validation Skip
**Risk:** CRITICAL
**Description:** CKB runs each unique lock script only ONCE per transaction. If multiple pledge cells share identical lock args (same campaign, same deadline, same backer), the lock script executes once and validates one output — then ALL matching inputs pass. An attacker could add extra pledge cells that slip through.

**Prevention:** Encode `backer_lock_hash` in lock args so each pledge cell for a different backer has unique lock args. This forces separate lock script execution per backer.

**Which phase:** Phase 1 (lock script args design — CRITICAL to get right from the start)

### 12. Current Pledge Type Script Blocks Merging
**Risk:** BLOCKING for merge feature
**Description:** The existing `contracts/pledge/src/main.rs` returns `ERROR_MODIFICATION_NOT_ALLOWED` when both input and output pledge cells exist `(true, true)`. This prevents the merge pattern (N inputs → 1 output) and partial refund pattern.

**Prevention:** Update pledge type script to allow:
- Merge: N inputs → 1 output (verify capacity sum preserved)
- Partial refund from merged cell: 1 input → 1 reduced output + 1 refund output

**Which phase:** Phase 1 (type script updates alongside lock script)

### 13. TypeID for Campaign Cell Identity
**Risk:** HIGH (strengthens fake cell_dep defense)
**Description:** Using TypeID on campaign cells gives them an unforgeable identity. The lock script can verify the cell_dep's type script hash includes the TypeID, making it impossible to create a fake campaign cell with the same type script hash.

**Prevention:** Adopt TypeID for campaign cells. Store the full type script hash (including TypeID) in pledge lock args.

**Which phase:** Phase 1 (campaign type script update)

## Prevention Strategies Summary

| Pitfall | Prevention | Phase |
|---------|-----------|-------|
| Fake cell deps | Verify type script hash in lock args | 1 |
| Capacity overflow | Checked arithmetic | 1 |
| Receipt forgery | Validate creation context in type script | 1 |
| Since confusion | Use ckb_std::since helper, absolute block mode | 1 |
| Min capacity | Calculate in tx builder, validate in UI | 3 |
| Campaign consumed | Prevent destruction while pledges exist | 2 |
| Fee handling | Deduct from pledge capacity | 1+3 |
| Partial release | Campaign stays until all pledges resolved | 2 |
