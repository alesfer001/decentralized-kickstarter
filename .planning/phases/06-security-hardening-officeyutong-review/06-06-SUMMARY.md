---
phase: 06-security-hardening-officeyutong-review
plan: 06
status: complete
started: 2026-04-16
completed: 2026-04-20
---

# Plan 06-06: Build, Deploy, and E2E Test Hardened Contracts

## What was built

Built all 5 hardened contracts for riscv64, deployed to devnet, validated all 3 happy path lifecycle scenarios, and verified all 3 attack vectors are correctly rejected.

## Key Changes

### Task 1: Build all contracts ✓
- All 5 contracts compiled with riscv64-elf-gcc + B-extension flags
- Binaries stripped with riscv64-elf-objcopy

### Task 2: Deploy to devnet ✓
- All 5 contracts deployed with new code hashes
- deployment/deployed-contracts-devnet.json updated

### Task 3: Happy path lifecycle tests ✓
- Scenario 1: Success → Permissionless Release — PASSED
- Scenario 2: Failure → Permissionless Refund — PASSED
- Scenario 3: Merge → Release from Merged Cell — PASSED

### Task 4: Security attack tests ✓
- Attack 1: Fail-safe backdoor (refund without cell_dep) — REJECTED (error code 21)
- Attack 2: Destroy Success campaign — REJECTED (campaign-lock blocks)
- Attack 3: Premature finalization — REJECTED (since Immature enforcement)

## Bug found and fixed during testing

**load_cell_type_hash vs code_hash mismatch:** Receipt and pledge contracts used `load_cell_type_hash` (returns hash of full type script including args) but compared against a code hash stored in args. These never match because the type script hash includes hash_type and args. Fixed by switching to `load_cell_type` and comparing the `code_hash()` field directly.

## Commits

1. `8f9790c` — docs(06-06): record contract build verification
2. `30a9ff4` — chore(06-06): deploy all 5 hardened contracts to devnet
3. `a71c7af` — fix(06-06): update lifecycle test for receipt-free refund
4. `b358579` — fix(06): use load_cell_type code_hash comparison instead of type_hash
5. `cb9806f` — test(06-06): all lifecycle and security tests pass on devnet

## Self-Check: PASSED

## key-files

### created
- `off-chain/transaction-builder/test-v1.1-security.ts` — Security attack scenario tests

### modified
- `deployment/deployed-contracts-devnet.json` — Updated deployment config
- `off-chain/transaction-builder/test-v1.1-lifecycle.ts` — Receipt-free refund update
- `contracts/receipt/src/main.rs` — code_hash comparison fix
- `contracts/pledge/src/main.rs` — code_hash comparison fix

## Deviations
- Contracts needed rebuild after Wave 1 changes (stale binaries from March)
- code_hash vs type_hash bug discovered and fixed during E2E testing

## Requirements
- SEC-01 through SEC-06: All validated via E2E tests ✓
