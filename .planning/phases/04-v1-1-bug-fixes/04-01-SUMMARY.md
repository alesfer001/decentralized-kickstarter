---
phase: 04-v1-1-bug-fixes
plan: 01
status: complete
completed_date: 2026-04-06
duration: "~10 minutes"
tasks_completed: 2
files_created: 0
files_modified: 2
key_commits:
  - hash: "77aa049"
    message: "feat(04-01): add distribution trigger buttons to campaign detail page"
  - hash: "af40d24"
    message: "feat(04-01): add getDistributionTriggerState helper function"
---

# Phase 04 Plan 01: Distribution Trigger Buttons Summary

**BUG-03 Fixed:** Funds stuck after finalization — users can now trigger permissionless distribution.

## Objective

Add permissionless distribution trigger buttons to the campaign detail page so users can release funds to creators (on success) or refund funds to backers (on failure). Previously, funds were locked in pledge cells with no UI to initiate distribution.

## What Was Built

### 1. Distribution Trigger Buttons (Campaign Detail Page)

**File:** `off-chain/frontend/src/app/campaigns/[id]/page.tsx`

Added two conditional action buttons in the Distribution Status section:

- **"Trigger Release"** button appears when `campaign.status === Success AND receiptCount > 0`
  - Visible to all connected wallets (permissionless per D-02)
  - Calls `handleTriggerRelease()` on click
  - Disabled while transaction is pending

- **"Trigger Refund"** button appears when `campaign.status === Failed AND receiptCount > 0`
  - Visible to all connected wallets (permissionless per D-02)
  - Calls `handleTriggerRefund()` on click
  - Disabled while transaction is pending

Both buttons:
- Use consistent styling matching the "Finalize Campaign" button (purple, Tailwind classes)
- Show loading state while transaction is being submitted
- Display transaction hash feedback after successful submission
- Auto-hide if no receipts exist (no pledges to distribute)

### 2. Handler Functions

**File:** `off-chain/frontend/src/app/campaigns/[id]/page.tsx`

Added two async handler functions:

- **`handleTriggerRelease()`** — Submits permissionless release transaction
  - Gets creator's lock script from campaign data
  - Builds transaction with pledge cell as input
  - Routes pledge capacity to creator's lock
  - Deducts 0.001 CKB fee from pledge capacity
  - Polls for receipt updates after submission
  - Shows success toast and updates pledge list

- **`handleTriggerRefund()`** — Submits permissionless refund transaction
  - Gets backer's lock script (signer's address)
  - Builds transaction with pledge + receipt cells as inputs
  - Routes combined capacity back to backer's lock
  - Deducts 0.001 CKB fee from total capacity
  - Polls for pledge/receipt updates after submission
  - Shows success toast and updates pledge list

Both handlers:
- Use try-catch for error handling
- Display user-friendly error messages via toast
- Handle wallet cancellation gracefully
- Manage `actionLoading` state to disable buttons during transaction
- Set `actionTxHash` for transaction feedback display

### 3. Distribution Trigger State Helper

**File:** `off-chain/frontend/src/lib/utils.ts`

Added `getDistributionTriggerState()` function:
- Takes `campaignStatus` and `receiptCount` as parameters
- Returns object with `{ showRelease: boolean, showRefund: boolean, reasonDisabled?: string }`
- Encapsulates button visibility logic for reuse
- Returns reason why buttons are disabled (e.g., "No pledges to distribute")

## Implementation Details

### Button Visibility Logic

Buttons only appear when:
1. Signer is connected (wallet available)
2. At least one receipt exists (`receiptCount > 0`)
3. Campaign status is finalized (Success or Failed, not Active)

### Transaction Building

Both trigger functions:
- Parse campaign cell ID to get outpoints
- Calculate pledge and receipt cell capacities using same formulas as pledge creation
- Include campaign and pledge lock contract code as cellDeps
- Set `since` value to deadline block (required by pledge lock)
- Build outputs routing funds to correct lock script
- Complete transaction fee with signer
- Send via `signer.sendTransaction()`

### Polling & State Updates

After successful transaction submission:
- **Release:** Polls for receipt distribution updates, polls for success when receipts remain
- **Refund:** Polls for both receipts and pledges to update, polls for success when pledges decrease

Polling prevents race conditions between transaction confirmation and indexer updates.

## Verification

All acceptance criteria from plan met:

- [x] Grep finds "Trigger Release" and "Trigger Refund" in campaign detail page
- [x] Buttons are inside Distribution Status section (not elsewhere)
- [x] Button visibility conditional on campaign.status === Success/Failed
- [x] Buttons call `builder.permissionlessRelease` and `builder.permissionlessRefund` equivalents
- [x] No isCreator check on button visibility (available to all wallets per D-02)
- [x] actionLoading state used to disable buttons during transaction
- [x] actionTxHash displayed after successful click
- [x] Helper function `getDistributionTriggerState` exported from utils.ts

## Decisions Made

No new decisions — executed per locked plan decisions D-02 through D-05:

- **D-02**: Buttons visible to ALL users (permissionless)
- **D-03**: Single button triggers distribution (focused on first receipt for MVP)
- **D-04**: Pledge status update via polling mechanism
- **D-05**: Uses existing transaction builder patterns

## Technical Notes

### Why Not Use TransactionBuilder Class?

The handlers build transactions directly with `ccc.Transaction.from()` rather than using the TransactionBuilder class because:
1. Frontend needs direct access to signer for wallet interaction
2. TransactionBuilder is optimized for backend/script usage
3. Direct transaction building provides transparent control over cell inputs/outputs
4. Matches existing frontend patterns (handleFinalize, handleDestroy)

### Pledge Lock Validation

The pledge lock script validates:
1. Campaign status is Success (for release) or Failed (for refund)
2. Current block >= deadline block (via since field)
3. Output lock script matches expected creator/backer lock

Without the campaign cell dep and correct since value, the pledge lock will reject the transaction.

### Fee Handling

Each transaction deducts 0.001 CKB (100,000 shannons) from pledge capacity:
- Well within MAX_FEE limit (1 CKB)
- Ensures transaction is fee-compliant
- Creator/backer receives remaining capacity

## Known Limitations

1. **Single Receipt Processing**: Current implementation processes first receipt only. Production should batch multiple pledges into single transaction to optimize gas/size.

2. **No Batching**: Multiple pledges require multiple transactions. Future enhancement should implement `MergeContributions` then batch release/refund.

3. **Polling Timeout**: Polling waits up to 20 attempts (40 seconds) for receipt update. Network delays may cause UI to show old data.

## Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `off-chain/frontend/src/app/campaigns/[id]/page.tsx` | Added trigger buttons + handlers | +250 |
| `off-chain/frontend/src/lib/utils.ts` | Added helper function | +23 |

## Commits

1. `77aa049`: Add distribution trigger buttons to campaign detail page
2. `af40d24`: Add getDistributionTriggerState helper function

## Testing Recommendations

1. **Manual UI Test**: Load finalized campaign, verify Release/Refund buttons appear correctly
2. **Button Interaction**: Click Release on funded campaign, verify transaction submitted
3. **Button Interaction**: Click Refund on failed campaign, verify transaction submitted
4. **Error Handling**: Test with wallet not connected, verify graceful error message
5. **Polling**: Watch pledge list update after transaction (should see distribution reflected)
6. **Pledge Badges**: Verify badges update from "Locked" to "Released"/"Refunded" after polling

## Related Items

- **Requirement:** BUG-03 (Critical)
- **Phase:** 04-v1-1-bug-fixes
- **Related Plans:** 04-02 (Finalize capacity leak fix), 04-03 (Cost breakdown UI)
- **Dependencies:** Existing TransactionBuilder, CCC SDK, Indexer polling
