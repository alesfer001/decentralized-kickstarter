---
quick_id: 260707-qbf
description: Phase 17.8 Issue 1 — replace deadline block-number input with datetime picker
date: 2026-07-07
status: complete
commit: 388ab3e
---

# Quick Task 260707-qbf — Summary

## What changed

**`off-chain/frontend/src/lib/utils.ts`:**
- Added `datetimeToBlockNumber()` — converts a datetime-local value to an estimated CKB block number using ~10s/block, enforcing a 1-hour minimum floor.
- Added `blockNumberToDatetime()` — reverse conversion for reference/testing.

**`off-chain/frontend/src/app/campaigns/new/page.tsx`:**
- Replaced raw `type="number"` block-number input with `type="datetime-local"` picker.
- Renamed form state `deadlineBlocks` → `deadlineDateTime`.
- Validation enforces ≥1 hour minimum.
- Helper text under the picker shows current tip block and estimated deadline block once a datetime is selected.
- On submit, datetime is converted to block number before transaction building.
- No changes to campaign detail page (already renders humanly).

## Why

yfeng2824 (community reviewer, GitHub issue #1) flagged the block-number input as blockchain jargon that non-technical creators can't reason about. Fix removes the jargon from the creator flow while keeping the on-chain deadline as a block number.

## Verification

- `npm run build` passes with no TypeScript or React errors.
- Manual smoke: picker renders; helper text shows current + estimated deadline block; submit produces a correct block-number transaction.

## Commit

`388ab3e feat(260707-qbf): replace deadline block-number input with datetime picker`

## Next

Phase 17.8 complete — all 4 yfeng2824 UX fixes shipped. Update yfeng on GitHub issue #1, then move on to grant-proposal posting or await Neon/Scalebit.
