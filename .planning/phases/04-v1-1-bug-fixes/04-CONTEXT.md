# Phase 4: v1.1 Bug Fixes - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix 5 bugs found during testnet E2E testing that prevent v1.1 from being usable: distribution trigger UI (BUG-03), capacity leak (BUG-02), receipt cost UX (BUG-04), permissionless finalization (BUG-01), and backer count display (BUG-05).

This phase is purely bug fixes — no new features. The goal is to make the already-deployed v1.1 contracts and frontend fully functional on testnet.

</domain>

<decisions>
## Implementation Decisions

### BUG-03: Distribution Trigger UI (Critical)
- **D-01:** Add "Trigger Release" button on funded (Success) campaigns and "Trigger Refund" button on failed campaigns, placed inline within the existing "Distribution Status" section
- **D-02:** Buttons visible to ALL users (permissionless) — not restricted to creator or backer. Any connected wallet can trigger
- **D-03:** Single button triggers distribution for all pledges in one transaction (batch, not per-pledge)
- **D-04:** After triggering, update pledge status badges from "Locked" to "Released"/"Refunded" via polling or page refresh
- **D-05:** Calls existing `permissionlessRelease()` / `permissionlessRefund()` from transaction builder — methods already exist

### BUG-02: Campaign Cell Capacity Leak
- **D-06:** In `finalizeCampaign()`, add a change cell output that routes excess campaign cell capacity back to the creator's lock script
- **D-07:** The finalized campaign cell keeps only the minimum capacity needed for its data; the rest goes to creator as a separate output cell

### BUG-04: Receipt Cost UX
- **D-08:** Show cost breakdown below the pledge amount input, updating live as the user types
- **D-09:** Breakdown shows: pledge amount + receipt cell capacity + base pledge cell capacity + estimated tx fee = total
- **D-10:** Show this BEFORE the wallet popup (in the pledge form, not as a confirmation dialog)

### BUG-01: Permissionless Finalization
- **D-11:** The root cause is that the campaign cell is locked with the creator's lock script — only the creator can spend/update it. This is a contract-level constraint.
- **D-12:** Approach: Modify `finalizeCampaign()` in the transaction builder to use a different mechanism — the campaign cell's lock must allow anyone to finalize after deadline. This likely requires deploying a custom "campaign lock" script that allows permissionless spending when transitioning from Active→Success/Failed after deadline, OR using an alternative approach like placing the campaign cell under a permissionless lock with the type script enforcing valid transitions.
- **D-13:** If contract changes are too invasive for a bug-fix phase, document the limitation and add a "Finalize" button that's visible only to the campaign creator as a temporary workaround (already partially in place).

### BUG-05: Backer Count
- **D-14:** Count unique backer lock hashes from BOTH live pledges AND receipts to get accurate count across all lifecycle states
- **D-15:** Fix in the indexer API — return `backerCount` computed from unique backer lock hashes across pledges + receipts for each campaign
- **D-16:** Frontend can then use the API value directly instead of computing from pledges client-side

### Claude's Discretion
- Error handling and loading states for the new trigger buttons
- Exact styling/placement within the Distribution Status section
- Whether to auto-refresh or require manual refresh after distribution trigger

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Bug Descriptions
- `docs/ProjectPlan.md` §Phase 15.5 — Full bug descriptions with context from testnet E2E testing

### Transaction Builder
- `off-chain/transaction-builder/src/builder.ts` — Contains `finalizeCampaign()` (lines 169-231), `permissionlessRelease()` (lines 503-568), `permissionlessRefund()` (lines 575-660)

### Frontend
- `off-chain/frontend/src/app/campaigns/[id]/page.tsx` — Campaign detail page with Distribution Status section (lines 786-847) and pledge form (lines 574-622)
- `off-chain/frontend/src/app/page.tsx` — Home page with campaign listing and backer counts
- `off-chain/frontend/src/components/CampaignCard.tsx` — Campaign card component displaying backer count
- `off-chain/frontend/src/lib/utils.ts` — `getUniqueBackerCount()` utility

### Indexer
- `off-chain/indexer/src/api.ts` — API endpoints returning `receiptCount` (lines 35-67, 69-105)
- `off-chain/indexer/src/database.ts` — Database queries for campaigns/pledges/receipts

### Contracts
- `contracts/campaign/src/main.rs` — Campaign type script validation (finalization at lines 138-174)

### Memory References
- `.claude/projects/-Users-ayoublesfer-Documents-Dev-decentralized-kickstarter/memory/project_finalize_capacity_bug.md` — Capacity leak analysis
- `.claude/projects/-Users-ayoublesfer-Documents-Dev-decentralized-kickstarter/memory/project_distribution_trigger_gap.md` — Distribution trigger gap analysis
- `.claude/projects/-Users-ayoublesfer-Documents-Dev-decentralized-kickstarter/memory/project_receipt_ux.md` — Receipt cost UX requirements

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `permissionlessRelease()` and `permissionlessRefund()` already exist in builder.ts — BUG-03 just needs frontend buttons to call them
- `getUniqueBackerCount()` in utils.ts already computes unique backers from pledges — extend to include receipts
- `getDistributionSummary()` in utils.ts provides distribution state text — reuse for button visibility logic
- Toast notification system exists for transaction feedback

### Established Patterns
- Transaction flow: build tx in builder → `completeFeeBy(signer)` → `sendTransaction()` → poll for confirmation → update UI
- API fetch pattern: centralized `apiFetch()` in `api.ts` with proper headers
- Campaign detail page already has conditional button rendering based on status and user role

### Integration Points
- Distribution trigger buttons connect to existing builder methods via the same signer/CKB client pattern used by "Finalize Campaign"
- Backer count fix connects indexer DB query → API response → frontend display
- Cost breakdown connects to existing capacity calculation constants in builder.ts

</code_context>

<specifics>
## Specific Ideas

- BUG-03 is the highest priority — funds are literally stuck without distribution trigger buttons
- BUG-01 (permissionless finalization) may require contract changes which would necessitate redeployment — evaluate if this can be deferred or if a frontend-only workaround suffices for now
- The capacity calculations for BUG-04 breakdown should match the actual values in builder.ts to avoid discrepancy

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-v1-1-bug-fixes*
*Context gathered: 2026-04-06*
