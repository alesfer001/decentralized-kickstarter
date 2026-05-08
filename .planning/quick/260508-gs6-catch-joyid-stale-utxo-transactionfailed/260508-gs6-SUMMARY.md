---
quick_id: 260508-gs6
title: Catch JoyID stale-UTXO TransactionFailedToResolve errors on pledge submit
status: completed
date_completed: 2026-05-08
duration_minutes: 8
work_focus: frontend
files_modified:
  - off-chain/frontend/src/app/campaigns/[id]/page.tsx
commits:
  - hash: 1e0f7d6
    message: fix(260508-gs6): catch JoyID stale-UTXO errors and auto-retry pledge submission
---

# Quick Task 260508-gs6 Summary

## Objective

Detect JoyID's stale-UTXO error when rapid back-to-back pledges occur, show a user-friendly message ("Wallet cells are syncing — please refresh the page and retry"), and automatically retry the pledge submission once after a short delay.

## Solution

Added two helper functions to `off-chain/frontend/src/app/campaigns/[id]/page.tsx`:

1. **`isJoyIDStaleUTXOError(error)`** — Detects the specific error pattern by checking for both:
   - "TransactionFailedToResolve" in the error message
   - "Unknown(OutPoint(" substring indicating an unresolved input cell

2. **`sendTransactionWithAutoRetry(signer, tx, toast)`** — Wraps `signer.sendTransaction()` with intelligent retry logic:
   - First attempt: tries to send the transaction
   - On stale-UTXO error: waits 2 seconds for wallet cells to sync, then retries once
   - On retry failure with same error: shows friendly toast message and throws
   - Other errors: thrown immediately without retry

Replaced the direct `signer.sendTransaction(tx)` call in `handlePledge()` (line 277) with `sendTransactionWithAutoRetry(signer, tx, toast)`.

## Implementation Details

- **Error detection:** Matches pattern `TransactionFailedToResolve: Resolve failed Unknown(OutPoint(...))`
- **Retry delay:** 2 seconds (typical JoyID wallet sync latency)
- **Retry count:** 1 (single automatic retry, no loop)
- **User messaging:** Friendly "Wallet cells are still syncing. Please refresh the page and retry." toast shown only if auto-retry also fails
- **Backward compatibility:** All other error types flow through existing error handling (lines 340-348), no behavioral changes to non-stale-UTXO errors

## Verification

- **Build:** Next.js `npm run build` passes without TypeScript errors
- **Type safety:** Toast function signature correctly typed as `(type: "success" | "error" | "info" | "warning", message: string) => void`
- **Runtime:** No syntax errors; component still loads

## Notes

- No changes to other transaction handlers (finalize, release, refund, destroy) at this time — pledge is the primary UX issue per bug report
- The auto-retry wrapper can be reused in future quick tasks if stale-UTXO errors occur during other operations
- Existing error handling for "rejected" and "disconnected" errors is preserved

## Deviations from Plan

None — plan executed exactly as written.
