# Phase 4: v1.1 Bug Fixes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 04-v1-1-bug-fixes
**Areas discussed:** Distribution trigger UI, Capacity routing, Cost breakdown UX, Permissionless finalization, Backer count source
**Mode:** --auto (all decisions auto-selected)

---

## Distribution Trigger UI

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in Distribution Status section | Buttons appear within existing distribution summary area | ✓ |
| Separate action bar | New action section below distribution status | |
| Modal confirmation | Trigger via confirmation dialog | |

**User's choice:** [auto] Inline in Distribution Status section (recommended default)
**Notes:** Buttons visible to all users (permissionless). Single trigger for all pledges.

---

## Capacity Routing

| Option | Description | Selected |
|--------|-------------|----------|
| Add creator change cell output | Excess capacity goes to explicit creator output cell | ✓ |
| Preserve original capacity in campaign cell | Keep all capacity in finalized campaign cell | |

**User's choice:** [auto] Add creator change cell output (recommended default)
**Notes:** Creator shouldn't lose capacity just because they created a campaign.

---

## Cost Breakdown UX

| Option | Description | Selected |
|--------|-------------|----------|
| Below pledge input, live update | Shows breakdown as user types amount | ✓ |
| Pre-confirmation dialog | Shows breakdown after submit, before wallet | |
| Tooltip/info icon | Hover to see breakdown | |

**User's choice:** [auto] Below pledge input, live update (recommended default)
**Notes:** Immediate feedback is best UX — no surprises.

---

## Permissionless Finalization

| Option | Description | Selected |
|--------|-------------|----------|
| Custom campaign lock script | New lock allowing permissionless finalization post-deadline | ✓ |
| Creator-only with UI workaround | Keep current behavior, make button creator-visible only | |

**User's choice:** [auto] Custom campaign lock script (recommended default)
**Notes:** This is the ideal solution but requires contract changes + redeployment. D-13 provides fallback.

---

## Backer Count Source

| Option | Description | Selected |
|--------|-------------|----------|
| Pledges + receipts (unique backers) | Count from both data sources | ✓ |
| Pledges only | Current behavior | |
| Receipts only | After distribution | |

**User's choice:** [auto] Pledges + receipts (recommended default)
**Notes:** Covers all lifecycle states accurately.

---

## Claude's Discretion

- Error handling and loading states for trigger buttons
- Exact styling within Distribution Status section
- Auto-refresh vs manual refresh after distribution

## Deferred Ideas

None
