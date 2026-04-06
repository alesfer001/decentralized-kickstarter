# Roadmap: CKB Kickstarter v1.1

## Overview
3 phases | 20 requirements | Coarse granularity

Core value: Backers' funds are automatically routed to the correct destination (creator on success, backer on failure) without anyone's cooperation — enforced entirely by on-chain scripts.

Build order follows natural dependency chain: on-chain contracts → off-chain integration → frontend + E2E.

## Phase 1: On-Chain Contracts
**Goal:** Implement and test all four on-chain scripts (pledge lock, receipt type, updated campaign type, updated pledge type) that enforce trustless fund routing.
**Requirements:** LOCK-01, LOCK-02, LOCK-03, LOCK-04, RCPT-01, RCPT-02, RCPT-03, MERGE-02, CAMP-01, CAMP-02
**UI hint:** no
**Success criteria:**
1. Pledge lock script compiles and passes native simulator tests for both success (capacity routed to creator) and failure (capacity routed to backer) paths
2. Pledge lock script rejects transactions that attempt spending before deadline block (since field enforcement)
3. Pledge lock script rejects fake campaign cell deps (type script hash verification)
4. Receipt type script validates creation only alongside a valid pledge cell with matching amount, and validates destruction only when refund amount matches
5. Campaign type script uses TypeID for unforgeable identity and rejects destruction while unresolved pledge cells exist

## Phase 2: Off-Chain Integration
**Goal:** Build transaction builder operations and indexer tracking for the new script model, and deploy all contracts to devnet for integration testing.
**Requirements:** TXB-01, TXB-02, TXB-03, TXB-04, MERGE-01, IDX-01, IDX-02
**UI hint:** no
**Success criteria:**
1. Transaction builder constructs valid createPledgeWithReceipt, permissionlessRelease, permissionlessRefund, and mergeContributions transactions that are accepted by devnet
2. Pledge merging (N inputs to 1 output) preserves total capacity and produces valid transactions on devnet
3. Indexer correctly tracks receipt cells mapped to backers/campaigns and reports accurate totals after pledge merges
4. All four contracts are deployed to devnet and a full campaign lifecycle (create → pledge → finalize → release/refund) completes successfully

## Phase 3: Frontend and E2E Testing
**Goal:** Update the frontend to reflect trustless automatic distribution, run end-to-end tests across the full stack, and deploy to testnet.
**Requirements:** UI-01, UI-02, UI-03
**UI hint:** yes
**Success criteria:**
1. Manual release/refund buttons are removed; frontend displays automatic distribution status (locked/released/refunded) per campaign
2. Frontend shows receipt cells per backer as proof of pledge with correct amounts
3. Full end-to-end lifecycle passes on testnet: campaign creation → pledge with receipt → finalization → permissionless release (success) or refund (failure) — triggered by any wallet
4. Testnet deployment validated by external tester completing a full lifecycle without manual fund routing

## Phase 4: v1.1 Bug Fixes
**Goal:** Fix 5 bugs found during testnet E2E testing that prevent v1.1 from being usable — distribution trigger UI, capacity leak, receipt cost UX, permissionless finalization, and backer count display.
**Requirements:** BUG-01, BUG-02, BUG-03, BUG-04, BUG-05
**UI hint:** yes
**Canonical refs:** docs/ProjectPlan.md §Phase 15.5
**Plans:** 5 plans in 2 waves

Plans:
- [ ] 04-01-PLAN.md — BUG-03: Add distribution trigger buttons (Release/Refund) to finalized campaigns, visible to all users
- [ ] 04-02-PLAN.md — BUG-05: Fix backer count calculation to include both pledges and receipts via indexer API
- [ ] 04-03-PLAN.md — BUG-04: Add cost breakdown display to pledge form (pledge + receipt + cell + fee)
- [ ] 04-04-PLAN.md — BUG-02: Fix campaign cell capacity leak — return excess capacity to creator after finalization
- [ ] 04-05-PLAN.md — BUG-01: Defer permissionless finalization to v1.2, document limitation and v1.2 approach

**Success criteria:**
1. "Trigger Release" and "Trigger Refund" buttons appear on finalized campaigns — any wallet can trigger, funds move to correct destination (BUG-03)
2. Campaign cell capacity returns to creator after finalization, not to the finalizer (BUG-02)
3. Pledge form shows total cost breakdown (pledge + receipt cell + fee) before wallet popup (BUG-04)
4. Permissionless finalization deferred to v1.2; creator-only finalization documented with v1.2 roadmap (BUG-01)
5. Backer count displays correctly on campaign listing cards, counting unique backers across pledges and receipts (BUG-05)

## Requirement Coverage Validation

All 20 v1.1 requirements are mapped:

| Phase | Requirements | Count |
|-------|-------------|-------|
| Phase 1 | LOCK-01, LOCK-02, LOCK-03, LOCK-04, RCPT-01, RCPT-02, RCPT-03, MERGE-02, CAMP-01, CAMP-02 | 10 |
| Phase 2 | TXB-01, TXB-02, TXB-03, TXB-04, MERGE-01, IDX-01, IDX-02 | 7 |
| Phase 3 | UI-01, UI-02, UI-03 | 3 |
| **Total** | | **20** |

---

*Created: 2026-03-26 | Granularity: coarse | Parallelization: enabled*
