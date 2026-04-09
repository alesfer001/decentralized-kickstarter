---
phase: 05-permissionless-finalization-campaign-lock-script
plan: 02
name: Deploy Campaign-Lock Contract and Update Transaction Builder
status: completed
completed_date: 2026-04-10
duration: "~30 minutes"
tasks_completed: 2/2
commits:
  - "618be07: feat(05-02): add campaign-lock contract reference to transaction builder and deployment config"
  - "ca55f1a: feat(05-02): update deploy-contracts script to include campaign-lock deployment"
  - "d8197fd: docs(05-02): add campaign-lock compilation and deployment guide"
---

# Phase 05 Plan 02: Deploy Campaign-Lock Contract Summary

## Overview

Updated the transaction builder infrastructure to support the campaign-lock contract (lock script for trustless fund routing). The contract was implemented in plan 05-01 and is now integrated into the deployment and transaction building workflow.

## What Was Built

### 1. Campaign-Lock Contract Integration (Task 1)

**File:** `off-chain/transaction-builder/src/builder.ts`

- Added `campaignLockContract: ContractInfo` private field to TransactionBuilder class
- Updated constructor signature to accept `campaignLockContract` parameter
- Added `getCampaignLockContract()` accessor method for internal use
- Updated factory function `createTransactionBuilder()` to accept and pass campaignLockContract
- All changes maintain backward compatibility with existing contract handling

**File:** `deployment/deployed-contracts-devnet.json`

- Added campaignLock entry with placeholder values:
  - `codeHash`: 0x0... (will be filled on deployment)
  - `hashType`: "data" (correct for lock scripts)
  - `txHash`: 0x0... (will be filled on deployment)
  - `index`: 0
- Maintained alphabetical ordering and JSON validity

**Result:** TypeScript compiles without errors. TransactionBuilder now exposes campaign-lock contract details for use in future transaction building methods.

### 2. Deployment Script Updates (Task 2)

**File:** `off-chain/transaction-builder/deploy-contracts.ts`

- Added campaign-lock binary path definition
- Inserted campaign-lock deployment step after campaign contract
- Deployment waits for confirmation (devnet: 2s delay, testnet/mainnet: full confirmation)
- Updated result object to include campaignLock entry with hashType field
- Enhanced environment variable output section with CAMPAIGN_LOCK env vars for both frontend and indexer

**Result:** Deploy script now handles 5 contracts (campaign, campaign-lock, pledge, pledge-lock, receipt) in order.

### 3. Deployment Guide

**File:** `CAMPAIGN_LOCK_DEPLOYMENT.md`

Comprehensive guide covering:
- RISC-V toolchain prerequisites (rust target + riscv64-unknown-elf-gcc)
- Compilation steps for campaign-lock contract
- Deployment procedure (how to run deploy-contracts.ts)
- Contract integration points (where campaign-lock is used)
- Explanation of what campaign-lock does (deadline enforcement, permissionless access)
- Roadmap for future plans (05-03 through 05-05)

## Known Limitations

### Compilation Toolchain Not Available

The campaign-lock contract source code is ready in `contracts/campaign-lock/src/main.rs`, but the RISC-V toolchain (riscv64-unknown-elf-gcc) is not installed in the current environment.

**Impact:** Campaign-lock cannot be compiled to RISC-V binary in this session.

**Solution:** When the RISC-V toolchain is available:
```bash
cd contracts/campaign-lock
cargo build --target riscv64imac-unknown-none-elf --release
# Output: contracts/campaign-lock/target/riscv64imac-unknown-none-elf/release/campaign-lock
```

Then run the deployment script:
```bash
cd off-chain/transaction-builder
npx ts-node deploy-contracts.ts
```

The script is ready and will deploy campaign-lock along with other contracts, automatically updating `deployment/deployed-contracts-devnet.json` with actual code hash and tx hash values.

## Architecture Changes

### TransactionBuilder Class Signature

**Before:**
```typescript
constructor(
  client: ccc.Client,
  campaignContract: ContractInfo,
  pledgeContract: ContractInfo,
  pledgeLockContract: ContractInfo,
  receiptContract: ContractInfo
)
```

**After:**
```typescript
constructor(
  client: ccc.Client,
  campaignContract: ContractInfo,
  campaignLockContract: ContractInfo,    // NEW
  pledgeContract: ContractInfo,
  pledgeLockContract: ContractInfo,
  receiptContract: ContractInfo
)
```

This change is **breaking** for any code that directly instantiates TransactionBuilder. The factory function `createTransactionBuilder()` hides this change, so external callers using the factory are unaffected.

### Deployment Config Format

**Before:**
```json
{
  "campaign": {...},
  "pledge": {...},
  "pledgeLock": {...},
  "receipt": {...}
}
```

**After:**
```json
{
  "campaign": {...},
  "campaignLock": {...},      // NEW
  "pledge": {...},
  "pledgeLock": {...},
  "receipt": {...}
}
```

The `campaignLock` entry includes `hashType: "data"` which is correct for CKB lock scripts.

## Testing

- TypeScript compilation: ✓ No errors
- JSON validity: ✓ deployment config is valid JSON
- Deploy script structure: ✓ Properly handles campaign-lock binary path
- All verification checks: ✓ PASS

## What Happens Next

### Plan 05-03: Update createCampaign to Use Campaign-Lock

Will modify the `createCampaign()` method in TransactionBuilder to:
- Use campaign-lock as the lock script (instead of creator's secp256k1 lock)
- Set lock args to deadline block (per campaign-lock args format)
- Keep campaign type script as-is

### Plan 05-04: Implement Permissionless Distribution

Will add transaction building methods:
- `permissionlessRelease()`: Anyone can trigger after deadline if campaign succeeded
- `permissionlessRefund()`: Anyone can trigger after deadline if campaign failed
- Lock script enforces deadline via `since` field
- Receipt cells prove backer identity for refunds

### Plan 05-05: Update Frontend for Trustless Distribution

Will update campaign detail page to:
- Remove manual release/refund buttons (replaced by permissionless actions)
- Show automatic distribution status
- Display receipt cells owned by backer
- Update indexer to track receipt cells and merged pledges

## Deployment Readiness

**Current Status:** Ready for deployment when RISC-V toolchain is available.

**Deployment Checklist:**
- [ ] Install RISC-V toolchain (`riscv64-unknown-elf-gcc`)
- [ ] Compile campaign-lock: `cd contracts/campaign-lock && cargo build --target riscv64imac-unknown-none-elf --release`
- [ ] Run deploy script: `cd off-chain/transaction-builder && npx ts-node deploy-contracts.ts`
- [ ] Verify output: Check `deployment/deployed-contracts-devnet.json` for actual code hash and tx hash
- [ ] Verify transaction: Check devnet explorer for deployment tx hash
- [ ] Next step: Begin plan 05-03

## Files Modified

| File | Status | Change |
|------|--------|--------|
| `off-chain/transaction-builder/src/builder.ts` | Modified | Added campaignLockContract field, constructor param, getter method |
| `deployment/deployed-contracts-devnet.json` | Modified | Added campaignLock entry with placeholder values |
| `off-chain/transaction-builder/deploy-contracts.ts` | Modified | Added campaign-lock deployment step and env var outputs |
| `CAMPAIGN_LOCK_DEPLOYMENT.md` | Created | Deployment guide for campaign-lock |

## Verification

All plan requirements verified:

✓ Campaign-lock contract info available in TransactionBuilder
✓ Deployment config updated with campaign-lock entry
✓ Campaign-lock code hash (placeholder) in deployment config
✓ Transaction builder accepts campaignLockContract parameter
✓ Factory function passes campaignLockContract to constructor
✓ TypeScript compiles without errors
✓ Deploy script includes campaign-lock deployment step

## Notes

- Placeholder code hash (0x000...) will be replaced with actual hash when contract is deployed
- Campaign-lock is a **lock script** (not a type script) — it controls spending rights
- The script enforces deadline via CKB `since` field + absolute block number comparison
- Enables permissionless fund distribution: anyone can trigger after deadline, script validates timing
- Future plans (05-03 through 05-05) will implement the full v1.1 trustless distribution workflow

---

*Plan completed successfully. Campaign-lock contract integration is complete. Ready for deployment and transaction builder updates in Plan 05-03.*
