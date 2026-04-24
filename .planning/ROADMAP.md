# Roadmap: CKB Kickstarter v1.1

## Overview
7 phases | 33 requirements | Coarse granularity

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
- [x] 04-01-PLAN.md — BUG-03: Add distribution trigger buttons (Release/Refund) to finalized campaigns, visible to all users
- [ ] 04-02-PLAN.md — BUG-05: Fix backer count calculation to include both pledges and receipts via indexer API
- [ ] 04-03-PLAN.md — BUG-04: Add cost breakdown display to pledge form (pledge + receipt + cell + fee)
- [ ] 04-04-PLAN.md — BUG-02: Fix campaign cell capacity leak — return excess capacity to creator after finalization
- [x] 04-05-PLAN.md — BUG-01: Defer permissionless finalization to v1.2, document limitation and v1.2 approach

**Success criteria:**
1. "Trigger Release" and "Trigger Refund" buttons appear on finalized campaigns — any wallet can trigger, funds move to correct destination (BUG-03)
2. Campaign cell capacity returns to creator after finalization, not to the finalizer (BUG-02)
3. Pledge form shows total cost breakdown (pledge + receipt cell + fee) before wallet popup (BUG-04)
4. Permissionless finalization deferred to v1.2; creator-only finalization documented with v1.2 roadmap (BUG-01)
5. Backer count displays correctly on campaign listing cards, counting unique backers across pledges and receipts (BUG-05)

## Phase 5: Permissionless Finalization (Campaign Lock Script)
**Goal:** Replace creator's secp256k1 lock on campaign cells with a custom campaign-lock script that allows anyone to finalize expired campaigns — unblocking Phase 7 (auto-finalization bot).
**Requirements:** BUG-01
**UI hint:** yes
**Canonical refs:** docs/IMPLEMENTATION-NOTES.md, docs/ProjectPlan.md §Phase 15.5
**Plans:** 4 plans in 3 waves

Plans:
- [x] 05-01-PLAN.md — Campaign Lock Script Contract implementation (COMPLETED 2026-04-09)
- [x] 05-02-PLAN.md — Deploy campaign-lock to devnet and testnet (COMPLETED 2026-04-10)
- [x] 05-03-PLAN.md — Integrate campaign-lock with transaction builder (COMPLETED 2026-04-10)
- [x] 05-04-PLAN.md — Frontend permissionless finalization UI (COMPLETED 2026-04-10)

**Success criteria:**
1. Custom campaign-lock script compiles and allows spending when current block >= campaign deadline AND type script validates Success/Failed transition
2. Campaign-lock script rejects spending before deadline by non-creator transactions
3. Transaction builder creates campaigns with campaign-lock instead of creator's secp256k1 lock
4. Any wallet can finalize an expired campaign on devnet — not just the creator
5. Full lifecycle on testnet: create → pledge → (anyone) finalize → permissionless release/refund
6. Frontend removes creator-only finalization restriction and shows "Finalize" to all users on expired campaigns

## Phase 6: Security Hardening — Officeyutong Review Fixes
**Goal:** Address all 6 issues from CKB core developer Officeyutong's code review. Two HIGH-severity mainnet blockers + four MEDIUM/SMALL hardening items. All contract changes bundled into one deployment cycle.
**Requirements:** SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06
**UI hint:** no
**Canonical refs:** docs/ProjectPlan.md §Phase 16, memory/reference_officeyutong_review.md
**Plans:** 6 plans in 3 waves

Plans:
- [x] 06-01-PLAN.md — Pledge-lock hardening: remove fail-safe backdoor (grace period), merge deadline guard, lock args validation (Issues 1 + 4)
- [x] 06-02-PLAN.md — Campaign type hardening: restrict Success destruction, enforce since >= deadline on finalization, reserved bytes + metadata check (Issues 1b + 5 + 6b)
- [x] 06-03-PLAN.md — Receipt hardening + permissionless refund: cross-check pledge data on receipt creation, drop receipt from refund inputs (Issue 2)
- [x] 06-04-PLAN.md — Pledge type partial refund cross-check: verify amount difference == receipt pledge_amount (Issue 3)
- [x] 06-05-PLAN.md — Off-chain updates: indexer network-aware client, builder contract args, deploy script (Issue 6a + integration)
- [x] 06-06-PLAN.md — Build, deploy to devnet, happy path + attack scenario E2E tests

**Success criteria:**
1. Fail-safe backdoor closed — refund without campaign cell_dep rejected within grace period (1,944,000 blocks ≈ 180 days)
2. Receipt creation cross-checks pledge amount and backer_lock_hash from sibling pledge cell
3. permissionlessRefund works without backer signature (receipt not required as input)
4. Partial refund amount difference matches destroyed receipt's pledge_amount
5. Campaign finalization enforces since >= deadline_block (defense in depth)
6. Success campaign destruction blocked within grace period
7. Merge path documents timing limitation, validates lock args
8. All 5 attack scenarios rejected on devnet, 3 happy path scenarios pass

## Phase 7: Automatic Finalization Bot
**Goal:** Build an automatic finalization bot that detects expired campaigns and submits finalization transactions, then triggers permissionless release/refund for all associated pledges. The bot runs inside the existing indexer process on Render as a scheduled routine on each 10-second polling cycle. No manual intervention needed after a campaign deadline passes.
**Requirements:** BOT-01, BOT-02, BOT-03, BOT-04
**UI hint:** no
**Canonical refs:** .planning/phases/07-automatic-finalization-bot/07-CONTEXT.md, 07-RESEARCH.md
**Plans:** 2 plans in 2 waves

Plans:
- [x] 07-01-PLAN.md — Create FinalizationBot class with finalization, release, and refund logic
- [x] 07-02-PLAN.md — Integrate bot into indexer polling loop and initialize with bot wallet

**Success criteria:**
1. FinalizationBot class created in bot.ts with processPendingFinalizations(), releaseSuccessfulPledges(), refundFailedPledges(), checkBotBalance() methods
2. Bot scans for expired campaigns (deadline passed, on-chain status Active) and submits finalization txs via TransactionBuilder
3. Bot detects finalized campaigns and triggers permissionless release (success) or refund (failure) for all pledges
4. Bot checks wallet balance each cycle and logs warning if below configurable threshold (default: 50 CKB)
5. On tx failure, bot logs error and retries on next polling cycle (no backoff, no retry counter)
6. Bot is integrated into indexer.ts polling loop and called after each indexAll() call
7. Bot is initialized in index.ts with signer from BOT_PRIVATE_KEY env var
8. If BOT_PRIVATE_KEY missing or initialization fails, bot is disabled but indexer continues running
9. All logging via console.log/console.error to stdout (visible in Render logs dashboard)

## Requirement Coverage Validation

All 33 v1.1 + v1.1-bot requirements are mapped:

| Phase | Requirements | Count |
|-------|-------------|-------|
| Phase 1 | LOCK-01, LOCK-02, LOCK-03, LOCK-04, RCPT-01, RCPT-02, RCPT-03, MERGE-02, CAMP-01, CAMP-02 | 10 |
| Phase 2 | TXB-01, TXB-02, TXB-03, TXB-04, MERGE-01, IDX-01, IDX-02 | 7 |
| Phase 3 | UI-01, UI-02, UI-03 | 3 |
| Phase 4 | BUG-01, BUG-02, BUG-03, BUG-04, BUG-05 | 5 |
| Phase 5 | (covered by Phase 4 BUG-01) | 0 |
| Phase 6 | SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06 | 6 |
| Phase 7 | BOT-01, BOT-02, BOT-03, BOT-04 | 4 |
| **Total** | | **35** |

---

*Created: 2026-03-26 | Last updated: 2026-04-24 | Granularity: coarse | Parallelization: enabled*
