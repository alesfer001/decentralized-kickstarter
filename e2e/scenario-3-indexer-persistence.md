# Scenario 3: Indexer Persistence — Data Survives Restart (v1.1)

## Prerequisites
- Devnet running (`offckb node`)
- Indexer running (`cd off-chain/indexer && npm run dev`)
- Frontend running (`cd off-chain/frontend && npm run dev`)
- All 4 v1.1 contracts deployed to devnet
- At least one campaign already exists on-chain (run scenario 1 or 2 first, or create one manually)

## Prompt for `claude --chrome`

```
Navigate to http://localhost:3000. This is a decentralized crowdfunding app (v1.1). We are testing that the indexer persists data across restarts.

STEP 1 — Verify initial state
1. The home page should show at least one campaign card.
2. Note down how many campaigns are listed and their titles.
3. Click on any campaign to verify the detail page loads with correct data (title, goal, pledged amount, status).
4. If the campaign has pledges, verify receipt info is displayed inline.

STEP 2 — Create a new campaign and pledge (as Account #0, then Account #1)
1. As Account #0, click "Create Campaign".
2. Fill in:
   - Title: "Persistence Test Campaign"
   - Description: "This campaign should survive an indexer restart."
   - Funding Goal: 200
   - Deadline: current block + 1000 (a far-future deadline so it stays active)
3. Click "Create Campaign". Wait for redirect.
4. Verify: "Persistence Test Campaign" appears with status "Active".
5. Switch to Account #1 and pledge 100 CKB.
6. Wait for the pledge to appear.
7. Verify: the pledge shows "Locked" badge and "Receipt: 100 CKB" inline.

STEP 3 — Now I will restart the indexer. Please wait on the current page.
(Note to tester: In a separate terminal, stop the indexer with Ctrl+C, then start it again with `npm run dev`)

After the indexer restarts (about 5-10 seconds), refresh the page.

STEP 4 — Verify data survived restart
1. Refresh the campaign detail page.
2. Verify: "Persistence Test Campaign" still shows with correct data (title, goal "200 CKB", status "Active").
3. Verify: the pledge still shows with "Receipt: 100 CKB" inline (receipt data persisted).
4. Navigate back to the home page.
5. Verify: all previously listed campaigns are still present, plus "Persistence Test Campaign".

STEP 5 — Verify the API responds fast
1. Open the browser's Network tab (DevTools > Network).
2. Navigate to the home page.
3. Check the response time for the API calls to localhost:3001. They should be fast (under 200ms) since they read from SQLite, not RPC.

REPORT: For each step, report pass/fail. Specifically note whether:
- Campaign data was available immediately after restart
- Pledge data (including receipt info) survived the restart
- There was any delay before data appeared
```
