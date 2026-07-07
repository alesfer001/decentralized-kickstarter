---
phase: quick-260707-pxj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - off-chain/frontend/src/app/campaigns/[id]/page.tsx
autonomous: true
requirements:
  - PHASE-17.8-ISSUE-4
must_haves:
  truths:
    - "Pledge form cost breakdown shows clear labels that distinguish the actual pledge amount from capacity overhead"
    - "Users understand receipt cell capacity is returned to them (not a fee)"
    - "Network fee is clearly separated from capacity costs"
    - "Total cost is clearly labeled as 'Total locked' not 'Wallet deduction'"
  artifacts:
    - path: off-chain/frontend/src/app/campaigns/[id]/page.tsx
      provides: Cost breakdown UI labels (lines 900-927)
      labels:
        - "Campaign pledge" instead of "Pledge cell capacity"
        - "Receipt cell you keep" (refactor from "Receipt cell (you keep)")
        - "Network fee" instead of "Estimated tx fee"
        - "Total locked" instead of "Wallet deduction"
  key_links:
    - from: cost breakdown display
      to: calculateCostBreakdown() function
      via: formatted output display
      pattern: breakdown\.(pledgeCellCapacity|receiptCellCapacity|estimatedFee|totalCost)
---

<objective>
Rework the pledge form cost breakdown labels to eliminate user confusion about capacity costs.

Purpose: Phase 17.7 reconciled the cost estimator math (commit 70c0cc2), but the labels still confuse users — receipt cell and other capacity look like unexplained extra charges on top of the pledge amount.

Output: Updated labels in cost breakdown section that clearly separate pledge amount, receipt capacity (you keep), and network fee, with total properly labeled as "Total locked".
</objective>

<execution_context>
@/Users/ayoublesfer/Documents/Dev/decentralized-kickstarter/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayoublesfer/Documents/Dev/decentralized-kickstarter/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@off-chain/frontend/src/app/campaigns/[id]/page.tsx (lines 900-927: cost breakdown)
@docs/ProjectPlan.md (line 1523: desired label model)

## Current Labels (lines 900-927)
```
- "Pledge cell capacity:" 
- "Receipt cell (you keep):"
- "Estimated tx fee:"
- "Wallet deduction:"
```

## Desired Labels (ProjectPlan.md §1523)
```
- "Campaign pledge" — the actual pledge amount
- "Receipt cell you keep" — capacity locked in receipt (user keeps)
- "Other required capacity" — optional, any remaining overhead
- "Network fee" — CKB transaction fee
- "Total locked" — sum locked from wallet
```
</context>

<tasks>

<task type="auto">
  <name>Task: Update cost breakdown labels for clarity</name>
  <files>off-chain/frontend/src/app/campaigns/[id]/page.tsx</files>
  <action>
In the cost breakdown section (lines 900-927 of off-chain/frontend/src/app/campaigns/[id]/page.tsx), update the four label rows to match the ProjectPlan.md desired model:

1. Line 908 "Pledge cell capacity:" → "Campaign pledge"
2. Line 912 "Receipt cell (you keep):" → "Receipt cell you keep"  
3. Line 916 "Estimated tx fee:" → "Network fee"
4. Line 920 "Wallet deduction:" → "Total locked"

These are label-only changes. Do NOT modify calculateCostBreakdown() function, breakdown property names, or any calculation logic. The math from Phase 17.7 (commit 70c0cc2) is correct — only the display labels change.

The goal is to make users understand:
- The pledge amount (what goes to the campaign)
- The receipt cell capacity (what they keep and can recover)
- The network fee (what blockchain costs)
- The total deduction from their wallet
  </action>
  <verify>
Open off-chain/frontend/src/app/campaigns/[id]/page.tsx and confirm:
- Line 908 shows "Campaign pledge" (not "Pledge cell capacity")
- Line 912 shows "Receipt cell you keep" (not with parentheses)
- Line 916 shows "Network fee" (not "Estimated tx fee")
- Line 920 shows "Total locked" (not "Wallet deduction")
  </verify>
  <done>
Cost breakdown labels updated in pledge form. All four rows use new terminology that clearly separates pledge amount, receipt capacity user keeps, and network fee. File committed.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User → Frontend Display | User reads cost breakdown labels and makes pledge decision |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-17.8-04-01 | Information | Cost breakdown labels | mitigate | Labels accurately reflect cost components without exaggeration; "you keep" clarifies receipt cell is user asset, not fee |

</threat_model>

<verification>
Cost breakdown labels in pledge form sidebar correctly distinguish pledge amount, receipt capacity, and fees. User can accurately estimate total wallet deduction before transaction submission.
</verification>

<success_criteria>
1. All four cost breakdown labels updated per desired model
2. "Campaign pledge" shown for the pledge cell capacity
3. "Receipt cell you keep" clearly indicates user retains this capacity
4. "Network fee" separates blockchain transaction cost
5. "Total locked" replaces confusing "Wallet deduction" terminology
6. No changes to calculateCostBreakdown() or calculation logic
7. File committed to git
</success_criteria>

<output>
After completion, create `.planning/quick/260707-pxj-phase-17-8-issue-4-rework-pledge-wallet-/260707-pxj-SUMMARY.md`
</output>
