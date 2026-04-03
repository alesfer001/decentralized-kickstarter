# Scenario 5: Campaign Destruction — Capacity Reclamation (v1.1)

## Prerequisites
- Devnet running (`offckb node`)
- Indexer running (`cd off-chain/indexer && npm run dev`)
- Frontend running (`cd off-chain/frontend && npm run dev`)
- All 4 v1.1 contracts deployed to devnet

## Prompt for `claude --chrome`

```
Navigate to http://localhost:3000. This is a decentralized crowdfunding app (v1.1 with trustless automatic distribution). We are testing that campaign destruction works correctly — the creator can reclaim CKB locked in a campaign cell after all pledges are distributed.

STEP 1 — Create, fund, and finalize a campaign
1. As Account #0, create a campaign:
   - Title: "Destruction Test"
   - Description: "Testing campaign destruction after successful funding."
   - Funding Goal: 150
   - Deadline: current block + 30
2. Wait for redirect. Note down the campaign URL.
3. Switch to Account #1.
4. Pledge 200 CKB (over the goal).
5. Wait for the pledge to appear. Verify: 200 CKB pledged, progress > 100%.
6. Verify: the pledge row shows "Receipt: 200 CKB" inline.
7. Wait for the deadline to pass (refresh periodically).
8. Switch to Account #0.
9. Click "Finalize Campaign" (purple button).
10. Wait for redirect to the finalized campaign page.
11. Verify: status is "Funded" (green badge).
12. Verify: "Distribution Status" section appears mentioning automatic distribution.

STEP 2 — Verify destroy button is NOT visible while pledges exist
1. As Account #0 (the creator), check the Actions section.
2. Verify: there should NOT be a "Destroy Campaign & Reclaim CKB" button visible yet — there are still pledge cells on-chain.
3. Verify: there is NO "Release to Creator" button (v1.1 has no manual release).

STEP 3 — Wait for pledge cells to be consumed, then verify destroy button
1. Wait for pledge cells to be consumed by automatic distribution (they will disappear from the pledges list after being processed on-chain).
   - If pledges persist (the permissionless release hasn't been triggered yet), note this is expected — anyone can trigger it but it's not automatic in the UI.
2. Once pledges show 0, the "Destroy Campaign & Reclaim CKB" button (gray) should appear in the Actions section.
3. There should be a message like "All pledges have been handled."

STEP 4 — Destroy the campaign
1. Click "Destroy Campaign & Reclaim CKB".
2. Wait for the transaction to process and redirect to the home page.
3. Verify: the "Destruction Test" campaign is no longer in the campaign listing.

STEP 5 — Verify the campaign is truly gone
1. Try navigating back to the campaign URL noted in Step 1.
2. Verify: the page shows "Campaign not found" or similar error.

REPORT: For each step, report pass/fail. Specifically verify that:
- No manual "Release to Creator" button exists (v1.1 automatic distribution)
- The destroy button only appears when creator AND finalized AND no pledge cells remain
- After destruction, the campaign is gone from both listing and direct URL
- The CKB was reclaimed (no longer locked in a campaign cell)
```
