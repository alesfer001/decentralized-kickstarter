---
phase: 06-security-hardening-officeyutong-review
plan: 03
status: complete
started: 2026-04-16
completed: 2026-04-16
---

# Plan 06-03: Receipt Cross-Check & Permissionless Refund

## What was built

Hardened receipt creation validation to cross-check against sibling pledge cell data, and made refund fully permissionless by removing receipt from refund transaction inputs.

## Key Changes

### Task 1: Harden receipt creation with pledge cross-check
- Receipt type script now parses `pledge_type_script_hash` from its args (first 32 bytes)
- Locates sibling pledge cell in outputs by type script hash matching
- Cross-checks `pledge_amount == receipt.pledge_amount`
- Cross-checks `pledge.backer_lock_hash == receipt.backer_lock_hash`
- Added error constants: `ERROR_AMOUNT_MISMATCH`, `ERROR_BACKER_MISMATCH`, `ERROR_LOAD_SCRIPT`, `ERROR_INVALID_ARGS`
- Added imports: `load_cell_type_hash`, `load_script`

### Task 2: Make permissionlessRefund receipt-free
- Removed receipt cell from refund transaction inputs in `builder.ts`
- Refund validated entirely by pledge-lock (routes capacity to backer_lock_hash)
- Receipt remains as proof-of-contribution for UI/indexer — not consumed during refund
- Any wallet can now trigger refund without backer signature

### Task 3: Code formatting
- Applied rustfmt to receipt contract imports

## Commits

1. `d40f201` — `feat(06-03): harden receipt creation with pledge cross-check`
2. `b40ad9d` — `feat(06-03): make permissionlessRefund receipt-free`
3. `e356cf3` — `style(06-03): format receipt contract imports with rustfmt`

## Self-Check: PASSED

## key-files

### created
(none — existing files modified)

### modified
- `contracts/receipt/src/main.rs` — Hardened receipt creation with pledge cross-check
- `off-chain/transaction-builder/src/builder.ts` — Permissionless refund without receipt input

## Deviations
None — plan executed as written.

## Requirements
- SEC-02: Receipt creation hardened + refund permissionless ✓
