# Scenario 2: Failed Campaign — Automatic Refund (v1.1)

## Prerequisites
- Devnet running (`offckb node`)
- Indexer running (`cd off-chain/indexer && npm run dev`)
- Frontend running (`cd off-chain/frontend && npm run dev`)
- All 4 v1.1 contracts deployed to devnet

## Prompt for `claude --chrome`

```
Navigate to http://localhost:3000. This is a decentralized crowdfunding app on CKB blockchain (v1.1 with trustless automatic distribution).

STEP 1 — Create a Campaign with a high goal (as Account #0)
1. Click "Create Campaign" (top-right).
2. Fill in:
   - Title: "Underwater Basket Weaving School"
   - Description: "A niche project that probably won't get funded."
   - Funding Goal: 10000 (CKB)
   - Deadline: current block + 30
3. Click "Create Campaign".
4. Wait for redirect to the campaign detail page.
5. Verify: title shows "Underwater Basket Weaving School", goal is "10,000 CKB", status is "Active".

STEP 2 — Make a small pledge (as Account #1)
1. Switch to Account #1 using the header dropdown.
2. In the pledge sidebar, enter 100 as the amount.
3. Click "Pledge".
4. Wait for the pledge to appear.
5. Verify: total pledged is "100 CKB", progress is 1%, 1 pledge listed.
6. Verify: the pledge row shows a "Locked" status badge and "Receipt: 100 CKB" inline.
7. Verify: there is NO "Claim Refund" or "Release to Creator" button.

STEP 3 — Wait for expiry and finalize as failed (as Account #0)
1. Switch to Account #0.
2. Wait for the campaign to expire (refresh the page periodically — the deadline is only ~30 blocks away).
3. Once expired, the status should show "Expired - Needs Finalization" and the text should say the goal was not met and funds will be automatically refunded.
4. Click the "Finalize Campaign" button (purple).
5. Wait for redirect.
6. Verify: status shows "Failed" (red badge).
7. Verify: a "Distribution Status" section appears, mentioning automatic refund.

STEP 4 — Verify automatic refund (no manual claim needed)
1. Verify: there is NO "Claim Refund" button anywhere on the page.
2. Switch to Account #1 (the backer).
3. Verify: still no "Claim Refund" button. The refund is handled automatically on-chain via the pledge-lock script.
4. Note: pledge cells may still show "Locked" — anyone can trigger their refund permissionlessly after finalization.

STEP 5 — Destroy campaign (as Account #0)
1. Switch to Account #0.
2. Once all pledges are consumed (either refunded or list shows 0), the "Destroy Campaign & Reclaim CKB" button (gray) should be visible.
3. Click it.
4. Wait for redirect to home page.
5. Verify: the campaign is gone from the listing.

REPORT: For each step, report pass/fail. Specifically confirm:
- Receipt info appears inline with the pledge row
- No "Claim Refund" button exists at any point (v1.1 uses automatic refunds)
- No "Release to Creator" button exists at any point
- "Distribution Status" section describes automatic refund after finalization
- The backer's CKB is returned without manual action
```
