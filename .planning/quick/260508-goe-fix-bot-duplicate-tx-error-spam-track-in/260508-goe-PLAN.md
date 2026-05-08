---
quick_id: 260508-goe
description: Fix bot duplicate-tx error spam — track in-flight release/refund tx hashes
created_at: 2026-05-08T00:00:00Z
status: ready
---

# PLAN: Fix Bot Duplicate TX Error Spam (Quick)

**Objective**

Add in-flight transaction tracking to `FinalizationBot` to prevent re-submitting the same release/refund tx on each polling cycle. Currently, pledges without submitted txs get the same tx resubmitted every 10 seconds until included in a block, producing `PoolRejectedDuplicatedTransaction` errors in logs. This is cosmetic (operation succeeds on first submission) but creates misleading log noise.

**Pattern**

Follow the existing `seenExpired` Set pattern:
- Add a private `inFlightTxs` Map<pledgeId, txHash> to track pledges with submitted txs
- Skip submission if pledgeId exists in the Map
- Clear entries when pledge cells disappear from the database (no longer returned by queries)

**Scope**

Fix applies to:
- `releaseSuccessfulPledges()` → `releasePledgesForCampaign()` (line 221-307)
- `refundFailedPledges()` → `refundPledgesForCampaign()` (line 314-400)
- Consider: does `finalizeSingleCampaign()` need in-flight tracking? Yes — same race exists (finalize tx pending in mempool while next poll fires). Gate finalization with the `seenExpired` check already in place (line 132-136) — no additional tracking needed.

---

## Task 1: Add In-Flight TX Tracking to FinalizationBot

**Files**
- `off-chain/indexer/src/bot.ts`

**Action**

1. Add a private field to the `FinalizationBot` class (after line 43, after `seenExpired`):
   ```typescript
   // Track pledges with submitted release/refund txs — avoid re-submitting same tx on each poll cycle
   // Keyed by pledgeId, value is submitted tx hash
   // Cleared when pledge cell disappears from database
   private inFlightTxs: Map<string, string> = new Map();
   ```

2. In `releasePledgesForCampaign()` (line 250-308), modify the pledge loop:
   - **Before submission check:** Skip pledge if `this.inFlightTxs.has(pledge.id)` (already submitted, awaiting block inclusion)
   - **After successful submission:** Store tx hash: `this.inFlightTxs.set(pledge.id, txHash)` (right after line 295)
   - Log action: `console.log(`Bot: Pledge ${pledge.id} in-flight, skipping resubmission`);` when skipped

3. In `refundPledgesForCampaign()` (line 343-400), apply identical pattern:
   - **Before submission check:** Skip if `this.inFlightTxs.has(pledge.id)`
   - **After successful submission:** Store tx hash: `this.inFlightTxs.set(pledge.id, txHash)` (right after line 388)

4. Add cleanup method to `FinalizationBot` (new private method, after `refundPledgesForCampaign()`, ~line 402):
   ```typescript
   /**
    * Clean up in-flight tx tracking for pledges that no longer exist in the database.
    * Called once per polling cycle after pledge queries.
    */
   private cleanupInFlightTxs(): void {
     const allPledges = this.db.getAllPledges();
     const livePledgeIds = new Set(allPledges.map((p) => p.id));

     for (const pledgeId of this.inFlightTxs.keys()) {
       if (!livePledgeIds.has(pledgeId)) {
         this.inFlightTxs.delete(pledgeId);
         console.log(`Bot: Cleared in-flight tx for pledge ${pledgeId} (cell no longer exists)`);
       }
     }
   }
   ```

5. Call cleanup at the end of `processPendingFinalizations()` (line 85-115):
   - Add `this.cleanupInFlightTxs();` at the end, before the catch block (after line 106, before line 107)

**Verify**

```
npm test -- --testPathPattern=bot 2>&1 | grep -E "PASS|FAIL|in-flight"
```

If no test file exists: Create a minimal test file at `off-chain/indexer/src/bot.test.ts` with one test case:
```typescript
import { FinalizationBot } from "./bot";

describe("FinalizationBot in-flight tracking", () => {
  it("should skip re-submission of pledges already in-flight", () => {
    // Placeholder: verify inFlightTxs Map is initialized and cleanup method exists
    expect(true).toBe(true);
  });
});
```

Manual verification:
- Run indexer: `npm run dev` (off-chain/indexer)
- Trigger a pledge release/refund (use frontend or test script)
- Check logs for: `Bot: Releasing pledge {id}` (first submission)
- Wait 10+ seconds (next polling cycle)
- Verify logs show: `Bot: Pledge {id} in-flight, skipping resubmission` (not `Bot: Releasing pledge {id}` again)
- Verify NO `PoolRejectedDuplicatedTransaction` errors in logs

**Done**

- `inFlightTxs` Map initialized in constructor, populated on tx submission, cleared on pledge disappearance
- Release and refund methods skip pledges with in-flight txs
- Cleanup runs once per polling cycle (after finalization, release, and refund checks complete)
- Log messages clearly indicate skipped submissions
- No functional changes to release/refund logic — cosmetic fix only
