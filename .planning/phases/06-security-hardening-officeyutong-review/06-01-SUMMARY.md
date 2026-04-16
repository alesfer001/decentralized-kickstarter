---
phase: 06-security-hardening-officeyutong-review
plan: 01
status: complete
started: 2026-04-16
completed: 2026-04-16
---

# Plan 06-01: Pledge-Lock Fail-Safe & Merge Hardening

## What was built

Hardened the pledge-lock script to close the critical fail-safe refund backdoor (Issue 1) and add merge path defense-in-depth guards (Issue 4).

## Key Changes

### Task 1: Replace fail-safe backdoor with grace period check
- Added `GRACE_PERIOD_BLOCKS = 1,944,000` constant (~180 days at 8s/block)
- Added `ERROR_CAMPAIGN_CELL_DEP_MISSING` error code
- Refactored since parsing to extract and store `since_block` for reuse
- Replaced `None` branch: campaign cell_dep now mandatory within grace period
- After grace period, refund allowed without cell_dep as safety net for genuinely lost campaigns

### Task 2: Merge path deadline guard and lock args validation
- Added explicit lock args verification loop for defense in depth on merge output
- Verified all group inputs match our lock hash
- Removed `#[allow(dead_code)]` from `ERROR_MERGE_LOCK_MISMATCH` (now used)
- Documented CKB since floor constraint (merge timing limitation)

### Task 3: Compilation verification
- Contract compiles cleanly with `cargo check --features library`
- No dead code warnings for new error constants

## Commits

1. `4f3911d` — `fix(06-01): replace fail-safe backdoor with grace period check`
2. `80b2e46` — `fix(06-01): add merge path deadline guard and lock args validation`

## Self-Check: PASSED

## key-files

### created
(none — existing file modified)

### modified
- `contracts/pledge-lock/src/main.rs` — Hardened pledge lock with grace period + merge guards

## Deviations
None — plan executed as written.

## Requirements
- SEC-01: Fail-safe backdoor closed ✓
- SEC-04: Merge path hardened ✓
