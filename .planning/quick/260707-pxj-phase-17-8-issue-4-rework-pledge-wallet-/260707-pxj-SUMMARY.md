---
quick_id: 260707-pxj
description: Phase 17.8 Issue 4 — rework pledge wallet breakdown labels for clarity
date: 2026-07-07
status: complete
commit: c547aa1
---

# Quick Task 260707-pxj — Summary

## What changed

`off-chain/frontend/src/app/campaigns/[id]/page.tsx` — four labels in the pledge cost breakdown updated:

| Before | After |
|--------|-------|
| Pledge cell capacity: | Campaign pledge |
| Receipt cell (you keep): | Receipt cell you keep |
| Estimated tx fee: | Network fee |
| Wallet deduction: | Total locked |

Labeling-only. No math or logic changes.

## Why

yfeng2824 (community reviewer, GitHub issue #1) flagged the breakdown presentation as confusing: the receipt cell and required capacity read like an unexplained extra charge. Math was reconciled in Phase 17.7 (commit 70c0cc2). This fix reframes the presentation so users understand the receipt cell is capacity they keep, not a fee.

## Verification

- Frontend build passes (label-only change, no logic touched).
- Manual smoke: cost breakdown renders with new labels; totals unchanged.

## Commit

`c547aa1 feat(quick-260707-pxj): clarify cost breakdown labels in pledge form`

## Next

Phase 17.8 remaining: Issue 2 (homepage status filter, ~1h), Issue 1 (deadline date picker, ~2-3h).
