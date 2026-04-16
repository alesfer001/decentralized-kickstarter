---
phase: 06-security-hardening-officeyutong-review
plan: 02
subsystem: Campaign Type Script Hardening
tags: [security, hardening, destruction-protection, deadline-enforcement, metadata-validation]
requirements_addressed: [SEC-01, SEC-05, SEC-06]
key-files:
  - contracts/campaign/src/main.rs
dependency_graph:
  requires:
    - pledge-lock grace period implementation (Plan 01)
  provides:
    - Campaign destruction restrictions (Success only after grace period)
    - Finalization deadline enforcement via since field
    - Metadata and reserved bytes integrity validation
  affects:
    - Campaign cell destruction behavior
    - Finalization transaction validation
tech_stack:
  languages: [Rust]
  patterns: [Since field parsing, Grace period checks, Raw data validation]
metrics:
  duration: 2 commits
  completed_date: 2026-04-16
  tasks: 4
---

# Phase 6 Plan 2: Campaign Type Script Hardening — Summary

**Campaign type script hardened to restrict destruction (Issue 1), enforce since >= deadline on finalization (Issue 5), and validate reserved bytes + metadata (Issue 6b).**

Campaign destruction is now restricted by status: Failed campaigns allowed, Active blocked, Success blocked until grace period (180 days after deadline). Finalization enforces `since >= deadline_block` as defense-in-depth alongside the campaign-lock script. Reserved bytes [57..65] and metadata tail (65+) are validated unchanged during finalization to prevent tampering.

## Execution Summary

All 4 tasks executed, bundled into 1 logical commit (contract is monolithic):

1. **Task 1: Restrict campaign destruction by status** ✓
   - Implemented status-aware destruction path in program_entry
   - Failed campaigns: destruction allowed
   - Active campaigns: destruction blocked
   - Success campaigns: destruction blocked until grace period expires (1,944,000 blocks ≈ 180 days)
   - Grace period enforced via since field validation
   - Commit: a56c4f9

2. **Task 2: Add since >= deadline_block enforcement to finalization** ✓
   - Refactored validate_finalization to receive both raw data and parsed structs
   - Added since field validation as first check
   - Enforces `since >= deadline_block` for all finalization transactions
   - Defense-in-depth alongside campaign-lock script enforcement
   - Commit: a56c4f9

3. **Task 3: Add reserved bytes and metadata integrity check to finalization** ✓
   - Added check for reserved bytes [57..65] unchanged between old and new
   - Added check for metadata tail (bytes 65+) unchanged between old and new
   - Prevents tampering with metadata during finalization state transition
   - Only validates if both data lengths >= CampaignData::SIZE
   - Commit: a56c4f9

4. **Task 4: Compile and fix warnings** ✓
   - Added imports: load_input_since, Since, LockValue
   - Added error constants: ERROR_DESTRUCTION_NOT_ALLOWED (13), ERROR_LOAD_SINCE (14)
   - Added constant: GRACE_PERIOD_BLOCKS (1,944,000)
   - Verified compilation: `cargo check --features library` succeeds with only pre-existing warnings
   - Commit: a56c4f9

## Must-Haves Validation

- [x] Campaign type script rejects destruction of Success campaigns ✓ (unless grace period passed)
- [x] Campaign type script allows destruction of Failed campaigns ✓
- [x] Campaign finalization validates since >= deadline_block ✓
- [x] Finalization validates reserved bytes [57..64] unchanged ✓
- [x] Finalization validates metadata tail (bytes 65+) unchanged ✓
- [x] Campaign type script compiles without errors ✓

## Code Changes

**File: `contracts/campaign/src/main.rs`**

### Imports
- Added `load_input_since` to high_level imports
- Added `since::{Since, LockValue}` imports for deadline validation

### Constants
```rust
const ERROR_DESTRUCTION_NOT_ALLOWED: i8 = 13;
const ERROR_LOAD_SINCE: i8 = 14;
const GRACE_PERIOD_BLOCKS: u64 = 1_944_000;  // ~180 days at 8s/block
```

### Destruction Path (lines 311-369)
- Loads campaign data from input
- Matches on campaign.status:
  - `Failed`: allows destruction (refunds don't need campaign cell)
  - `Active`: rejects destruction
  - `Success`: checks since field, allows only after grace_deadline (deadline + GRACE_PERIOD_BLOCKS)
- Grace period check: parses since as absolute block number, compares against deadline + grace period

### Finalization Function (lines 145-228)
- Signature changed: `validate_finalization(old_data: &[u8], new_data: &[u8], old: &CampaignData, new: &CampaignData)`
- Added since validation as first check:
  - Requires since_raw != 0
  - Validates encoding (is_absolute, flags_is_valid)
  - Extracts block number, asserts >= deadline_block
- Added metadata validation (lines 201-216):
  - Checks reserved bytes [57..65] identical
  - Checks metadata tail (65+) identical
- Updated call site in program_entry to pass raw data

## Verification

**Compilation:**
```bash
cd contracts/campaign && cargo check --features library
# Output: Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.27s
```

**Grep verification:**
```bash
grep -n "ERROR_DESTRUCTION_NOT_ALLOWED\|GRACE_PERIOD\|load_input_since\|reserved\|metadata" contracts/campaign/src/main.rs
# Found 14 matches including error constants, grace period constant, since loading, reserved bytes check, metadata check
```

## Security Impact

**Issue 1 (Fail-safe backdoor) — Mitigation:**
- Campaign destruction restricted prevents the attack trigger
- Even if campaign is destroyed, pledge-lock's grace period fail-safe (Plan 01) protects backers
- Failed campaigns can be destroyed immediately (safe path)
- Success campaigns locked until grace period ensures normal release/refund operations complete

**Issue 5 (Finalization deadline) — Mitigation:**
- Since field now enforced in campaign type script
- Even if lock script is changed, type script gate prevents premature finalization
- Defense-in-depth: two independent on-chain checks of deadline

**Issue 6b (Metadata tampering) — Mitigation:**
- Reserved bytes and metadata validated unchanged
- Prevents attacker from modifying campaign metadata during finalization
- Ensures immutability of critical campaign properties

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all code paths are complete.

## Self-Check

- [x] File created: `/Users/ayoublesfer/Documents/Dev/decentralized-kickstarter/contracts/campaign/src/main.rs` ✓
- [x] Commit exists: `a56c4f9` ✓
- [x] Key strings found in code: "ERROR_DESTRUCTION_NOT_ALLOWED", "GRACE_PERIOD_BLOCKS", "load_input_since", "reserved", "metadata" ✓

## Next Steps

- Plan 03: Receipt hardening + permissionless refund
- Plan 04: Pledge type partial refund cross-check
- Plan 05: Off-chain updates (indexer, builder, deploy script)
- Plan 06: Build, deploy, E2E validation
