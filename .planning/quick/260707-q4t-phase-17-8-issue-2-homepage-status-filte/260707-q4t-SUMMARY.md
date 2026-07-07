---
quick_id: 260707-q4t
description: Phase 17.8 Issue 2 — homepage status filter tabs + rename Failed to Unsuccessful
date: 2026-07-07
status: complete
commit: 3e1062a
---

# Quick Task 260707-q4t — Summary

## What changed

**Homepage filter tabs (`off-chain/frontend/src/app/page.tsx`):**
- Added 5 tabs above the campaign grid: `All | Active | Funded | Unsuccessful | Expired`
- Client-side filter mapping to effective status (accounts for on-chain status + deadline vs current block)
- Default tab: All

**User-facing rename Failed → Unsuccessful:**
- `off-chain/frontend/src/lib/utils.ts` — `getStatusLabel()` and `getEffectiveStatusLabel()` return "Unsuccessful"
- `off-chain/frontend/src/app/campaigns/[id]/page.tsx` — finalization message wording

**Preserved:** `CampaignStatus.Failed` enum value, internal "failed" strings, on-chain code paths.

## Why

yfeng2824 (community reviewer, GitHub issue #1) flagged the homepage as hard to scan with no way to narrow by status, and "Failed" as harsh wording for a campaign that didn't hit its goal. Both fixed for the grant proposal review window.

## Verification

- `npm run build` passes with no TypeScript errors.
- Manual smoke: all 5 tabs filter the grid correctly; "Unsuccessful" label appears where "Failed" used to.

## Commit

`3e1062a feat(260707-q4t): add homepage status filter tabs and rename Failed → Unsuccessful`

## Next

Phase 17.8 remaining: Issue 1 (deadline date/date-time picker, ~2-3h).
