---
quick_id: 260707-pt7
description: Phase 17.8 Issue 3 — pledge error state clears/revalidates on input change
date: 2026-07-07
status: complete
commit: f527365
---

# Quick Task 260707-pt7 — Summary

## What changed

`off-chain/frontend/src/app/campaigns/[id]/page.tsx` — pledge amount input `onChange` handler now clears `pledgeError` live when the user edits the input to a non-empty positive number. Comprehensive validation still runs at submit time.

## Why

yfeng2824 (community reviewer, GitHub issue #1) flagged the pledge error state as stale: invalid amount triggers an error, and correcting the amount leaves the error message rendered until submit/blur. This shipped during the grant proposal review window so reviewers clicking through the demo see the polished behavior.

## Verification

- Frontend build passes with no TypeScript errors.
- Manual smoke: enter invalid amount → error shows; edit to valid amount → error clears live.

## Commit

`f527365 fix(260707-pt7): add live validation to pledge input onChange to clear error state`

## Next

Phase 17.8 remaining fixes: Issue 4 (pledge wallet breakdown labeling, ~30min), Issue 2 (homepage status filter, ~1h), Issue 1 (deadline date picker, ~2-3h).
