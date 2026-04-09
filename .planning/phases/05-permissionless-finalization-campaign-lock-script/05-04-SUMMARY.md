---
phase: 05-permissionless-finalization-campaign-lock-script
plan: 04
subsystem: frontend
tags: [finalization, permissionless, ui]
dependency_graph:
  requires:
    - 05-03 (transaction builder campaign-lock integration)
  provides:
    - Frontend UI ready for permissionless finalization
  affects:
    - Campaign detail page finalization button visibility
tech_stack:
  added: []
  patterns:
    - Conditional rendering based on campaign status and deadline
    - permissionless UI patterns (any user can trigger finalize)
key_files:
  created: []
  modified:
    - off-chain/frontend/src/lib/constants.ts
    - off-chain/frontend/src/app/campaigns/[id]/page.tsx
decisions:
  - D-14: Finalize button shown to all users (not just creator) when campaign expired
  - D-15: Campaign-lock contract code hash added to frontend constants for future use
metrics:
  duration: ~5 minutes
  completed_date: "2026-04-10"
  tasks_completed: 3
  files_modified: 2
---

# Phase 05 Plan 04: Frontend Permissionless Finalization UI Summary

**One-liner:** Removed creator-only restriction from campaign finalize button, enabling any user to trigger on-chain finalization for expired campaigns.

## Objective

Update frontend to support permissionless campaign finalization by removing the isCreator check from the finalize button visibility logic. The finalization button now shows to all users when a campaign is expired and still in Active status.

## Changes Made

### Task 1: Add campaign-lock code hash to frontend constants
**File:** `off-chain/frontend/src/lib/constants.ts`

- Added `campaignLock` to `ContractsConfig` interface (line 31)
- Defined `CAMPAIGN_LOCK_CODE_HASH` constant with environment variable fallback (line 45-47)
- Added campaign-lock entry to devnet defaults in `buildNetworkContracts()` (line 59, 62, 82-86)
- Campaign-lock contract info now available at `CONTRACTS.campaignLock` with codeHash, hashType, txHash, index
- Ready for integration with transaction builder's campaign-lock functions

**Commit:** `3aa039a` - feat(05-04): add campaign-lock contract code hash to frontend constants

### Task 2: Remove isCreator check from finalize button visibility
**File:** `off-chain/frontend/src/app/campaigns/[id]/page.tsx`

- Added `canFinalize` variable (line 760) for cleaner permissionless finalization check
  - `canFinalize = needsFinalization && campaign.status === CampaignStatus.Active`
- Updated Actions section visibility condition (line 1099) to use `canFinalize` instead of `needsFinalization || isCreator`
- Changed finalize button rendering (line 1114) from conditional creator check to unconditional when `canFinalize` is true
- Removed creator-only message: "Currently, only the campaign creator can finalize..."
- Finalize button now appears to ALL users when:
  - Campaign status is Active
  - Current block >= campaign deadline block
  - Signer is connected
- Button hidden when:
  - Campaign not expired
  - Campaign already finalized (status != Active)
  - No wallet connected

**Commit:** `5342d5c` - feat(05-04): remove creator-only restriction from finalize button

### Task 3: Verify TypeScript compilation and no visual regressions
**Validation completed:**

- Frontend builds successfully with `npm run build` (0 TypeScript errors)
- Campaign type includes `deadlineBlock: string` field (types.ts line 17)
- `canFinalize` variable properly typed as boolean
- Finalize button logic verified: no isCreator check present for finalization
- Destroy campaign button still correctly retains `isCreator` check (creator-only action)
- No visual regressions: button styling and layout unchanged

**Commit:** `f793fe2` - test(05-04): verify TypeScript compilation and finalization logic

## Verification

### Must-Haves Checklist

- [x] Finalize button is visible to all users (not just creator) when campaign is expired and active
- [x] Frontend imports and exports campaign-lock contract code hash from constants
- [x] isCreator check removed from finalization button visibility logic
- [x] Button label clearly indicates finalization: "Finalize Campaign"

### Artifact Verification

- [x] **off-chain/frontend/src/app/campaigns/[id]/page.tsx**
  - Contains "Finalize" button text ✓ (line 1127)
  - Contains `currentBlock >= campaign.deadlineBlock` logic ✓ (line 756)
  - No isCreator check for finalization ✓

- [x] **off-chain/frontend/src/lib/constants.ts**
  - Exports `campaignLock` in CONTRACTS object ✓ (line 31, 82-86)
  - Contains codeHash, hashType, txHash, index ✓

### Key Links Verification

- [x] campaigns/[id]/page.tsx → finalization button visibility via `currentBlock >= campaign.deadlineBlock` check ✓
- [x] constants.ts → campaign-lock code hash via `CONTRACTS.campaignLock` ✓

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None encountered.

## Ready for Testing

Frontend is ready for devnet E2E testing in Plan 05:
- Campaign finalization can now be triggered by any user via web UI
- No creator restriction enforced by frontend
- Campaign-lock contract reference available for future integration
- All TypeScript checks pass

## Known Stubs

None - finalization logic fully implemented for permissionless execution.
