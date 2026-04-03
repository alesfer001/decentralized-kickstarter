# Scenario 4: Edge Cases (v1.1)

## Prerequisites
- Devnet running (`offckb node`)
- Indexer running (`cd off-chain/indexer && npm run dev`)
- Frontend running (`cd off-chain/frontend && npm run dev`)
- All 4 v1.1 contracts deployed to devnet

## Prompt for `claude --chrome`

```
Navigate to http://localhost:3000. This is a decentralized crowdfunding app (v1.1). We are testing edge cases.

STEP 1 — Campaign with exact goal match
1. As Account #0, click "Create Campaign".
2. Fill in:
   - Title: "Exact Goal Test"
   - Description: "Testing that pledging exactly the goal amount works."
   - Funding Goal: 200
   - Deadline: current block + 60
3. Click "Create Campaign", wait for redirect.
4. Switch to Account #1.
5. Pledge exactly 200 CKB.
6. Wait for the pledge to appear.
7. Verify: progress shows 100%, total pledged shows "200 CKB".
8. Verify: the pledge row shows "Receipt: 200 CKB" inline.

STEP 2 — Campaign with zero pledges (finalize as failed)
1. Switch to Account #0.
2. Navigate to http://localhost:3000.
3. Click "Create Campaign".
4. Fill in:
   - Title: "Zero Pledge Test"
   - Description: "Nobody pledged to this campaign."
   - Funding Goal: 500
   - Deadline: current block + 20
5. Click "Create Campaign", wait for redirect.
6. Wait for the deadline to pass (about 30-40 seconds on devnet, refresh periodically).
7. Once the "Finalize Campaign" button appears, click it.
8. Verify: campaign is marked as "Failed" with 0 CKB pledged and 0 pledges.
9. Verify: "Distribution Status" section appears (no funds to distribute).
10. The "Destroy Campaign & Reclaim CKB" button should be immediately visible (no pledges to handle).
11. Click "Destroy Campaign & Reclaim CKB".
12. Verify: redirected to home page, campaign is gone.

STEP 3 — Form validation checks
1. Click "Create Campaign".
2. Without filling anything, click "Create Campaign" button.
3. Verify: inline error appears under the Title field ("Title is required").
4. Enter a title: "Validation Test".
5. Enter Funding Goal: 50 (below the 100 CKB minimum).
6. Click somewhere else (blur the field).
7. Verify: inline error under the goal field ("Funding goal must be at least 100 CKB").
8. Enter Funding Goal: 200.
9. Enter Deadline: 1 (a block number in the past).
10. Click somewhere else.
11. Verify: inline error under deadline ("Deadline must be greater than the current block").
12. Do NOT submit — just navigate back to home by clicking the browser back button.

STEP 4 — Multiple pledges from same backer
1. Navigate to the "Exact Goal Test" campaign (from Step 1). It should still be active.
2. Switch to Account #1 and pledge 100 CKB.
3. Wait for it to appear.
4. Verify: now shows 2 pledges from the same backer, total "300 CKB" (200 + 100), progress > 100%.
5. Verify: each pledge row has its own receipt with the matching amount (200 CKB and 100 CKB respectively).

REPORT: For each step, report pass/fail with details. Specifically confirm:
- Receipt amounts match pledge amounts for each individual pledge
- No manual release/refund buttons appear at any point
```
