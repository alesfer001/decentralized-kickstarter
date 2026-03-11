# Phase 8: Claim/Refund Logic — Status

## Completed

### 1. Campaign Contract (`contracts/campaign/src/main.rs`)
- Restructured `program_entry()` to detect creation/finalization/destruction via GroupInput/GroupOutput
- Added `validate_finalization()`: checks Active→Success/Failed transition, immutable fields unchanged
- Destruction (consuming cell) now allowed (lock script guards spending)

### 2. Pledge Contract (`contracts/pledge/src/main.rs`)
- Restructured `program_entry()` to detect creation/destruction/modification
- Destruction allowed (enables refund and release)
- Modification rejected (pledges are immutable)

### 3. Contracts Built & Deployed
- Built for RISC-V, stripped with `riscv64-elf-objcopy`
- Deployed to OffCKB devnet
- Campaign codeHash: `0x0f5667918b120ccdd5e236b43a724ca5edbef52299b19390d4ce703959667e10`
- Pledge codeHash: `0x27182bbbe47d80cce33169d4b791d80a654cf9947cb4172783e444005f098065`
- All references updated: `deployed-contracts.json`, `constants.ts`, `indexer/index.ts`, test files

### 4. Transaction Builder (`off-chain/transaction-builder/src/`)
- `types.ts`: Added `FinalizeCampaignParams`, `RefundPledgeParams`, `ReleasePledgeParams`
- `serializer.ts`: Added `serializeCampaignDataWithStatus()`
- `builder.ts`: Added `finalizeCampaign()`, `refundPledge()`, `releasePledgeToCreator()`
- `index.ts`: Exports updated
- **CLI integration test passed**: both success and failure lifecycles work end-to-end via `test-lifecycle.ts`

### 5. Indexer (`off-chain/indexer/src/`)
- `indexer.ts`: Added `getPledgesForBacker(backerLockHash)`
- `api.ts`: Added `GET /pledges/backer/:lockHash` endpoint
- `api.ts`: Added `effectiveStatus` field to campaign responses
- `api.ts`: Fixed detail endpoint to use consistent field names (`creator`, `campaignId`)

### 6. Frontend (`off-chain/frontend/src/`)
- `lib/api.ts`: Added `fetchBackerPledges()`
- `lib/types.ts`: Added `effectiveStatus` to Campaign interface
- `app/campaigns/[id]/page.tsx`: Added Actions section with:
  - "Finalize Campaign" button (creator, expired Active campaigns)
  - "Claim Refund" button (backer, Failed campaigns)
  - "Release to Creator" button (backer, Successful campaigns)
  - Wallet lock hash detection for role identification
  - After finalize, redirects to new campaign cell URL

### 7. Test Seed Script
- `off-chain/transaction-builder/seed-frontend-test.ts` creates 4 campaigns:
  - A: Active, far deadline, has pledge
  - B: Expired, goal met, needs finalization → Success
  - C: Already finalized as Failed, pledge ready for refund
  - D: Already finalized as Success, pledge ready for release

## Bugs Fixed During Implementation
- Contract: Removed on-chain `total_pledged >= funding_goal` enforcement (pledges tracked off-chain)
- Frontend: `totalPledged` in finalize tx must be `0` (matching on-chain value, not indexer-calculated)
- Indexer: Detail endpoint was returning `creatorLockHash` instead of `creator`

## Next: Frontend Testing

The CLI-level lifecycle tests pass (`test-lifecycle.ts`), but the frontend UI flows need testing and debugging.

### Test Cases

| # | Campaign | Wallet | Action | Expected Result |
|---|----------|--------|--------|-----------------|
| 1 | A (Active) | Account #1 (backer) | Submit pledge via form | Pledge appears in list, progress bar updates |
| 2 | B (Expired, goal met) | Account #0 (creator) | Click "Finalize Campaign" | TX submits, redirects to new campaign showing "Funded" status |
| 3 | C (Failed) | Account #1 (backer) | Click "Claim Refund" | TX submits, pledge disappears, CKB returned to backer |
| 4 | D (Success) | Account #1 (backer) | Click "Release to Creator" | TX submits, pledge disappears, CKB sent to creator |

### Known Issue
- **Campaign B finalization**: Transaction submits successfully but the redirect/status update in the UI is not working correctly. The underlying transaction works (verified via CLI tests). Needs debugging of the frontend flow — likely related to the campaign cell getting a new outPoint after finalization and the page redirect timing.

### How to Test
```bash
# Terminal 1: Devnet (nvm use v18 && offckb node)
# Terminal 2: Indexer (cd off-chain/indexer && npm run dev)
# Terminal 3: Frontend (cd off-chain/frontend && npm run dev)
# One-time: Seed data (cd off-chain/transaction-builder && npx ts-node seed-frontend-test.ts)
```

Devnet accounts:
- #0 (creator): `ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvwg2cen8extgq8s5puft8vf40px3f599cytcyd8`
- #1 (backer): `ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt435c3epyrupszm7khk6weq5lrlyt52lg48ucew`
