---
phase: 07-automatic-finalization-bot
fixed_at: 2026-04-24T00:00:00Z
review_path: .planning/phases/07-automatic-finalization-bot/07-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 07: Code Review Fix Report

**Fixed at:** 2026-04-24T00:00:00Z
**Source review:** .planning/phases/07-automatic-finalization-bot/07-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: Missing campaignCellDep in permissionlessRefund params

**Files modified:** `off-chain/indexer/src/bot.ts`
**Commit:** a19d608
**Applied fix:** Added missing `campaignCellDep` parameter to `permissionlessRefund()` call in `refundPledgesForCampaign()` method (line 300-303). This parameter is required for the fail-safe refund path to correctly reference the finalized campaign cell.

### CR-02: Hardcoded secp256k1 lock script code hash in release/refund methods

**Files modified:** `off-chain/indexer/src/bot.ts`, `off-chain/indexer/src/database.ts`, `off-chain/indexer/src/indexer.ts`
**Commit:** a19d608
**Applied fix:** 
- Extended `DBPledge` interface to include `backer_lock_code_hash`, `backer_lock_hash_type`, and `backer_lock_args` fields (database.ts:29-31)
- Updated pledge table schema to store backer lock script details (database.ts:87-96)
- Added migration to add backer lock columns to existing databases (database.ts:137-142)
- Updated pledge INSERT statement to include new backer lock columns (database.ts:147-149)
- Modified pledge parsing in indexer to extract and store actual backer lock script from transaction (indexer.ts:303-326)
- Updated `releasePledgesForCampaign()` to use creator lock script from database instead of hardcoded secp256k1 (bot.ts:213-224)
- Updated `refundPledgesForCampaign()` to use backer lock script from database instead of hardcoded secp256k1 (bot.ts:301-312)

Both methods now check if lock script data is available in the database and fall back to standard secp256k1 only if needed, supporting different lock script types on mainnet/testnet.

### WR-02: Exception caught but no context added before re-throwing

**Files modified:** `off-chain/indexer/src/bot.ts`
**Commit:** a19d608
**Applied fix:** Enhanced all catch blocks with structured error logging that includes:
- Error message (extracted from Error object or stringified)
- Stack trace (if available)
- Context information (e.g., campaign ID, pledge ID, timestamp)
- Locations updated: `processPendingFinalizations()` (line 85), `finalizeSingleCampaign()` (line 161), `releaseSuccessfulPledges()` (line 192), `releasePledgesForCampaign()` (line 247), `refundFailedPledges()` (line 281), `refundPledgesForCampaign()` (line 335)

### WR-03: Silent suppression of missing creator lock data in indexer

**Files modified:** `off-chain/indexer/src/indexer.ts`
**Commit:** a19d608
**Applied fix:** Replaced empty catch block at line 271 with explicit error logging. Now logs a warning when creator lock script cannot be fetched, including the campaign ID, transaction hash, and error message. This allows operators to diagnose RPC failures or missing transaction data.

### IN-01: Empty catch block in indexer at line 271

**Files modified:** `off-chain/indexer/src/indexer.ts`
**Commit:** a19d608
**Applied fix:** Same as WR-03 - replaced `} catch {}` with proper error logging (line 271-276).

---

_Fixed: 2026-04-24T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
