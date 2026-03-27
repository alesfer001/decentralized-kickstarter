# Scenario 6: v1.1 Trustless Distribution — No Manual Buttons

## Purpose
Validate that the v1.1 frontend removes manual release/refund buttons and shows automatic distribution status badges. This scenario tests requirement UI-01 (remove manual buttons, show automatic distribution status) and UI-03 (pledge lock status badges).

## Prerequisites
- Devnet running (`offckb node`)
- Indexer running with v1.1 contracts (`cd off-chain/indexer && npm run dev`)
- Frontend running (`cd off-chain/frontend && npm run dev`)
- All 4 v1.1 contracts deployed to devnet

## Prompt for `claude --chrome`

```
Navigate to http://localhost:3000. This is a decentralized crowdfunding app on CKB blockchain (v1.1 with trustless automatic distribution).

STEP 1 — Create a Campaign (as Account #0, the creator)
1. Click "Create Campaign".
2. Fill in:
   - Title: "Trustless Distribution Test"
   - Description: "Testing v1.1 automatic fund routing"
   - Funding Goal: 200 (CKB)
   - Deadline: current block + 20
3. Click "Create Campaign" and wait for redirect.
4. Verify: campaign page shows "Trustless Distribution Test", status "Active".

STEP 2 — Pledge (as Account #1, a backer)
1. Switch to Account #1 via the header dropdown.
2. Enter 250 in the pledge amount field and click "Pledge".
3. Wait for the pledge to appear in the pledges list.
4. Verify the pledge row shows:
   - The backer's truncated lock hash
   - A "Locked" status badge (gray background)
   - The pledge amount (250 CKB)
5. Verify: there is NO "Claim Refund" button anywhere on the page.
6. Verify: there is NO "Release to Creator" button anywhere on the page.

STEP 3 — Wait for deadline and finalize (as Account #0)
1. Switch back to Account #0.
2. Wait for the deadline to pass (refresh until status changes).
3. Once "Finalize Campaign" button appears, click it.
4. Wait for redirect to finalized campaign page.
5. Verify: status badge shows "Funded" (green).

STEP 4 — Verify automatic distribution status
1. Verify: a "Distribution Status" section is visible below the campaign details.
2. Verify: the distribution status text mentions automatic/permissionless distribution.
3. Verify: there is NO "Claim Refund" button on the page.
4. Verify: there is NO "Release to Creator" button on the page.
5. Verify: each pledge row still shows a "Locked" status badge (the pledge cell is still live on chain, awaiting permissionless release).

STEP 5 — Verify no manual action buttons after finalization
1. Switch to Account #1 (the backer).
2. Verify: the page does NOT show any "Claim Refund" or "Release to Creator" buttons.
3. Verify: the "Actions" section either does not appear or contains only system actions (no refund/release).

REPORT: For each step, report whether it passed or failed. Specifically confirm:
- "Locked" badge is visible on pledge rows
- "Distribution Status" section is visible after finalization
- No "Claim Refund" button exists anywhere
- No "Release to Creator" button exists anywhere
```
