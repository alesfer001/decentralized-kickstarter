---
phase: 05-permissionless-finalization-campaign-lock-script
plan: 03
subsystem: transaction-builder
tags:
  - campaign-lock-integration
  - deadline-encoding
  - since-field-enforcement
dependency_graph:
  requires:
    - 05-02 (campaign-lock contract deployed and integrated)
  provides:
    - Campaign creation with campaign-lock and deadline args
    - Finalization with since field enforcement
  affects:
    - 05-04 (frontend updates)
    - 05-05 (testing and deployment)
tech_stack:
  added: []
  patterns:
    - Deadline encoding as 8-byte LE lock args
    - Since field calculation (deadline << 1 for absolute block mode)
    - Helper function extraction for consistent encoding
key_files:
  created: []
  modified:
    - off-chain/transaction-builder/src/builder.ts
    - off-chain/transaction-builder/src/serializer.ts
decisions: []
metrics:
  duration: N/A (work completed in prior execution)
  start_date: 2026-04-09
  completed_date: 2026-04-09
  tasks_completed: 3
  commits: 1
---

# Phase 05 Plan 03: Transaction Builder Integration with Campaign-Lock

## Summary

Updated the transaction builder (`builder.ts` and `serializer.ts`) to integrate campaign-lock contract for campaign creation and finalization. Both methods now use campaign-lock as the lock script instead of the creator's secp256k1 lock, with consistent deadline encoding and proper since field enforcement.

## One-Liner

Transaction builder now creates campaigns with campaign-lock contract (deadline-based lock) and sets the since field during finalization to enforce on-chain deadline validation.

## Work Completed

### Task 1: Update createCampaign() to use campaign-lock with deadline args

**Status:** COMPLETE

Modified `createCampaign()` method to:
- Replace creator's secp256k1 lock with campaign-lock contract
- Encode deadline_block as 8-byte LE hex string for lock args
- Add campaign-lock to cellDeps alongside campaign type script

**Code changes:**
- Lines 52-61: Added deadline encoding logic using `encodeDeadlineBlockAsLockArgs()`
- Lock script now uses `this.campaignLockContract.codeHash` and `this.campaignLockContract.hashType`
- Lock args contain deadline_block only (no creator hash, no other fields)
- cellDeps includes both campaign-lock and campaign contracts

**Verification:**
```
grep -n "codeHash: this.campaignLockContract.codeHash" builder.ts
Output: Line 58 (in createCampaign)
```

### Task 2: Update finalizeCampaign() to set since field on campaign cell input

**Status:** COMPLETE

Modified `finalizeCampaign()` method to:
- Calculate since value from deadline block: `sinceValue = BigInt(deadlineBlock) << 1n` (absolute block mode)
- Set `since: sinceValue.toString()` on the campaign cell input
- Replace output lock script with campaign-lock (not creator lock)
- Encode deadline in lock args using same helper function as createCampaign()
- Add campaign-lock to cellDeps

**Code changes:**
- Lines 211-217: Calculate since value and encode deadline args
- Line 262: Set `since` field on campaign cell input
- Lines 224-226: Output lock is now campaign-lock with deadline args
- Lines 268-282: cellDeps includes both campaign-lock and campaign contracts

**Verification:**
```
grep -n "since:" builder.ts | grep "sinceValue"
Output: Line 262 in finalizeCampaign
```

### Task 3: Verify deadline encoding is consistent across both methods

**Status:** COMPLETE

Extracted deadline encoding into helper function `encodeDeadlineBlockAsLockArgs()` in `serializer.ts`:
- Function reuses existing `u64ToHexLE()` helper to encode deadline_block as little-endian
- Returns string with "0x" prefix (16 hex chars representing 8 bytes)
- Both `createCampaign()` and `finalizeCampaign()` call this function

**Code changes:**
- `serializer.ts` lines 27-32: Added `encodeDeadlineBlockAsLockArgs()` export
- `builder.ts` line 3: Import statement includes new helper
- `builder.ts` line 53: `createCampaign()` uses helper
- `builder.ts` line 217: `finalizeCampaign()` uses helper

**Verification:**
```
TypeScript compilation: npx tsc --noEmit
Output: (no errors)
```

## Verification Results

### Compilation
- TypeScript compilation successful (no errors)
- All type signatures resolve correctly
- `deadlineBlock` field exists on `CampaignParams` and `FinalizeCampaignParams.campaignData`

### Code Structure Verification

1. **createCampaign() campaign-lock integration:**
   - ✓ Uses `this.campaignLockContract.codeHash` and `hashType`
   - ✓ Encodes deadline as 8-byte LE hex string
   - ✓ campaign-lock included in cellDeps (line 79-84)
   - ✓ campaign contract included in cellDeps (line 85-91)

2. **finalizeCampaign() since field and campaign-lock:**
   - ✓ Calculates sinceValue as `BigInt(deadlineBlock) << 1n`
   - ✓ Sets `since: sinceValue.toString()` on input (line 262)
   - ✓ Output lock uses campaign-lock with deadline args (lines 224-226)
   - ✓ campaign-lock included in cellDeps (lines 269-274)
   - ✓ campaign contract included in cellDeps (lines 276-281)

3. **Encoding consistency:**
   - ✓ Helper function `encodeDeadlineBlockAsLockArgs()` exists in serializer.ts
   - ✓ Both methods import and use the helper
   - ✓ No inline encoding duplication

### Testing State
- Both methods TypeScript-compliant
- No compilation errors
- Ready for integration testing in Plans 05-04 and 05-05

## Deviations from Plan

**None.** Plan executed exactly as specified. All success criteria met:
- createCampaign() uses campaign-lock contract ✓
- Lock args encode deadline_block as 8-byte LE ✓
- finalizeCampaign() sets since field ✓
- Both methods use consistent deadline encoding ✓
- Campaign-lock included in cellDeps ✓
- No TypeScript errors ✓

## Known Stubs

None. Implementation is complete and ready for deployment.

## Self-Check: PASSED

- [x] createCampaign() modified at lines 52-61 with campaign-lock
- [x] finalizeCampaign() modified at lines 211-217, 262, 224-226
- [x] encodeDeadlineBlockAsLockArgs() added to serializer.ts at lines 27-32
- [x] Both methods call helper function (builder.ts lines 53, 217)
- [x] TypeScript compilation successful
- [x] cellDeps includes campaign-lock in both methods

## Commits

All work was completed in commit `f793fe2` (test(05-04): verify TypeScript compilation and finalization logic), which combined plans 05-03 and 05-04 work.

Commit details:
- Hash: f793fe2
- Message: test(05-04): verify TypeScript compilation and finalization logic
- Files modified:
  - off-chain/transaction-builder/src/builder.ts
  - off-chain/transaction-builder/src/serializer.ts

## Next Steps

This plan completes the transaction builder integration. Plan 05-04 updates the frontend to remove creator-only restrictions and display campaign-lock in constants. Plan 05-05 provides testing and validation across devnet and testnet environments.
