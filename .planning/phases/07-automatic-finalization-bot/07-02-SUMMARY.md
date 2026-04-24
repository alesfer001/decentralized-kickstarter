---
phase: 07-automatic-finalization-bot
plan: 02
subsystem: off-chain/indexer
tags: [bot-integration, polling-loop, dependency-injection, environment-config]
status: completed
completed_date: 2026-04-24T12:25:00Z
one_liner: "Integrated FinalizationBot into indexer polling loop and initialized with signer + environment config"
dependency_graph:
  requires:
    - 07-01 (FinalizationBot class implementation)
    - phase-06 (contract deployments)
  provides:
    - Automatic finalization polling on 10-second cycle
    - Permissionless fund distribution (release/refund) per campaign status
  affects:
    - Render deployment (requires BOT_PRIVATE_KEY env var)
    - Indexer startup sequence
tech_stack:
  added: []
  patterns:
    - Optional bot initialization (graceful degradation if key missing)
    - Environment variable loading with testnet defaults
    - Dependency injection of bot into indexer
    - Multi-contract TransactionBuilder initialization
key_files:
  created: []
  modified:
    - off-chain/indexer/src/indexer.ts (added bot field, setBot method, polling loop integration)
    - off-chain/indexer/src/index.ts (added bot initialization, environment loading)
---

# Phase 07 Plan 02: Finalization Bot Integration Summary

## Objective

Integrate the FinalizationBot (created in plan 07-01) into the indexer's background polling loop and initialize it with a signer constructed from the bot's private key. The bot will run automatically every 10 seconds (per the polling cycle), detecting expired campaigns and triggering automatic finalization/release/refund transactions.

## What Was Built

### Task 1: Integrate bot into CampaignIndexer polling loop

Modified `off-chain/indexer/src/indexer.ts` to:

1. **Import FinalizationBot** from `./bot`
2. **Add bot field** to CampaignIndexer class:
   - Private field: `bot: FinalizationBot | null = null`
   - Optional (nullable) to support graceful operation if bot not initialized
3. **Add setBot() method** for dependency injection:
   ```typescript
   setBot(bot: FinalizationBot): void {
     this.bot = bot;
     console.log("Bot injected into indexer");
   }
   ```
4. **Modify polling loop** in startBackgroundIndexing() to call bot methods after indexAll():
   - `await this.bot?.processPendingFinalizations()` — detects and finalizes expired campaigns
   - `await this.bot?.releaseSuccessfulPledges()` — distributes funds for successful campaigns
   - `await this.bot?.refundFailedPledges()` — distributes refunds for failed campaigns
5. **Maintained error handling** in polling loop with try-catch
6. **All existing functionality** (indexAll, database access, etc.) unchanged

### Task 2: Initialize bot in index.ts entry point

Modified `off-chain/indexer/src/index.ts` to:

1. **Added imports:**
   - `import { ccc } from "@ckb-ccc/core"`
   - `import { FinalizationBot } from "./bot"`
   - `import { TransactionBuilder } from "../transaction-builder/src/builder"`
   - `import { createCkbClient } from "../transaction-builder/src/ckbClient"`

2. **Load bot configuration from environment:**
   - `BOT_PRIVATE_KEY` — 32-byte hex private key (required for signer)
   - `LOW_BALANCE_THRESHOLD` — CKB amount (default: 50 CKB, converted to shannons)

3. **Load all contract code hashes and transaction hashes:**
   - CAMPAIGN_CODE_HASH, PLEDGE_CODE_HASH, RECEIPT_CODE_HASH, PLEDGE_LOCK_CODE_HASH
   - CAMPAIGN_LOCK_CODE_HASH, CAMPAIGN_LOCK_TX_HASH, CAMPAIGN_TX_HASH, PLEDGE_TX_HASH, RECEIPT_TX_HASH, PLEDGE_LOCK_TX_HASH
   - All loaded from `process.env` with testnet defaults from deployment config

4. **Initialize bot (with error handling):**
   - Create bot client using `createCkbClient("testnet", RPC_URL)`
   - Create bot signer using `new ccc.SignerCkbPrivateKey(botClient, BOT_PRIVATE_KEY)`
   - Log bot address to stdout for visibility
   - Create TransactionBuilder with all 6 contract parameters:
     - campaignContract, campaignLockContract, pledgeContract, pledgeLockContract, receiptContract
   - Create FinalizationBot instance with client, signer, db, builder, config, and RPC URL
   - Inject bot into indexer via `indexer.setBot(bot)`

5. **Graceful error handling:**
   - If `BOT_PRIVATE_KEY` missing: log "BOT_PRIVATE_KEY not set — bot disabled" and continue without bot
   - If initialization fails: log error and continue without bot (indexer remains operational)
   - Bot is optional feature — absence doesn't break indexer functionality

## Integration Flow

```
indexer startup (index.ts main())
  ↓
Load environment variables (bot config + contracts)
  ↓
Create database, indexer, API server
  ↓
Initialize bot (if BOT_PRIVATE_KEY present):
  - Create bot client and signer
  - Create TransactionBuilder
  - Create FinalizationBot instance
  - Inject into indexer via setBot()
  ↓
Start background polling (10-second cycle):
  1. Index all campaigns/pledges from CKB
  2. Run bot.processPendingFinalizations() (finalize expired campaigns)
  3. Run bot.releaseSuccessfulPledges() (distribute funds to creator)
  4. Run bot.refundFailedPledges() (distribute refunds to backers)
  5. Wait 10 seconds, repeat
```

## Key Design Decisions

1. **Bot is optional** — If BOT_PRIVATE_KEY missing, indexer continues without automatic finalization. This allows progressive deployment: indexer can run in manual mode first, then switch to automatic mode when bot wallet is funded.

2. **All bot methods run each cycle** — processPendingFinalizations(), releaseSuccessfulPledges(), refundFailedPledges() all execute in the same polling cycle (every 10 seconds). This enables multi-cycle distribution per plan design (D-03, D-04): finalization may take one cycle, then pledges are processed in subsequent cycles.

3. **TransactionBuilder requires 6 contracts** — The actual TransactionBuilder implementation requires all contract information (campaign, campaignLock, pledge, pledgeLock, receipt). This was expanded from the original plan which mentioned only 2 contracts — **RULE 2 auto-fix applied** to load all required contracts from environment.

4. **Contract info from environment** — All code hashes and transaction hashes are loaded from `process.env` with testnet defaults. This enables network-agnostic deployment: same code runs on devnet, testnet, or mainnet by changing environment variables.

5. **Logging for visibility** — Bot address, initialization status, and operation results are logged to stdout. In Render, these appear in the logs dashboard for operational monitoring.

## Deviations from Plan

### Rule 2 Auto-fix: TransactionBuilder 6-parameter signature

**Issue found during:** Task 2 implementation

**What happened:** The plan specified creating a TransactionBuilder with 2 contracts (campaign, pledge), but the actual TransactionBuilder class signature requires 6 contracts: campaignContract, campaignLockContract, pledgeContract, pledgeLockContract, receiptContract, and additional parameters.

**Fix applied:** 
- Added environment variable loading for all 6 contract code hashes and transaction hashes
- Updated TransactionBuilder initialization to pass all 6 contracts with correct ContractInfo structure
- Used testnet defaults from deployment/deployed-contracts-testnet.json

**Files modified:** off-chain/indexer/src/index.ts (contract env var loading and TransactionBuilder construction)

**Rationale:** The TransactionBuilder is used by bot methods (finalizeCampaign, permissionlessRelease, permissionlessRefund) which need all contract information to build transactions correctly. Providing incomplete contract info would cause runtime errors.

## Verification

All acceptance criteria met:

**Task 1:**
- ✓ FinalizationBot imported in indexer.ts
- ✓ Private field `bot: FinalizationBot | null` exists in CampaignIndexer
- ✓ setBot() method implemented with logging
- ✓ Polling loop calls all three bot methods after indexAll()
- ✓ Error handling intact (try-catch at polling loop level)
- ✓ Existing functionality unchanged

**Task 2:**
- ✓ All required imports present (ccc, FinalizationBot, TransactionBuilder, createCkbClient)
- ✓ BOT_PRIVATE_KEY loaded from environment
- ✓ LOW_BALANCE_THRESHOLD loaded from environment (default: 50 CKB)
- ✓ PLEDGE_LOCK_CODE_HASH and other contracts loaded from environment
- ✓ Signer created via new ccc.SignerCkbPrivateKey
- ✓ TransactionBuilder created with all 6 contract parameters
- ✓ FinalizationBot created with correct constructor signature (6 parameters)
- ✓ Bot injected into indexer via setBot()
- ✓ Error handling in place for missing BOT_PRIVATE_KEY
- ✓ Logging messages present for visibility
- ✓ Optional bot (graceful operation if disabled)

## Commits

| Hash | Message | Files |
|------|---------|-------|
| 9bc0445 | feat(07-02): integrate finalization bot into indexer polling loop | off-chain/indexer/src/indexer.ts |
| e350073 | feat(07-02): initialize bot in indexer entry point | off-chain/indexer/src/index.ts |

## Known Stubs

None — no hardcoded empty values or placeholder text. All bot methods are fully implemented (from plan 07-01).

## Threat Surface

No new threat surfaces introduced. Bot operations:
- Finalization transactions signed by bot wallet (private key from environment)
- Release/refund transactions also signed by bot wallet
- All RPC communication uses existing HTTPS connection from indexer client
- Environment variables (BOT_PRIVATE_KEY) never logged or exposed in output

Existing threat mitigations apply (T-07-07 through T-07-10 from plan).

## Self-Check

- [x] All files referenced in task instructions verified to exist
- [x] All imports resolve correctly
- [x] Bot field, setBot method, and polling loop integration verified in indexer.ts
- [x] Bot initialization, signer construction, and dependency injection verified in index.ts
- [x] Commits exist and reference modified files
- [x] No unexpected file deletions in commits
