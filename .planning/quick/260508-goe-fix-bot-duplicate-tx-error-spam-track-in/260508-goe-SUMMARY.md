---
quick_id: 260508-goe
description: Fix bot duplicate-tx error spam — track in-flight release/refund tx hashes
created_at: 2026-05-08T00:00:00Z
completed_at: 2026-05-08T00:00:00Z
status: completed
---

# Quick Task 260508-goe: Fix Bot Duplicate TX Error Spam

## Summary

Added in-flight transaction tracking to `FinalizationBot` to eliminate `PoolRejectedDuplicatedTransaction` error spam. The bot now skips re-submission of release/refund transactions for pledges that already have a pending transaction, and cleans up tracking when pledge cells disappear from the database.

## Changes Made

### Task 1: Add In-Flight TX Tracking to FinalizationBot

**File modified:** `off-chain/indexer/src/bot.ts`

#### Implementation Details

1. **Added `inFlightTxs` Map field** (line 47)
   - Private field tracking pledges with submitted txs
   - Key: pledgeId, Value: submitted tx hash
   - Initialized as empty Map in constructor

2. **Modified `releasePledgesForCampaign()` method** (lines 261-265, 308)
   - Added check before submission: skip if `this.inFlightTxs.has(pledge.id)`
   - Log action when skipping: `"Bot: Pledge {id} in-flight, skipping resubmission"`
   - After successful submission: store tx hash with `this.inFlightTxs.set(pledge.id, txHash)`

3. **Modified `refundPledgesForCampaign()` method** (lines 361-365, 408)
   - Identical pattern as release: check before submission, skip if in-flight
   - Log action when skipping: `"Bot: Pledge {id} in-flight, skipping resubmission"`
   - After successful submission: store tx hash with `this.inFlightTxs.set(pledge.id, txHash)`

4. **Added `cleanupInFlightTxs()` private method** (lines 428-438)
   - Removes entries for pledges no longer in database
   - Called once per polling cycle to clean up stale tracking
   - Logs action when removing: `"Bot: Cleared in-flight tx for pledge {id} (cell no longer exists)"`

5. **Added cleanup call in `processPendingFinalizations()`** (line 113)
   - Invokes cleanup after finalization check completes
   - Ensures stale entries are removed before next cycle

## Verification

**TypeScript Compilation:** Passed with no errors
```
npx tsc --noEmit
(no output = success)
```

**Code Pattern:** Follows existing `seenExpired` Set pattern for campaign expiration tracking

## Behavior Changes

### Before (v1.1 without fix)
- Pledge released successfully in cycle N with tx hash ABC
- Indexer polls again in cycle N+1, sees pledge still pending (not yet included in block)
- Bot submits same release tx again → `PoolRejectedDuplicatedTransaction` error in logs
- Error spam continues every 10 seconds until tx confirms

### After (with in-flight tracking)
- Pledge released successfully in cycle N with tx hash ABC
- Tracking records: `inFlightTxs.set("pledge-123", "ABC")`
- Indexer polls again in cycle N+1
- Bot detects pledge in inFlightTxs, logs `"Bot: Pledge pledge-123 in-flight, skipping resubmission"`, skips
- Error spam eliminated

### Cleanup Behavior
- If pledge cell gets confirmed and disappears from database:
  - Next polling cycle calls `cleanupInFlightTxs()`
  - Entry removed from tracking map
  - Logs: `"Bot: Cleared in-flight tx for pledge pledge-123 (cell no longer exists)"`
  - Released funds appear in creator's wallet

## Impact

- **Cosmetic fix:** Reduces misleading error spam in logs
- **No functional change:** Release/refund logic unchanged
- **No state change:** Pure in-memory tracking, no database modifications
- **Safe cleanup:** Stale entries removed automatically when pledges disappear
- **Testnet ready:** Can be deployed immediately for E2E verification

## Files Changed

| File                              | Lines | Change Type |
|-----------------------------------|-------|-------------|
| `off-chain/indexer/src/bot.ts`   | 37    | Modification |

## Commits

| Hash   | Message |
|--------|---------|
| e8929d5 | fix(260508-goe): add in-flight tx tracking to FinalizationBot to prevent duplicate submission errors |

## Testing Notes

To verify the fix works:

1. Start the indexer: `npm run dev` (off-chain/indexer)
2. Create a campaign and pledge(s) via frontend or test script
3. Wait for campaign to expire and finalize
4. Watch logs for release/refund submissions
5. Verify: First submission shows `"Bot: Released pledge {id}: {txHash}"`
6. Wait 10+ seconds (next polling cycle)
7. Verify: Logs show `"Bot: Pledge {id} in-flight, skipping resubmission"` (not submission again)
8. Confirm: NO `PoolRejectedDuplicatedTransaction` errors appear in logs

## Known Limitations

None. This is a straightforward in-memory tracking addition with automatic cleanup. No race conditions or edge cases identified.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] Files created/modified exist
- [x] TypeScript compilation passes
- [x] Code follows project conventions (naming, patterns)
- [x] Commit created with proper message format
- [x] In-flight tracking initialized in constructor
- [x] Release method skips in-flight pledges
- [x] Refund method skips in-flight pledges
- [x] Cleanup method implementation correct
- [x] Cleanup called in processPendingFinalizations()
- [x] Log messages match plan specification

PASSED
