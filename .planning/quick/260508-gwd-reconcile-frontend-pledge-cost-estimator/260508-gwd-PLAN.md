---
phase: 260508-gwd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - off-chain/frontend/src/lib/utils.ts
  - off-chain/frontend/src/app/campaigns/[id]/page.tsx
autonomous: true
requirements: []
user_setup: []

must_haves:
  truths:
    - "Cost breakdown UI shows only cell capacities and fee (no separate pledge amount line to avoid double-count)"
    - "Pledge cell capacity matches builder's actual lock size (105 bytes for pledge-lock, not 65)"
    - "Total displayed cost matches actual JoyID wallet deduction within ~30 CKB"
    - "Cost breakdown updates reactively as user changes pledge amount"
  artifacts:
    - path: "off-chain/frontend/src/lib/utils.ts"
      provides: "calculateCostBreakdown() function with corrected math (no double-count, 105-byte lock)"
      contains: "calculateCostBreakdown()"
    - path: "off-chain/frontend/src/app/campaigns/[id]/page.tsx"
      provides: "cost breakdown display using corrected calculateCostBreakdown output"
      contains: "cost breakdown section that displays pledgeCellCapacity + receiptCellCapacity + fee"
  key_links:
    - from: "off-chain/frontend/src/app/campaigns/[id]/page.tsx"
      to: "off-chain/frontend/src/lib/utils.ts"
      via: "calculateCostBreakdown() call"
      pattern: "calculateCostBreakdown\\(pledgeAmount\\)"
    - from: "off-chain/frontend/src/lib/utils.ts"
      to: "off-chain/transaction-builder/src/builder.ts"
      via: "matching capacity formula (builder.ts lines 480-486)"
      pattern: "pledgeBaseCapacity = calculateCellCapacity\\(pledgeDataSize, true, 105\\)"
---

<objective>
Fix frontend pledge cost estimator to match actual transaction builder capacity math. The UI currently double-counts the pledge amount (includes it separately plus inside the pledge cell capacity), and uses wrong lock script size (65 instead of 105).

Purpose: User confidence in cost estimates and UX clarity — backers see accurate cost before confirming in wallet.
Output: Corrected `calculateCostBreakdown()` and display UI that mirrors `createPledgeWithReceipt()` capacity formulas.
</objective>

<execution_context>
@/Users/ayoublesfer/Documents/Dev/decentralized-kickstarter/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayoublesfer/Documents/Dev/decentralized-kickstarter/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@off-chain/transaction-builder/src/builder.ts (lines 459–570: createPledgeWithReceipt capacity math reference)
@off-chain/transaction-builder/src/serializer.ts (lines 179–200: calculateCellCapacity formula)
@off-chain/frontend/src/lib/utils.ts (lines 267–292: current broken calculateCostBreakdown)
@off-chain/frontend/src/app/campaigns/[id]/page.tsx (lines 896–923: where cost breakdown is displayed)

## Root Cause Analysis

**Double-Count Bug:**
The pledge cell's capacity (~300 CKB after fix) already includes the pledge amount inside it. The frontend incorrectly adds:
- pledgeAmount (e.g., 250 CKB) 
- pledgeCellCapacity (e.g., 300 CKB, which already includes the 250)
- This counts the 250 CKB twice.

**Lock Script Size Bug:**
From builder.ts lines 473–477, the pledge-lock args are:
- campaignTypeScriptHash: 32 bytes
- deadlineBlock: 8 bytes
- backerLockHash: 32 bytes
- Total args: 72 bytes

Actual lock = code_hash(32) + hash_type(1) + args(72) = **105 bytes** (not 65).

Line 481 in builder.ts passes lockScriptSize=65, which is a bug in the builder estimate, but the frontend must match what the builder actually creates.

**Correct Math (per builder.ts lines 480–486):**
- pledgeBaseCapacity = calculateCellCapacity(72, true, 105)
  → ceil((8 + 72 + 65 + 105) * 1.2) = ceil(250 * 1.2) = 300 bytes
  → 300 * 1e8 shannons = **300 CKB**
- pledgeTotalCapacity = 300 + pledgeAmount (the 300 already includes overhead; pledge amount is the *value* inside)
- receiptCapacity = calculateCellCapacity(40, true, 65) = **214 CKB**
- estimatedFee = ~1 CKB (conservative)

**What user actually pays:** pledgeAmount + pledgeCellDeadOverhead + receiptCapacity + fee
= pledgeAmount + (pledgeCellCapacity - pledgeAmount) + receiptCapacity + fee
= pledgeCellCapacity + receiptCapacity + fee
= 300 + 214 + 1 = ~515 CKB for 250 CKB pledge

This matches observed wallet deduction (~550 CKB, with variance for CCC input padding).

## Fix Strategy (Option A: Drop Separate Pledge Line)

The UI should show only:
- Pledge cell capacity: X CKB (this is what the pledge cell costs; includes the pledge amount)
- Receipt cell capacity: Y CKB
- Estimated fee: Z CKB
- **Total: X + Y + Z CKB**

This avoids confusing users with redundant "pledge amount" line.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix calculateCostBreakdown to correct lock size and remove double-count</name>
  <files>off-chain/frontend/src/lib/utils.ts</files>
  <action>
Update `calculateCostBreakdown()` (lines 267–292) to:

1. **Fix lock script size for pledge cell:** Change line 274 from lockScriptSize=65 to lockScriptSize=105 (matches actual pledge-lock args size from builder.ts lines 473–477).
   - Old: `const PLEDGE_CELL_CAPACITY = BigInt(Math.max(Math.ceil((8 + 72 + 65 + 65) * 1.2), 61)) * BigInt(100000000);`
   - New: `const PLEDGE_CELL_CAPACITY = BigInt(Math.max(Math.ceil((8 + 72 + 65 + 105) * 1.2), 61)) * BigInt(100000000);`
   - This changes pledge cell capacity from 252 CKB to 300 CKB.

2. **Remove double-count:** The interface should NOT include a separate `pledgeAmount` in the returned object. Instead, return only:
   - `pledgeCellCapacity` — total CKB needed for the pledge cell (includes the pledge value)
   - `receiptCellCapacity` — total CKB needed for the receipt cell
   - `estimatedFee` — transaction fee
   - `totalCost` — sum of the three above (NOT including pledgeAmount separately)

3. **Update interface:** Modify the `CostBreakdown` interface (lines 254–260) to remove `pledgeAmount` field.

4. **Update calculation:** Line 283 should calculate:
   ```
   const totalCost = pledgeCellCapacity + receiptCellCapacity + estimatedFee;
   ```
   (not `+ pledgeAmount` since it's already inside pledgeCellCapacity)

**Rationale:** The pledgeCellCapacity is the *total* CKB the user needs to fund for that cell. The pledge amount (user's contribution) is the *value* inside that cell — it's NOT an additional cost on top. This is how CKB's capacity model works: capacity = sum of all bytes needed to store the cell data + scripts. The pledge amount is stored in the cell data, so it's already counted in the capacity calculation.

After this fix:
- 250 CKB pledge: total cost ≈ 300 (pledge cell) + 214 (receipt) + 1 (fee) = ~515 CKB
- 100 CKB pledge: total cost ≈ 300 (pledge cell) + 214 (receipt) + 1 (fee) = ~515 CKB (same, because base pledge cell capacity is fixed at 300)
  </action>
  <verify>
    <automated>
      cd off-chain/frontend && npm run build 2>&1 | grep -E "(error|Error)" | head -20
    </automated>
  </verify>
  <done>
    - `calculateCostBreakdown()` uses correct lock script size (105 for pledge-lock)
    - Interface updated to remove `pledgeAmount` field
    - Total cost calculation matches builder's actual cost (no double-count)
    - Frontend TypeScript compilation succeeds with no errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Update UI display to reflect corrected cost breakdown (no pledge amount line)</name>
  <files>off-chain/frontend/src/app/campaigns/[id]/page.tsx</files>
  <action>
Find the cost breakdown display section (around lines 896–923) and update it to show only:
1. Pledge cell capacity: {formatCost(breakdown.pledgeCellCapacity)} CKB
2. Receipt cell capacity: {formatCost(breakdown.receiptCellCapacity)} CKB
3. Estimated transaction fee: {formatCost(breakdown.estimatedFee)} CKB
4. **Total cost: {formatCost(breakdown.totalCost)} CKB**

Remove any display of a separate "Pledge Amount" line (since it was the double-count bug).

The display should clearly indicate to the user: "This is what you will pay total." The total cost is the sum of cell capacities and fee — the actual amount deducted from their wallet.

Ensure the format matches the rest of the UI (same font, spacing, color scheme). The breakdown should appear in the pledge form context before the user clicks "Pledge" to confirm in wallet.
  </action>
  <verify>
    <automated>
      cd off-chain/frontend && npm run build 2>&1 | grep -E "(error|Error)" | head -20
    </automated>
  </verify>
  <done>
    - Cost breakdown section renders without errors
    - Display shows only cell capacities + fee (no separate pledge amount)
    - Total cost is clearly labeled and matches calculateCostBreakdown().totalCost
    - UI updates reactively when user changes pledge amount input
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Updated `calculateCostBreakdown()` function that removes double-count and uses correct 105-byte lock size for pledge cell. Updated UI to display only cell capacities and fee (no separate pledge amount line).
  </what-built>
  <how-to-verify>
    1. Open any active campaign detail page
    2. Enter a pledge amount of 250 CKB in the pledge form
    3. Observe the cost breakdown (should appear before pledge button):
       - Expected structure:
         ```
         Pledge cell capacity: 3.00 CKB
         Receipt cell capacity: 2.14 CKB
         Estimated transaction fee: ~0.01 CKB
         Total cost: ~5.15 CKB
         ```
       - Note: These are shannons-to-CKB conversions. 300 shannons = 3.00 CKB, etc.
    4. Click "Pledge" and confirm in wallet (JoyID or devnet)
    5. Check wallet transaction details:
       - Observed CKB deduction should be **~550 CKB total** (250 pledge + 300 pledge cell overhead = 550)
       - This is pledgeAmount + pledgeCellCapacity + receiptCapacity + fee all together (wallet shows gross deduction, not broken down)
       - The cost breakdown shows the overhead components; the wallet deduction shows total impact including pledge amount
    6. Repeat with 100 CKB pledge:
       - Cost breakdown should show similar cell overhead (cell costs don't change based on pledge amount)
       - But wallet deduction should be ~400 CKB (100 pledge + overhead)
    7. Verify NO errors in browser console during form interaction

    Success criteria: 
    - Cost breakdown displays without "pledge amount" line
    - UI is clear and matches campaign detail page design
    - No console errors
    - Breakdown calculation matches builder's actual cost
  </how-to-verify>
  <resume-signal>Type "approved" if cost breakdown displays correctly and matches expected values, or describe any discrepancies</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Frontend → Wallet (JoyID/devnet) | User-entered pledge amount; cost estimate must not be maliciously inflated or understated |
| Frontend display → User decision | Cost breakdown must be accurate to avoid user confusion; overstated cost = bad UX, understated = failed transaction |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gwd-01 | Information Disclosure | calculateCostBreakdown() | accept | Function is pure math, no external calls; no sensitive data involved |
| T-gwd-02 | Tampering | Cost estimate vs actual | mitigate | Match calculation to authoritative builder.ts source; audit formula during fix |
| T-gwd-03 | Denial of Service | Cost display | accept | Input is user-controlled float, sanitized by form input; no external calls |

</threat_model>

<verification>
After completion:
1. Frontend TypeScript compilation succeeds: `npm run build` from off-chain/frontend directory
2. calculateCostBreakdown() produces results matching builder's actual cost
3. Cost breakdown UI updates reactively as pledge amount changes
4. No console errors when loading campaign detail page
5. Cost breakdown displays: pledgeCellCapacity (300 CKB) + receiptCellCapacity (214 CKB) + fee (~1 CKB) = ~515 CKB total
6. Manual test: 250 CKB pledge → wallet deduction ~550 CKB (includes pledge amount)
</verification>

<success_criteria>
- Cost breakdown shows only cell capacities and fee (no double-count)
- Pledge cell capacity uses 105-byte lock size (matches builder)
- Total displayed cost matches builder's actual requirement within ~30 CKB
- Frontend renders without TypeScript errors
- UI clearly explains what user will pay
</success_criteria>

<output>
After completion, create `.planning/quick/260508-gwd-reconcile-frontend-pledge-cost-estimator/260508-gwd-01-SUMMARY.md`
</output>
