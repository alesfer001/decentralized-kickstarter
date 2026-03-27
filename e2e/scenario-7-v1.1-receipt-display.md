# Scenario 7: v1.1 Receipt Cell Display — Proof of Pledge

## Purpose
Validate that the v1.1 frontend displays receipt cells inline with pledges, showing the receipt amount and an explorer link. This scenario tests requirement UI-02 (frontend displays receipt cells per backer as proof of pledge).

## Prerequisites
- Devnet running (`offckb node`)
- Indexer running with v1.1 contracts (`cd off-chain/indexer && npm run dev`)
- Frontend running (`cd off-chain/frontend && npm run dev`)
- All 4 v1.1 contracts deployed to devnet

## Prompt for `claude --chrome`

```
Navigate to http://localhost:3000. This is a decentralized crowdfunding app on CKB blockchain (v1.1 with receipt cells).

STEP 1 — Create a Campaign (as Account #0)
1. Click "Create Campaign".
2. Fill in:
   - Title: "Receipt Display Test"
   - Description: "Testing receipt cell display for proof of pledge"
   - Funding Goal: 300 (CKB)
   - Deadline: current block + 30
3. Click "Create Campaign" and wait for redirect.
4. Verify: campaign page shows "Receipt Display Test".

STEP 2 — First pledge with receipt (as Account #1)
1. Switch to Account #1 via the header dropdown.
2. Enter 150 in the pledge amount field and click "Pledge".
3. Wait for the pledge to appear in the pledges list.
4. Verify the pledge row shows:
   - Amount: 150 CKB
   - A "Receipt:" label with the amount (150 CKB)
   - If on testnet/mainnet: a "View on Explorer" link is present
5. Note: On devnet, the explorer link may not appear (no explorer URL configured for devnet).

STEP 3 — Second pledge (still as Account #1)
1. Enter 100 in the pledge amount field and click "Pledge".
2. Wait for the pledge to appear.
3. Verify: there are now 2 pledges in the list.
4. Verify: the new pledge row also shows a receipt with "100 CKB".
5. Verify: both pledges have receipt information displayed inline.

STEP 4 — Verify receipt data accuracy
1. Check that each pledge's receipt amount matches its pledge amount.
2. Verify: receipt information is visible without clicking any expand/tab buttons (inline display per D-05).
3. Verify: the receipt data includes the receipt amount in CKB.

STEP 5 — Check multiple backers (optional, if time permits)
1. If another test account is available, switch to it and make a pledge.
2. Verify: the new backer's pledge also shows its own receipt information.
3. Verify: receipts are correctly matched to their respective backers.

REPORT: For each step, report whether it passed or failed. Specifically confirm:
- Receipt information appears inline with each pledge row
- Receipt amounts match pledge amounts
- "View on Explorer" link is present (testnet/mainnet) or absent (devnet)
- No separate tab or page is needed to see receipt info
```
