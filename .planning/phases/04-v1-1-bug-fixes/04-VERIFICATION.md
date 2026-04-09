---
phase: 04-v1-1-bug-fixes
verified: 2026-04-06T00:00:00Z
status: gaps_found
score: 4/5 must-haves verified
re_verification: false
gaps:
  - truth: "Non-creator users receive clear feedback about creator-only finalization limitation"
    status: partial
    reason: "Documentation exists in IMPLEMENTATION-NOTES.md, but UI clarification for non-creators not visible in campaign detail page Actions section when campaign is finalized"
    artifacts:
      - path: "off-chain/frontend/src/app/campaigns/[id]/page.tsx"
        issue: "Lines 1084-1132: Actions section hidden from non-creators when needsFinalization=false (campaign already finalized). Non-creators cannot see explanation of why Finalize button is unavailable."
    missing:
      - "Conditional rendering for finalized campaigns showing non-creator message when campaign.status !== Active AND campaign.status !== None"
      - "Message explaining creator-only finalization requirement with reference to v1.2"
---

# Phase 04: v1.1 Bug Fixes Verification Report

**Phase Goal:** Fix 5 bugs found during testnet E2E testing that prevent v1.1 from being usable — distribution trigger UI, capacity leak, receipt cost UX, permissionless finalization, and backer count display.

**Verified:** 2026-04-06
**Status:** GAPS_FOUND
**Score:** 4/5 must-haves verified

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can see "Trigger Release" button on funded campaigns | ✓ VERIFIED | Lines 1059-1066 in campaign detail page; button renders when status=Success AND receiptCount>0 |
| 2 | User can see "Trigger Refund" button on failed campaigns | ✓ VERIFIED | Lines 1069-1077 in campaign detail page; button renders when status=Failed AND receiptCount>0 |
| 3 | Any connected wallet can trigger distribution (no creator restriction) | ✓ VERIFIED | No isCreator check on button visibility; buttons shown to all signers |
| 4 | Button click submits permissionless release/refund transaction | ✓ VERIFIED | handleTriggerRelease() and handleTriggerRefund() methods build and submit transactions via signer.sendTransaction() |
| 5 | Cost breakdown displays before wallet popup | ✓ VERIFIED | Lines 824-843 in campaign detail page; calculateCostBreakdown() called live as user types pledgeAmount input; shown BEFORE submit button |
| 6 | Cost breakdown shows all four components (pledge + pledge cell + receipt cell + fee) | ✓ VERIFIED | Lines 825-839 display all four line items and total |
| 7 | Campaign cell capacity returns to creator after finalization | ✓ VERIFIED | Lines 194-227 in transaction-builder; excessCapacity calculated and routed to creator change output |
| 8 | Backer count includes both pledges and receipts | ✓ VERIFIED | Lines 228-244 in indexer database.ts; getUniqueBackerCount queries both tables, merges sets, counts unique lock hashes |
| 9 | Campaign cards display correct backer count | ✓ VERIFIED | CampaignCard.tsx line 114 displays campaign.backerCount from API response |
| 10 | BUG-01 limitation documented with v1.2 approach | ✓ VERIFIED | IMPLEMENTATION-NOTES.md contains 80 lines of comprehensive analysis including root cause, v1.2 approaches, and implementation checklist |

**Score:** 9/10 truths fully verified; 1 truth partially verified (BUG-01 UI clarity for non-creators)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `off-chain/frontend/src/app/campaigns/[id]/page.tsx` | Distribution trigger buttons in Distribution Status section | ✓ VERIFIED | Lines 1057-1079: "Trigger Release" and "Trigger Refund" buttons present, conditional on status and receiptCount |
| `off-chain/frontend/src/lib/utils.ts` | getDistributionTriggerState helper exported | ✓ VERIFIED | Line 230: function exists with correct signature and logic |
| `off-chain/frontend/src/lib/utils.ts` | calculateCostBreakdown and formatCost exported | ✓ VERIFIED | Lines 267-300: both functions exported with correct capacity formulas |
| `off-chain/indexer/src/database.ts` | getUniqueBackerCount method counting pledges + receipts | ✓ VERIFIED | Lines 228-244: method exists, queries both tables, normalizes hashes, returns count |
| `off-chain/indexer/src/api.ts` | backerCount field in GET /campaigns and GET /campaigns/:id responses | ✓ VERIFIED | Lines 60, 100: backerCount included in both endpoint responses |
| `off-chain/frontend/src/lib/types.ts` | Campaign interface includes backerCount field | ✓ VERIFIED | Line 25: backerCount?: number field present with JSDoc comment |
| `off-chain/frontend/src/components/CampaignCard.tsx` | CampaignCard displays backerCount | ✓ VERIFIED | Line 114: renders campaign.backerCount ?? 0 |
| `off-chain/transaction-builder/src/builder.ts` | finalizeCampaign returns excess capacity to creator | ✓ VERIFIED | Lines 194-227: excessCapacity calculated, creator change output created conditionally |
| `docs/IMPLEMENTATION-NOTES.md` | BUG-01 documentation with root cause and v1.2 approach | ✓ VERIFIED | 80 lines covering current behavior, root cause, v1.2 approaches, implementation checklist |
| `off-chain/frontend/src/app/campaigns/[id]/page.tsx` | Clarifying message for non-creators about finalization limitation | ⚠️ ORPHANED | Documentation exists but UI message not visible in Actions section when campaign is finalized (not in Active state) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| campaign detail page buttons | builder.permissionlessRelease/Refund | handleTriggerRelease/Refund methods calling signer.sendTransaction | ✓ WIRED | Lines 1061, 1071: onClick handlers invoke transaction submission |
| indexer database | API endpoints | db.getUniqueBackerCount() called in both /campaigns routes | ✓ WIRED | Lines 60, 100: method called and result included in response |
| frontend Campaign interface | CampaignCard component | campaign.backerCount prop from API response | ✓ WIRED | CampaignCard line 114 reads campaign.backerCount |
| transaction builder finalizeCampaign | creator lock script | creatorLockHash from params used to build change output lock | ✓ WIRED | Lines 221-225: uses params.campaignData.creatorLockHash |
| pledge form input | cost breakdown display | pledgeAmount state triggers recalculation via conditional render | ✓ WIRED | Lines 819-843: breakdown shown when pledgeAmount has value |
| utils calculateCostBreakdown | capacity constants | formulas match builder.ts serializer calculations | ✓ WIRED | Lines 274, 278: max(ceil((8+dataSize+65+65)*1.2), 61) * 1e8 matches builder |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| CampaignCard backer display | campaign.backerCount | GET /campaigns API endpoint → indexer.getUniqueBackerCount() → database query | ✓ YES — counts actual pledges and receipts | ✓ FLOWING |
| Cost breakdown display | pledgeAmount state | User input via text field | ✓ YES — calculated from user-entered value | ✓ FLOWING |
| Trigger Release button | receiptCount > 0 condition | GET /campaigns/:id API → indexer tracks receipts | ✓ YES — receipts created during pledge lifecycle | ✓ FLOWING |
| finalizeCampaign change output | excessCapacity calculation | getTransaction() fetches original cell from chain | ✓ YES — reads actual capacity from blockchain | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Cost breakdown calculation matches builder constants | node -e "const math = (8+72+65+65)*1.2; console.log(Math.max(Math.ceil(math), 61))" outputs 252 | 252 | ✓ PASS |
| calculateCostBreakdown exports correctly | grep -n "export function calculateCostBreakdown" utils.ts | Found at line 267 | ✓ PASS |
| getUniqueBackerCount method exists in database | grep -n "getUniqueBackerCount" database.ts | Found at line 228 | ✓ PASS |
| finalizeCampaign creates two outputs when excessCapacity > 0 | grep -n "outputs.push" builder.ts | Found at line 219 (conditional creation) | ✓ PASS |
| Backer count field in API response | grep -n "backerCount:" api.ts | Found at lines 60, 100 | ✓ PASS |

### Requirements Coverage

| Requirement | Phase Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| BUG-01 | 04-05 | Finalization is permissionless — any wallet can finalize | ⚠️ PARTIAL | Deferred to v1.2; documented in IMPLEMENTATION-NOTES.md with root cause and approach; frontend does not show clarifying message to non-creators when campaign is finalized |
| BUG-02 | 04-04 | Campaign cell capacity returns to creator after finalization | ✓ SATISFIED | finalizeCampaign method updated to create change output with excess capacity routed to creator lock |
| BUG-03 | 04-01 | Distribution trigger UI — Trigger Release/Refund buttons visible to all users | ✓ SATISFIED | Buttons implemented in Distribution Status section, visible to all signers when status=Success/Failed and receiptCount>0 |
| BUG-04 | 04-03 | Pledge form shows total cost breakdown before wallet popup | ✓ SATISFIED | Cost breakdown display added below pledge amount input with live updates; all four components shown |
| BUG-05 | 04-02 | Backer count displays correctly on campaign listing cards | ✓ SATISFIED | getUniqueBackerCount implemented in indexer, API returns backerCount field, frontend CampaignCard displays from API response |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| frontend/campaigns/[id]/page.tsx | 1084 | Actions section conditional: `signer && (needsFinalization \|\| (isCreator && ...))` shows button only to creators when campaign finalized | ⚠️ WARNING | Non-creators cannot see explanation for why they cannot finalize; may cause confusion when Action section is completely hidden |
| transaction-builder/builder.ts | 185-196 | console.log statements for capacity debug info | ℹ️ INFO | Not a stub; helpful for debugging but should be removed in production or use logger |
| utils.ts | 281 | ESTIMATED_FEE hardcoded to 1000 shannons | ℹ️ INFO | Conservative estimate; actual fee will be set by completeFeeBy(); matches plan (D-10 allows this pattern) |

No blocker anti-patterns found. All critical implementations are substantive.

### Human Verification Required

1. **Test: Trigger Release Button**
   - **Test:** Load campaign with status=Success and receiptCount > 0; click "Trigger Release" button
   - **Expected:** Transaction submitted to chain; pledge status updates to "Released" after confirmation
   - **Why human:** Blockchain interaction and state timing cannot verify programmatically

2. **Test: Cost Breakdown Accuracy**
   - **Test:** Load campaign detail page; enter 100 CKB in pledge amount
   - **Expected:** Cost breakdown shows 100 + 252 + 214 + 0.00001 = ~566 CKB total
   - **Why human:** Requires manual calculation comparison and visual verification

3. **Test: Backer Count Across States**
   - **Test:** Create campaign, submit pledge (creates pledge cell), finalize (creates receipt cell), verify backer count remains constant
   - **Expected:** Backer count same before and after finalization (counts both pledges and receipts)
   - **Why human:** Requires full lifecycle test with state transitions

4. **Test: Non-Creator Finalization Message**
   - **Test:** Load expired campaign as non-creator; observe Actions section
   - **Expected:** Either see "Finalize Campaign" button (if finalization works permissionlessly) or see clarifying message explaining creator-only limitation
   - **Why human:** Current behavior shows no message/button; need to verify intended UX

5. **Test: Capacity Return Verification**
   - **Test:** Create campaign with 500 CKB, finalize it; verify creator receives change output with ~435 CKB (500 - 65 minimum)
   - **Expected:** Creator receives back excess capacity in separate change cell
   - **Why human:** Requires blockchain inspection to confirm output creation and capacity distribution

### Gaps Summary

**Gap 1: BUG-01 Non-Creator UI Clarity (Partial)**

**What's Missing:**
When a campaign is already finalized (status = Success or Failed), the Actions section is hidden from non-creators because the condition `needsFinalization` is only true for Active+expired campaigns. Non-creators therefore see no message explaining why they cannot finalize.

**Impact:**
- Plan 05 stated: "Frontend clearly communicates creator-only limitation" (check mark in SUMMARY)
- PLAN requirement: "Clarifying message for non-creators about limitation"
- Current implementation: Only shows Finalize button to creators when needed (which is correct), but doesn't explain to non-creators viewing a finalized campaign why the Actions section exists or doesn't exist

**Location:**
- File: `off-chain/frontend/src/app/campaigns/[id]/page.tsx`
- Lines: 1084 (Actions section condition)
- Lines: 1099-1115 (needsFinalization block showing button)

**Required Fix:**
Add conditional rendering for non-creator feedback when campaign is finalized:
```tsx
{signer && !needsFinalization && campaign.status !== CampaignStatus.Active && !isCreator && (
  <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
    <h2 className="text-lg font-semibold mb-4">Actions</h2>
    <p className="text-sm text-zinc-600 dark:text-zinc-400">
      This campaign has been finalized. Only the campaign creator can finalize campaigns in v1.1.
      Once finalized, fund distribution becomes permissionless — anyone can trigger release/refund.
      Permissionless finalization will be available in v1.2.
    </p>
  </div>
)}
```

**Severity:** ⚠️ Medium — Documentation exists, UI clarity incomplete, may cause user confusion

---

_Verified: 2026-04-06_
_Verifier: Claude (gsd-verifier)_
