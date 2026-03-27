# Phase 3: Frontend and E2E Testing - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Update the Next.js frontend for v1.1 trustless distribution UX, deploy to testnet, and validate with E2E tests:
1. **Frontend Updates** — Remove manual release/refund buttons, add status badges, show receipt cells
2. **Testnet Deployment** — Fresh deployment of all 4 contracts, update Render indexer, redeploy Vercel
3. **E2E Testing** — Browser-automated scenarios for v1.1 flow
4. **External Validation** — Community tester completes full lifecycle

Does NOT include: new features beyond v1.1 scope (campaign editing, stablecoins, etc.).
</domain>

<decisions>
## Implementation Decisions

### Distribution Status UX
- **D-01:** Status badges per pledge row on campaign detail page. Each pledge shows: `Locked` (before deadline), `Releasing...` (in progress), `Released` (to creator), `Refunded` (to backer).
- **D-02:** Remove manual release/refund buttons entirely. Distribution is automatic — no user action needed post-finalization.
- **D-03:** Campaign-level status should reflect aggregate: "All pledges released" or "3/5 pledges refunded" etc.

### Receipt Cells Display
- **D-04:** Receipt info shown inline in pledge list. Each pledge row includes: receipt amount, receipt cell outpoint (clickable link to CKB explorer).
- **D-05:** Backers see their proof-of-pledge receipt inline with their pledge entry. No separate tab.

### Testnet Deployment
- **D-06:** Fresh testnet deployment — all 4 v1.1 contracts deployed to Pudge. New code hashes generated.
- **D-07:** Update Render indexer env vars with new code hashes (CAMPAIGN_CODE_HASH, PLEDGE_CODE_HASH, RECEIPT_CODE_HASH, PLEDGE_LOCK_CODE_HASH).
- **D-08:** Redeploy Vercel frontend with any new env vars needed.
- **D-09:** Update Nervos Talk thread with v1.1 progress once testnet is live.

### E2E Testing
- **D-10:** Browser-automated scenarios extending existing `e2e/` markdown pattern. Add v1.1-specific scenarios.
- **D-11:** Key scenarios: (1) Pledge shows receipt cell info, (2) Auto-distribution status badges appear after finalization, (3) No manual release/refund buttons visible, (4) Full lifecycle with permissionless release/refund triggered by different wallet.

### Claude's Discretion
- Exact badge colors/styles (match existing Tailwind patterns)
- CKB explorer URL format for receipt outpoint links
- Loading states during distribution
- E2E scenario markdown format
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frontend Code
- `off-chain/frontend/src/app/campaigns/[id]/page.tsx` — Campaign detail page (main target)
- `off-chain/frontend/src/components/` — Existing UI components
- `off-chain/frontend/src/lib/api.ts` — API client (needs receipt endpoints)
- `off-chain/frontend/src/lib/types.ts` — Frontend type definitions
- `off-chain/frontend/src/lib/constants.ts` — Network constants, explorer URLs

### Indexer API (what frontend calls)
- `off-chain/indexer/src/api.ts` — REST endpoints including new /receipts routes
- `off-chain/indexer/src/types.ts` — Receipt interfaces

### Prior Phase Context
- `.planning/phases/01-on-chain-contracts/01-CONTEXT.md` — Contract decisions
- `.planning/phases/02-off-chain-integration/02-CONTEXT.md` — Off-chain decisions

### Deployment
- `scripts/deploy-contracts.ts` — Contract deployment
- `deployment/deployed-contracts-testnet.json` — Testnet code hashes
- `off-chain/frontend/.env.local` — Frontend env vars

### E2E Tests
- `e2e/` — Existing E2E scenario documents
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing campaign detail page with pledge list, status badges (Active, Expired, Success, Failed)
- `StatusBadge` component pattern with Tailwind color variants
- `fetchPledgesForCampaign()` API function
- Toast notifications for transaction progress
- Skeleton loading components

### Established Patterns
- Next.js App Router with React 19
- Tailwind CSS 4 for styling
- CCC connector for wallet integration
- `apiFetch()` wrapper for API calls

### Integration Points
- New API calls: `fetchReceipts()`, `fetchReceiptsForBacker()`
- Pledge list component needs receipt data alongside pledge data
- Campaign detail needs aggregate distribution status
- Environment variables on Vercel for testnet code hashes
</code_context>

<specifics>
## Specific Ideas

- Badge colors: Locked (gray), Releasing (yellow/amber), Released (green), Refunded (blue) — match existing badge pattern
- Receipt outpoint link: `https://pudge.explorer.nervos.org/transaction/{txHash}` format
- The "Finalize" button remains (someone still needs to trigger finalization), but release/refund buttons are gone
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.
</deferred>

---

*Phase: 03-frontend-and-e2e-testing*
*Context gathered: 2026-03-27*
