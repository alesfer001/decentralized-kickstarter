---
phase: 07-automatic-finalization-bot
reviewed: 2026-04-24T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - off-chain/indexer/src/bot.ts
  - off-chain/indexer/src/index.ts
  - off-chain/indexer/src/indexer.ts
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-04-24
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

This review covers the automatic finalization bot implementation (bot.ts), its integration into the indexer service (index.ts), and the bot injection into the background polling loop (indexer.ts). The code implements permissionless fund distribution as specified in D-03, triggering finalization transactions when campaign deadlines pass, followed by permissionless release/refund in subsequent cycles.

**Key findings:** 2 Critical issues related to transaction parameter construction (missing/incorrect fields that would cause runtime failures), 3 Warnings around error handling and state management, and 1 Info item about empty catch block. The bot architecture is sound, but several implementation details require fixing before deployment.

---

## Critical Issues

### CR-01: Missing campaignCellDep in permissionlessRefund params

**File:** `off-chain/indexer/src/bot.ts:282-290`

**Issue:** The `permissionlessRefund()` call builds params without the optional `campaignCellDep` field. According to the transaction builder's type definition, `PermissionlessRefundParams.campaignCellDep` is marked optional for fail-safe refund, but the builder implementation may require it in certain cases. More critically, if the fail-safe refund path is used (refunding after deadline), the campaign cell dep is likely needed to prove the campaign has finalized.

The current code:
```typescript
const params = {
  pledgeOutPoint: { txHash: pledge.tx_hash, index: pledge.output_index },
  pledgeCapacity: BigInt(pledge.amount),
  backerLockScript: backerLockScript,
  deadlineBlock: BigInt(campaign.deadline_block),
};
```

Should include:
```typescript
const params = {
  pledgeOutPoint: { txHash: pledge.tx_hash, index: pledge.output_index },
  pledgeCapacity: BigInt(pledge.amount),
  campaignCellDep: {
    txHash: campaign.tx_hash,
    index: campaign.output_index,
  },
  backerLockScript: backerLockScript,
  deadlineBlock: BigInt(campaign.deadline_block),
};
```

**Fix:**
```typescript
const params = {
  pledgeOutPoint: {
    txHash: pledge.tx_hash,
    index: pledge.output_index,
  },
  pledgeCapacity: BigInt(pledge.amount),
  campaignCellDep: {
    txHash: campaign.tx_hash,
    index: campaign.output_index,
  },
  backerLockScript: backerLockScript,
  deadlineBlock: BigInt(campaign.deadline_block),
};
```

---

### CR-02: Hardcoded secp256k1 lock script code hash in release/refund methods

**File:** `off-chain/indexer/src/bot.ts:203-204` and `277-278`

**Issue:** Both `releasePledgesForCampaign()` and `refundPledgesForCampaign()` hardcode the secp256k1 blake160 lock script code hash:
```typescript
codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8"
```

This assumes all creators and backers use the standard secp256k1 lock. On mainnet or testnet, users could have different lock scripts (e.g., multi-sig, JoyId, OmniLock). Using a hardcoded code hash will cause the transaction to fail if the target user has a non-standard lock.

**Fix:** Store the actual lock script from the database (which is already indexed). For the creator (release), use `campaign.creator_lock_code_hash` and `campaign.creator_lock_hash_type` from the database. For the backer (refund), the database does not currently store backer lock script details — this is a data modeling issue.

For immediate fix, at minimum validate that the lock script is secp256k1 before proceeding:

```typescript
// In releasePledgesForCampaign:
const creatorLockScript = campaign.creator_lock_code_hash
  ? {
      codeHash: campaign.creator_lock_code_hash,
      hashType: campaign.creator_lock_hash_type as const,
      args: campaign.creator_lock_args,
    }
  : {
      codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
      hashType: "type" as const,
      args: campaign.creator_lock_hash,
    };
```

For backers, the database schema should be extended to store `backer_lock_code_hash` and `backer_lock_hash_type` during initial indexing (in `indexer.ts:parsePledgeData`).

---

## Warnings

### WR-01: No validation of transaction success before logging success message

**File:** `off-chain/indexer/src/bot.ts:148-151`

**Issue:** After calling `this.builder.finalizeCampaign()`, the code logs success immediately upon receiving a tx hash. However, a tx hash only indicates the transaction was submitted to the mempool, not that it was confirmed on-chain. If the transaction fails (e.g., due to insufficient balance or script validation failure), the log will be misleading.

Additionally, there is no mechanism to track finalized campaigns and avoid re-processing them in subsequent cycles. If the finalization transaction fails, the bot will retry infinitely, potentially wasting gas fees.

**Fix:** Add a flag to the database to mark campaigns as "finalization_attempted" or similar. Query only campaigns that haven't been attempted yet:

```typescript
// In bot.ts database schema (or as a separate tracking table):
// Add column: finalization_attempted BOOLEAN DEFAULT FALSE
// Add column: last_finalization_tx_hash TEXT

// In findExpiredCampaigns:
return allCampaigns.filter((campaign) => {
  if (campaign.status !== CampaignStatus.Active) return false;
  if (BigInt(campaign.deadline_block) > currentBlock) return false;
  if (campaign.finalization_attempted) return false; // Skip if already tried
  return true;
});

// After finalization attempt (success or failure):
this.db.markFinalizationAttempted(campaign.id, txHash);
```

---

### WR-02: Exception caught but no context added before re-throwing

**File:** `off-chain/indexer/src/bot.ts:85-88`, `155-160`, `184-186`, `259-260`

**Issue:** Multiple catch blocks log errors but do not provide sufficient context to debug issues. For example:

```typescript
catch (error) {
  console.error("Bot error in processPendingFinalizations:", error);
  // Continue on error — will retry next cycle
}
```

The generic catch silently swallows the error type. While TypeScript convention allows `catch(error)` without type annotation, providing more context (e.g., which campaign failed, what was the operation) would aid troubleshooting.

**Fix:** Add contextual information to error logs:

```typescript
catch (error) {
  console.error(`Bot error in processPendingFinalizations:`, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
  });
}
```

For pledge-level errors, include the pledge/campaign ID:

```typescript
catch (error) {
  console.error(`Bot: Failed to finalize campaign ${campaign.id}:`, {
    message: error instanceof Error ? error.message : String(error),
    campaignId: campaign.id,
    stack: error instanceof Error ? error.stack : undefined,
  });
}
```

---

### WR-03: Silent suppression of missing creator lock data in indexer

**File:** `off-chain/indexer/src/indexer.ts:270-271`

**Issue:** During campaign indexing, if the creator lock script cannot be retrieved from the transaction, the catch block silently suppresses the error:

```typescript
try {
  const txData = await this.client.getTransaction(lookupTxHash);
  // ... extract creator lock ...
} catch {}
```

This means if there's a temporary RPC failure or if the transaction cannot be found, the creator lock script data will be NULL in the database. The bot later depends on this data (CR-02). A silent failure here cascades to a runtime error in the bot.

**Fix:** Log the failure so operators can diagnose why creator lock data is missing:

```typescript
try {
  const txData = await this.client.getTransaction(lookupTxHash);
  // ... extract creator lock ...
} catch (error) {
  console.warn(
    `Failed to fetch creator lock script for campaign ${campaign.id} (tx: ${lookupTxHash}):`,
    error instanceof Error ? error.message : String(error)
  );
}
```

---

## Info

### IN-01: Empty catch block in indexer at line 271

**File:** `off-chain/indexer/src/indexer.ts:271`

**Issue:** The bare `} catch {}` silently swallows errors. While caught by WR-03, this specific instance should be logged. Empty catch blocks can hide bugs and make debugging difficult.

**Fix:** Replace with explicit error logging (see WR-03 fix above).

---

## Recommendations & Follow-up Items

1. **Database schema update:** Add columns to campaigns table:
   - `finalization_attempted: BOOLEAN` — Track if finalization has been attempted
   - `last_finalization_tx_hash: TEXT` — Store the last attempted tx hash for debugging

2. **Backer lock script indexing:** Extend the indexer to store backer lock script details during pledge indexing, so the bot can use the correct lock script for refunds instead of hardcoding.

3. **Bot disable switch:** Add an environment variable to disable the bot without losing its configuration (e.g., `BOT_ENABLED=false`), in case urgent fixes are needed.

4. **Monitoring:** Add bot wallet balance check logging to standard output (not just warnings) so operations can track balance history.

5. **Testing:** Add integration tests for bot scenarios:
   - Campaign finalization when deadline passes
   - Pledge release on success
   - Pledge refund on failure
   - Bot retry on transaction failure

---

_Reviewed: 2026-04-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
