---
phase: 06-security-hardening-officeyutong-review
plan: 04
status: complete
started: 2026-04-16
completed: 2026-04-16
---

# Plan 06-04: Partial Refund Amount Cross-Check

## What was built

Added receipt cross-check to `validate_partial_refund` in the pledge type script, ensuring the amount difference exactly equals the destroyed receipt's `pledge_amount`.

## Key Changes

### Task 1: Add receipt cross-check to validate_partial_refund
- Changed `validate_partial_refund` signature to accept `receipt_type_hash: Option<&[u8; 32]>`
- Added `checked_sub` for safe amount difference calculation
- Scans transaction inputs for receipt cells by type script hash
- Cross-checks `amount_difference == receipt.pledge_amount`
- Returns `ERROR_REFUND_AMOUNT_MISMATCH` for mismatched amounts
- Returns `ERROR_NO_RECEIPT_IN_INPUTS` if no receipt found
- Updated `program_entry()` to parse receipt type hash from args (first 32 bytes)
- Legacy compatibility: skips cross-check if args are empty (< 32 bytes)

### Task 2: Compilation verification
- Contract compiles with `cargo check --features library` — only pre-existing `to_bytes` warning

## Commits

1. `c79ba01` — `fix(06-04): add receipt cross-check to partial refund validation`

## Self-Check: PASSED

## key-files

### created
(none — existing file modified)

### modified
- `contracts/pledge/src/main.rs` — Hardened partial refund with receipt cross-check

## Deviations
None — plan executed as written.

## Requirements
- SEC-03: Partial refund cross-check ✓
