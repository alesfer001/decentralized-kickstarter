---
phase: 06-security-hardening-officeyutong-review
plan: 05
status: complete
started: 2026-04-16
completed: 2026-04-16
---

# Plan 06-05: Off-Chain Updates for Hardened Contracts

## What was built

Updated off-chain services (indexer, transaction builder, deployment script) to work with the hardened contracts from Plans 01-04. The indexer is now network-aware, the builder creates pledge/receipt cells with cross-referencing contract args, and the deployment script is verified for all 5 hardened contracts.

## Key Changes

### Task 1: Fix indexer network client (Issue 6a)
- Added `createCkbClient()` function to indexer matching transaction-builder pattern
- Replaced hard-coded `ClientPublicTestnet` with network-aware client initialization
- Supports devnet (with OffCKB script overrides), testnet, and mainnet via `CKB_NETWORK` env var
- Indexer reads network configuration consistently with transaction-builder

### Task 2: Update transaction builder for new contract args
- Modified `createPledgeWithReceipt()` to set cross-referencing type script args:
  - Pledge type script args = receipt contract code hash (32 bytes)
  - Receipt type script args = pledge contract code hash (32 bytes)
- Enables receipt and pledge contracts to validate each other's presence and data
- Verified `permissionlessRefund()` already receipt-free (from Plan 03):
  - Only pledge cell as input
  - Campaign cell_dep optional (fail-safe refund)
  - Receipt not consumed, remains as proof-of-contribution
- All TypeScript compiles without errors

### Task 3: Verify deploy script for hardened contracts
- Confirmed deployment order handles all 5 contracts correctly:
  1. Campaign contract (independent)
  2. Campaign-lock contract (independent)
  3. Pledge contract (gets code hash)
  4. Pledge-lock contract (independent)
  5. Receipt contract (gets code hash)
- Type script args set at cell creation time (from deployment config), not at contract deployment
- Script saves all code hashes to `deployment/deployed-contracts-{network}.json`
- Script outputs environment variables for frontend and indexer configuration
- Verified all TypeScript packages compile: indexer, builder, frontend

## Commits

1. `7c6f060` — `fix(06-05): make indexer CKB client network-aware`
2. `f51ba68` — `feat(06-05): add cross-referencing contract args to pledge/receipt cells`
3. `04c159d` — `chore(06-05): verify deploy script handles all 5 contracts`

## Self-Check: PASSED

- off-chain/indexer/src/indexer.ts: createCkbClient function exists, network-aware ✓
- off-chain/transaction-builder/src/builder.ts: pledge args set to receipt code hash ✓
- off-chain/transaction-builder/src/builder.ts: receipt args set to pledge code hash ✓
- Indexer TypeScript compiles ✓
- Builder TypeScript compiles ✓
- Frontend TypeScript compiles ✓

## key-files

### modified
- `off-chain/indexer/src/indexer.ts` — Network-aware CKB client initialization
- `off-chain/transaction-builder/src/builder.ts` — Cross-referencing contract args in createPledgeWithReceipt

## Deviations
None — plan executed as written.

## Requirements Met
- SEC-06: Off-chain services work with hardened contracts ✓
  - Indexer network-aware ✓
  - Builder sets correct args ✓
  - Deploy script ready ✓
