# Scenario 1: Successful Campaign — Full Lifecycle (v1.1)

## Prerequisites
- Devnet running (`offckb node`)
- Indexer running (`cd off-chain/indexer && npm run dev`)
- Frontend running (`cd off-chain/frontend && npm run dev`)
- All 4 v1.1 contracts deployed to devnet

## Prompt for `claude --chrome`

```
Navigate to http://localhost:3000. This is a decentralized crowdfunding app on CKB blockchain (v1.1 with trustless automatic distribution).

STEP 1 — Create a Campaign (as Account #0, the default creator)
1. The page should show "Campaigns" heading and the Indexer API status should be "Online" (green dot).
2. Click the "Create Campaign" button (top-right blue button).
3. On the create form:
   - Title: "Solar Panel Community Project"
   - Description: "Fund solar panels for the local community center. Goal is to install 10kW of capacity."
   - Funding Goal: 500 (CKB)
   - Deadline: current block + 60 (check the helper text for the current block number)
4. Click "Create Campaign" button.
5. Wait for the success toast notification and automatic redirect to the campaign detail page.
6. Verify: the campaign page shows the title "Solar Panel Community Project", status "Active", funding goal "500 CKB", and "0 CKB" pledged.
7. Note down the URL — it contains the campaign ID.

STEP 2 — Pledge to the Campaign (as Account #1, a backer)
1. Switch to Account #1 using the dropdown in the header.
2. The page should refresh. You should still be on the campaign detail page.
3. In the sidebar "Make a Pledge" section, enter 300 in the amount field.
4. Click the "Pledge" button.
5. Wait for the success toast and the pledge to appear in the pledges list.
6. Verify: "300 CKB" pledged is shown in the pledges list, total pledged is now "300 CKB", funding progress shows 60%.
7. Verify: the pledge row shows a "Locked" status badge and "Receipt: 300 CKB" inline.
8. Verify: there is NO "Release to Creator" or "Claim Refund" button anywhere.

STEP 3 — Add a second pledge (still as Account #1)
1. Enter 250 in the pledge amount field.
2. Click "Pledge".
3. Wait for the pledge to appear.
4. Verify: total pledged is now "550 CKB" (exceeds the 500 CKB goal), progress bar shows 110%, there are 2 pledges listed.
5. Verify: each pledge row shows its own receipt inline (300 CKB and 250 CKB).

STEP 4 — Wait for deadline and finalize (as Account #0, the creator)
1. Switch back to Account #0 using the header dropdown.
2. Wait until the campaign expires (the deadline block is reached). Refresh periodically — once expired, the status will change to "Expired - Funded" and a "Finalize Campaign" button will appear.
3. The finalization message should say: "The funding goal was met -- it will be marked as Successful. Funds will be automatically released to the creator."
4. Click the "Finalize Campaign" button (purple button).
5. Wait for the redirect to the finalized campaign page.
6. Verify: the status badge now shows "Funded" (green), total pledged shows "550 CKB".
7. Verify: a "Distribution Status" section appears, mentioning automatic/permissionless distribution.

STEP 5 — Verify automatic distribution (no manual release needed)
1. Verify: there is NO "Release to Creator" button anywhere on the page.
2. Verify: there is NO "Claim Refund" button anywhere on the page.
3. Switch to Account #1 (the backer).
4. Verify: still no manual release/refund buttons. Distribution is handled automatically on-chain.
5. Note: pledge cells may still show "Locked" — anyone can trigger their release permissionlessly.

STEP 6 — Destroy the campaign (as Account #0, the creator)
1. Switch to Account #0 using the header dropdown.
2. If pledge cells are still live, the destroy button will not appear yet. Wait for pledges to be consumed.
3. Once pledges are gone (pledges list shows 0), a "Destroy Campaign & Reclaim CKB" button (gray) should appear in the Actions section.
4. Click it.
5. Wait for the redirect to the home page.
6. Verify: the campaign is no longer listed on the home page.

REPORT: For each step, report whether it passed or failed. Specifically confirm:
- Receipt info appears inline with each pledge row
- No manual "Release to Creator" or "Claim Refund" buttons exist
- "Distribution Status" section appears after finalization
- Distribution is described as automatic/permissionless
```
