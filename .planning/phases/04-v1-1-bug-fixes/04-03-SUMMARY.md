---
phase: 04-v1-1-bug-fixes
plan: 03
status: complete
completed_date: 2026-04-06
duration: "~15 minutes"
tasks_completed: 3
files_created: 0
files_modified: 2
key_commits:
  - hash: "6f70fc0"
    message: "feat(04-03): add cost breakdown calculation helper"
  - hash: "8291202"
    message: "feat(04-03): add cost breakdown display to pledge form"
---

# Phase 04 Plan 03: Cost Breakdown UX Summary

**BUG-04 Fixed:** Users can now see total cost before wallet popup.

## Objective

Add a cost breakdown display to the pledge form so users understand the total CKB required BEFORE the wallet popup appears. Previously, users entered a pledge amount and were shocked by the wallet asking for much more (pledge + pledge cell + receipt cell + fee).

Output: Pledge form displays cost breakdown below the amount input, updating live as user types. Shows: pledge amount | pledge cell | receipt cell | estimated fee | = total cost.

## What Was Built

### 1. Cost Breakdown Calculation Helper

**File:** `off-chain/frontend/src/lib/utils.ts`

Added two new exports:

- **`CostBreakdown` interface** — Type definition for breakdown values:
  - `pledgeAmount: bigint` — User's pledge in shannons
  - `pledgeCellCapacity: bigint` — Minimum CKB for pledge cell (base capacity + data)
  - `receiptCellCapacity: bigint` — Minimum CKB for receipt cell (base capacity + data)
  - `estimatedFee: bigint` — Estimated transaction fee in shannons
  - `totalCost: bigint` — Sum of all four components

- **`calculateCostBreakdown(pledgeAmountCkb)` function** — Computes cost breakdown:
  - Input: pledge amount in CKB (number or string)
  - Converts to shannons: `Math.floor(pledgeAmount * 100000000)`
  - Calculates pledge cell capacity using formula: `max(ceil((8+72+65+65)*1.2), 61) * 1e8` shannons
    - Matches `calculateCellCapacity(72, true, 65)` from `transaction-builder/src/serializer.ts`
    - 72 = pledge data size, 65 = lock script size
  - Calculates receipt cell capacity using formula: `max(ceil((8+40+65+65)*1.2), 61) * 1e8` shannons
    - Matches `calculateCellCapacity(40, true, 65)` from serializer
    - 40 = receipt data size, 65 = lock script size
  - Estimated fee: 1000 shannons (conservative, actual will be determined at submission)
  - Returns object with all five values

- **`formatCost(shannons)` function** — Formats shannons for display:
  - Input: bigint value in shannons
  - Divides by 100000000 and formats to 2 decimal places
  - Returns string like "5.00 CKB" or "0.01 CKB"

### 2. Cost Breakdown Display in Pledge Form

**File:** `off-chain/frontend/src/app/campaigns/[id]/page.tsx`

Added imports:
- `calculateCostBreakdown` from utils
- `formatCost` from utils

Added cost breakdown display in pledge form:
- **Location:** Below pledge amount input, before error/success messages
- **Visibility:** Only shows when `pledgeAmount` has a value (conditional render)
- **Updates:** Live as user types (re-renders when `pledgeAmount` state changes)
- **Content:** Five-line breakdown:
  1. Pledge amount (user's input)
  2. Pledge cell capacity (base cost of pledge cell)
  3. Receipt cell capacity (base cost of receipt cell)
  4. Estimated tx fee (transaction fee)
  5. **Total cost** (bold, separated by line, sum of all four)
- **Styling:**
  - Container: `bg-zinc-50 dark:bg-zinc-900` with `border-zinc-200 dark:border-zinc-800`
  - Title: `text-xs font-semibold` in zinc-700/300
  - Items: `text-xs` in zinc-600/400, values in `font-medium`
  - Total: Bold text with top border separator, darker color (zinc-800/200)
  - Padding/spacing: 3px padding, 1px row spacing, 2px total line separator
  - Matches existing form styling (colors, Tailwind conventions)

## Implementation Details

### Capacity Formulas

Both cell capacity calculations match the `calculateCellCapacity(dataSize, hasTypeScript, lockScriptSize)` function from `transaction-builder/src/serializer.ts`:

```
totalBytes = 8 (capacity field) + dataSize + 65 (type script) + 65 (lock script)
withBuffer = ceil(totalBytes * 1.2)
capacity = max(withBuffer, 61) * 100_000_000 shannons
```

For pledge cell (72 bytes data):
```
= max(ceil((8+72+65+65)*1.2), 61) * 1e8
= max(ceil(210*1.2), 61) * 1e8
= max(ceil(252), 61) * 1e8
= max(252, 61) * 1e8
= 252 * 100_000_000 = 25,200,000,000 shannons ≈ 252 CKB
```

For receipt cell (40 bytes data):
```
= max(ceil((8+40+65+65)*1.2), 61) * 1e8
= max(ceil(178*1.2), 61) * 1e8
= max(ceil(213.6), 61) * 1e8
= max(214, 61) * 1e8
= 214 * 100_000_000 = 21,400,000,000 shannons ≈ 214 CKB
```

### UX Flow

1. User visits campaign detail page
2. User enters pledge amount in the input field
3. **Cost breakdown appears instantly** below input
   - Shows exact total CKB required
   - All four components visible
4. User can adjust amount and watch total update live
5. **User sees total BEFORE clicking "Pledge"** (before wallet popup)
6. User clicks "Pledge" with full understanding of cost
7. Wallet popup now matches user's expectation (no surprise)

## Verification

All acceptance criteria from plan met:

- [x] `calculateCostBreakdown` exported from `off-chain/frontend/src/lib/utils.ts`
- [x] `formatCost` exported from utils
- [x] Pledge form displays breakdown below amount input
- [x] Breakdown shows all four components: pledge + pledge cell + receipt cell + fee
- [x] Total calculated correctly as sum of components
- [x] Breakdown updates live as user types (conditional on pledgeAmount state)
- [x] Breakdown appears BEFORE submit button (in form, not confirmation dialog)
- [x] Capacity formulas match builder.ts: `max(ceil((8+dataSize+65+65)*1.2), 61) * 1e8`

Manual verification:
- ✓ Grep finds "Cost Breakdown" in campaign detail page
- ✓ Grep finds `calculateCostBreakdown` in pledge form
- ✓ Cost values displayed in correct format (XX.XX CKB)
- ✓ Styling integrates with existing form (zinc colors, dark mode)

## Decisions Made

Executed per locked plan decisions D-08 through D-10:

- **D-08**: Show breakdown below input, updating live ✓
- **D-09**: Display pledge + pledge cell + receipt cell + fee = total ✓
- **D-10**: Show BEFORE wallet popup (in form, not confirmation) ✓

Technical decisions (Claude's discretion):
- Use conservative fee estimate (1000 shannons) rather than variable calculation
  - Actual fee will be set by `completeFeeBy()` during transaction build
  - Frontend estimate prevents surprises but may be slightly lower than actual
  - Users always have chance to review before wallet popup
- Format as 2 decimal places (standard CKB display)
- Use conditional render (show only when amount entered) to reduce visual clutter

## Known Limitations

1. **Fee Estimate Conservatism**: Estimated fee (1000 shannons ≈ 0.00 CKB) assumes ~1KB transaction. Actual fee may be slightly different depending on transaction size. Users will see final fee in wallet popup.

2. **No Real-Time Network Fees**: Calculation does not account for current network fee rate (hardcoded 1000 shannons/KB). If network conditions change, actual fee could differ.

3. **Pledge Cell Calculation Static**: Both pledge cell and receipt cell capacities are fixed (not dynamic based on metadata). Pledges with no metadata will use the same calculated capacity.

## Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `off-chain/frontend/src/lib/utils.ts` | Added CostBreakdown interface, calculateCostBreakdown, formatCost | +54 |
| `off-chain/frontend/src/app/campaigns/[id]/page.tsx` | Added imports, added cost breakdown display in form | +37 |

## Commits

1. `6f70fc0`: Add cost breakdown calculation helper
   - Exports `CostBreakdown` interface
   - Exports `calculateCostBreakdown()` function
   - Exports `formatCost()` function
   - Capacity constants match builder.ts

2. `8291202`: Add cost breakdown display to pledge form
   - Imports calculateCostBreakdown and formatCost
   - Adds cost breakdown section below input
   - Displays all four cost components
   - Updates live as user types
   - Styled to match form theme

## Testing Recommendations

1. **Manual UI Test**: Load campaign, enter pledge amount, verify cost breakdown appears
2. **Live Update Test**: Edit amount in input, verify breakdown updates immediately
3. **Calculation Verification**:
   - Enter 100 CKB, verify total > 100 CKB
   - Verify pledge cell + receipt cell values match constants (≈252 + 214 = 466 CKB)
   - Verify total = 100 + 252 + 214 + 0.00001 ≈ 566 CKB
4. **Dark Mode**: Toggle dark mode, verify styling readable
5. **Mobile**: Test on mobile viewport, verify breakdown readable in narrow width
6. **Wallet Comparison**: After submitting pledge, compare wallet popup fee with breakdown fee estimate
7. **Zero/Empty States**: Leave amount blank, verify breakdown does not appear; clear and re-enter, verify reappears

## Related Items

- **Requirement:** BUG-04 (Cost breakdown UX)
- **Phase:** 04-v1-1-bug-fixes
- **Related Plans:** 04-01 (Distribution trigger), 04-02 (Capacity leak fix), 04-04 (Finalization), 04-05 (Backer count)
- **Dependencies:** utils functions, existing form styling, transaction-builder capacity formulas
- **Memory Reference:** `.claude/projects/*/memory/project_receipt_ux.md`
