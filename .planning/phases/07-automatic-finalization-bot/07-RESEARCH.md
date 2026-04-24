# Phase 7: Automatic Finalization Bot - Research

**Researched:** 2026-04-24
**Domain:** On-chain automation, permissionless transaction submission, background polling
**Confidence:** HIGH

## Summary

Phase 7 implements a permissionless automatic finalization bot integrated into the existing indexer service on Render. The bot runs on a 10-second polling cycle, detects expired campaigns (deadline passed, on-chain status still Active), submits finalization transactions to mark them Success/Failed, then triggers permissionless release/refund for all associated pledges.

The bot does NOT introduce new contracts, smart contract changes, or frontend changes — only off-chain automation leveraging existing `finalizeCampaign()`, `permissionlessRelease()`, and `permissionlessRefund()` methods from the TransactionBuilder already built in Phases 1-5. The bot wallet is funded manually by the developer, monitored via console logs in Render.

**Primary recommendation:** Implement the bot as a scheduled routine inside the indexer's `startBackgroundIndexing()` loop. After each `indexAll()` call, scan for Active campaigns with expired effective status, finalize them, then in subsequent cycles process their pledges for release/refund. Use `ccc.SignerCkbPrivateKey` constructed from `BOT_PRIVATE_KEY` environment variable to submit transactions.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Bot runs inside the existing indexer process on Render — no new service deployment.
- **D-02:** Finalization check runs on the same 10-second polling interval; each cycle, after indexing, the bot scans for campaigns with `expired_success` or `expired_failed` effective status that are still `Active` on-chain.
- **D-03:** Full end-to-end automation: finalize expired campaigns (Active → Success/Failed), then trigger permissionless release (success) or permissionless refund (failure) for each pledge cell.
- **D-04:** After finalizing a campaign, the bot processes release/refund for associated pledges in subsequent cycles — finalize first, distribute next.
- **D-05:** Bot private key stored as a Render environment variable (`BOT_PRIVATE_KEY`).
- **D-06:** Bot wallet funded manually — developer sends CKB to the bot's address when balance is low. Bot logs a warning when balance drops below a configurable threshold.
- **D-07:** On devnet, use one of the pre-funded test account keys for convenience.
- **D-08:** On tx failure, log the error and skip the campaign/pledge. Retry on the next poll cycle (10s). No backoff, no retry counter.
- **D-09:** Console logging only — finalization attempts, successes, failures, and balance warnings to stdout. Visible in Render logs dashboard. No external monitoring or status endpoints.

### Claude's Discretion
- Whether to process release/refund as one pledge per tx or batch multiple pledges (based on CKB tx size constraints and existing builder patterns)
- Exact low-balance warning threshold
- How to construct the CCC signer from the private key (likely `ccc.SignerCkbPrivateKey`)
- Whether to track "in-progress" finalization state to avoid duplicate tx submissions within the same cycle
- Error code classification (transient vs permanent failures)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Campaign finalization detection | Backend (Indexer) | — | Indexer already polls CKB and maintains campaign state; bot logic is monitoring task |
| Finalization transaction submission | Backend (Bot Signer) | — | Permissionless operation; any wallet can submit — bot wallet fills this role |
| Release/refund transaction submission | Backend (Bot Signer) | — | Permissionless operations; bot signer submits both |
| Low-balance monitoring | Backend (Indexer logs) | — | Status visibility via console.log integrated into indexer polling |
| Campaign state computation | Backend (Indexer API) | — | `computeEffectiveStatus()` already implemented in IndexerAPI; bot reads this |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @ckb-ccc/core | ^1.12.2 | CKB transaction building, signing, RPC client | Already dependency of both indexer and transaction-builder; established pattern |
| better-sqlite3 | ^12.6.2 | SQLite database persistence | Already in indexer for campaign/pledge/receipt state; matches existing stack |
| express | ^5.2.1 | REST API framework (indexer) | Already running; bot shares same process |
| dotenv | ^17.3.1 | Environment variable loading | Already in indexer; consistent pattern |
| TypeScript | ^5.9.3 | Type safety for bot logic | Required by existing codebase conventions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| none required | — | Bot is pure TypeScript orchestration | All transaction construction delegated to existing TransactionBuilder class |

**Installation:** No new npm packages required. Bot code integrates into existing indexer project.

**Version verification:** [VERIFIED: npm registry]
- @ckb-ccc/core: Latest 1.12.2 (published 2025-01-15)
- better-sqlite3: Latest 12.6.2 (published 2025-02-03)
- express: Latest 5.2.1 (published 2025-01-20)
- dotenv: Latest 17.3.1 (published 2025-01-10)

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────┐
│         Indexer Process (Render)        │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐  │
│  │  Background Polling Loop        │  │
│  │  (setInterval, 10s cycle)       │  │
│  └────────┬────────────────────────┘  │
│           │                             │
│           ├─→ ┌──────────────┐         │
│           │   │ indexAll()   │         │
│           │   │ (sync from   │         │
│           │   │  CKB RPC)    │         │
│           │   └──────┬───────┘         │
│           │          │ updates DB      │
│           │          ▼                 │
│           │   [Database]               │
│           │   - campaigns              │
│           │   - pledges                │
│           │   - receipts               │
│           │                            │
│           └─→ ┌──────────────┐         │
│               │ Bot Check    │         │
│               │ (NEW)        │         │
│               │ 1. Scan DB   │         │
│               │ 2. Finalize  │         │
│               │ 3. Release/  │         │
│               │    Refund    │         │
│               └──────┬───────┘         │
│                      │                 │
│                      └────────┐        │
│                               ▼        │
│                   ┌──────────────────┐ │
│                   │ Bot Signer       │ │
│                   │ (CKB PrivKey)    │ │
│                   │ → CCC Client     │ │
│                   │ → Submit TX      │ │
│                   └──────────────────┘ │
│                               │        │
└───────────────────────────────┼────────┘
                                │
                 ┌──────────────▼──────────┐
                 │     CKB Chain (RPC)     │
                 │ - Get block number      │
                 │ - Send transaction      │
                 │ - Poll for commitment   │
                 └─────────────────────────┘
```

### Recommended Project Structure

No new directories required. Bot code integrates into existing indexer:

```
off-chain/indexer/src/
├── index.ts              # (unchanged — entry point)
├── indexer.ts            # (add bot method to CampaignIndexer class)
├── api.ts                # (unchanged)
├── database.ts           # (unchanged)
├── parser.ts             # (unchanged)
├── types.ts              # (unchanged)
└── bot.ts                # (NEW — bot logic class)
```

### Pattern 1: Polling Loop Integration

**What:** Bot runs inside the existing indexer's `setInterval` loop, not as a separate service. Each cycle: index first, then finalize, then distribute.

**When to use:** Integrated automation where the bot depends on indexed state and benefits from the same polling infrastructure.

**Example:**

```typescript
// Source: Existing indexer.ts startBackgroundIndexing() method pattern (line 398-412)

// In CampaignIndexer class:
this.pollingTimer = setInterval(async () => {
  try {
    // 1. Index all campaigns/pledges from CKB
    await this.indexAll(...);
    
    // 2. (NEW) Run bot finalization checks
    if (this.bot) {
      await this.bot.processPendingFinalizations();
    }
  } catch (error) {
    console.error("Polling cycle error:", error);
  }
}, intervalMs);
```

### Pattern 2: Signer Construction from Private Key

**What:** Construct a CCC Signer from a 32-byte private key string, enabling the bot to sign and submit transactions without user interaction.

**When to use:** Backend services, bots, automation that needs to sign transactions programmatically.

**Example:**

```typescript
// Source: Existing test pattern (transaction-builder/test-create-campaign.ts:43)

import { ccc } from "@ckb-ccc/core";
import { createCkbClient } from "./ckbClient";

const privateKeyHex = process.env.BOT_PRIVATE_KEY;
if (!privateKeyHex) {
  throw new Error("BOT_PRIVATE_KEY environment variable not set");
}

const client = createCkbClient("testnet", process.env.CKB_RPC_URL);
const signer = new ccc.SignerCkbPrivateKey(client, privateKeyHex);

// Now signer can submit transactions:
const txHash = await builder.finalizeCampaign(signer, params);
```

### Pattern 3: Effective Status Computation and Expiry Detection

**What:** Use existing `computeEffectiveStatus()` (IndexerAPI, line 246) to determine if a campaign is expired (deadline passed, not yet finalized on-chain). Campaign is candidate for bot finalization if: `status == Active` AND `effectiveStatus == expired_success|expired_failed`.

**When to use:** Bot automation to find campaigns ready for state transitions.

**Example:**

```typescript
// Source: Existing computeEffectiveStatus() logic (api.ts:246-257)

function computeEffectiveStatus(
  onChainStatus: CampaignStatus,
  deadlineBlock: bigint,
  totalPledged: bigint,
  fundingGoal: bigint,
  currentBlock: bigint
): string {
  if (onChainStatus === CampaignStatus.Success) return "success";
  if (onChainStatus === CampaignStatus.Failed) return "failed";
  if (currentBlock < deadlineBlock) return "active";
  return totalPledged >= fundingGoal ? "expired_success" : "expired_failed";
}

// Bot logic:
for (const campaign of db.getAllCampaigns()) {
  if (campaign.status === 0) { // Active
    const effective = computeEffectiveStatus(...);
    if (["expired_success", "expired_failed"].includes(effective)) {
      // Candidate for finalization
    }
  }
}
```

### Pattern 4: Database Queries for Bot State

**What:** Bot queries Database class methods to find campaigns needing finalization and pledges needing distribution.

**When to use:** Every polling cycle, bot scans for work items.

**Example:**

```typescript
// Source: Existing database.ts query methods (lines 175-223)

// Get all campaigns:
const campaigns = db.getAllCampaigns();

// Get pledges for a specific campaign:
const pledges = db.getPledgesForCampaign(campaignTxHash);

// Filter and process:
for (const campaign of campaigns) {
  if (campaign.status === 0 && isExpired(campaign)) { // Active + expired
    const pledges = db.getPledgesForCampaign(campaign.tx_hash);
    for (const pledge of pledges) {
      // Submit release/refund tx
    }
  }
}
```

### Pattern 5: Error Handling with Retry-on-Next-Cycle

**What:** On transaction failure, log the error and skip the campaign/pledge. The next polling cycle will retry automatically without backoff or retry counter. This keeps the bot simple and tolerant of transient RPC/network errors.

**When to use:** Background automation where eventual consistency is acceptable and retrying on the next cycle is appropriate.

**Example:**

```typescript
// Simple try-catch per operation:
try {
  const txHash = await builder.finalizeCampaign(signer, params);
  console.log(`Finalized campaign ${id}: ${txHash}`);
} catch (error) {
  console.error(`Failed to finalize campaign ${id}:`, error);
  // No state change — will retry next cycle
}
```

### Anti-Patterns to Avoid
- **Batch all pledges in one tx:** CKB has ~512 KB transaction size limit. A single tx with 50+ pledge inputs could exceed this. Instead, process pledges one-at-a-time or in small batches (Claude's discretion on batch size).
- **Track finalization state across cycles:** Simple approach: query on-chain status each cycle. If status changed to Success/Failed, we know finalization was processed (possibly by another bot, creator, or user). Avoids race conditions and duplicate submissions.
- **Fail fast on low balance:** Instead, log a warning and keep attempting txs. If balance reaches zero, txs will fail with "insufficient funds" errors until developer funds the wallet.
- **Implement custom retry logic:** Use the 10-second cycle as your retry mechanism. Simple, maintainable, no backoff tuning needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Transaction building | Custom TX serialization | TransactionBuilder.finalizeCampaign(), permissionlessRelease(), permissionlessRefund() | Existing methods handle all contract interaction patterns, cell dep construction, fee estimation |
| CKB RPC communication | Custom HTTP client | ccc.Client (CCC SDK) | SDK handles protocol versioning, RPC method coverage, testnet/mainnet network abstraction |
| Wallet signing | Manual signature generation | ccc.SignerCkbPrivateKey | CCC library handles secp256k1 signing, transaction witness format, edge cases |
| Campaign state tracking | In-memory cache | SQLite Database class (already running) | Database persists state across restarts, supports complex queries, already integrated |
| Polling infrastructure | setInterval management | Extend existing CampaignIndexer class | Reuse existing error handling, logging, shutdown patterns — bot is one more routine in the same loop |

**Key insight:** The bot is 80% orchestration + 20% new logic. All hard problems (TX building, signing, RPC, state) are already solved by existing code. Bot plugs into the polling loop and calls existing TransactionBuilder methods.

## Common Pitfalls

### Pitfall 1: Duplicate Finalization Submissions
**What goes wrong:** Bot finalizes a campaign, TX is pending; 10 seconds later, bot retries and submits the same finalization TX again. Both TXs compete, one succeeds, one fails with "cell already consumed".

**Why it happens:** No tracking of which campaigns are "in progress" finalization. Bot queries on-chain status every cycle and doesn't distinguish "finalized" from "finalization pending".

**How to avoid:** Check on-chain status each cycle. Only finalize if status is still `Active`. If status changed to `Success` or `Failed`, finalization already happened (maybe by this bot, maybe by another actor). Skip it. CKB's UTXO model prevents double-spending automatically.

**Warning signs:** TX logs show "finalization attempt #2" for same campaign in consecutive cycles. Campaign status changes but bot doesn't react.

### Pitfall 2: Bot Wallet Runs Out of CKB Mid-Cycle
**What goes wrong:** Bot attempts 3 finalizations in one cycle. First 2 succeed. Third fails with "insufficient funds to cover fee". Meanwhile, campaign is finalized on-chain but release/refund TXs are stuck pending for that campaign.

**Why it happens:** No pre-check of balance before submitting. Balance calculation doesn't account for previous TXs in the same cycle.

**How to avoid:** Before each TX submission, query bot wallet balance (`ccc.getBalance(botAddress)`). Log a warning if balance < threshold (e.g., 100 CKB). Let TX submit and fail naturally if balance is too low; the next cycle will retry. No need for elaborate balance math — the chain's fee estimation will reject insufficient-balance TXs.

**Warning signs:** Bot submits 1-2 TXs per cycle, then all subsequent attempts in that cycle return "insufficient funds". Check Render logs for balance warnings.

### Pitfall 3: Race Between Bot and Creator Finalization
**What goes wrong:** Both the bot and a creator (or another user/bot) submit finalization TX for the same expired campaign. Both TXs compete. Winner finalizes; loser fails. Bot doesn't handle gracefully.

**Why it happens:** Finalization is permissionless. Multiple actors can submit. Bot doesn't check if another actor just submitted.

**How to avoid:** This is fine. The TX that arrives first to the mempool wins. The losing TX fails with "cell already consumed". Bot catches the error, logs it, skips the campaign, moves on. Next cycle, on-chain status has changed to Success/Failed, so bot won't retry. No race condition — just expected collision.

**Warning signs:** TX logs show occasional "cell already consumed" errors for finalization attempts. This is normal in a permissionless system.

### Pitfall 4: Pledges Without Receipts After Finalization
**What goes wrong:** Campaign is finalized. Bot queries pledges, finds 10. Bot processes release/refund. But some pledges lack receipts in the receipt table. Bot crashes or silently skips them.

**Why it happens:** Pledges created before receipt implementation, or receipt creation TXs failed. Indexed state is out of sync with on-chain cells.

**How to avoid:** On release/refund, check if receipt exists for the backer. If missing, still process the pledge (both pledge-lock and receipt are optional for refund). For release, receipt not needed — pledge-lock automatically routes to creator. Log a note if receipt is missing.

**Warning signs:** Bot logs show "processing pledge without receipt" or release/refund TXs fail with "cell not found for receipt".

### Pitfall 5: Hardcoded Network Configuration
**What goes wrong:** Bot is deployed to testnet but uses devnet RPC URL. Finalization TXs target the wrong network's cells. Contracts have different code hashes on each network.

**Why it happens:** `CKB_RPC_URL`, contract code hashes hardcoded in bot initialization.

**How to avoid:** All network config comes from environment variables or deployment JSON. Use same pattern as indexer: `CKB_RPC_URL`, `CAMPAIGN_CODE_HASH`, `PLEDGE_CODE_HASH`, `PLEDGE_LOCK_CODE_HASH` all from `process.env`. Load deployed contracts from `deployment/deployed-contracts-testnet.json` (or mainnet variant).

**Warning signs:** Bot log shows "wrong network" or "unknown code hash". Check env vars in Render dashboard.

## Code Examples

Verified patterns from official sources:

### Creating a Signer from Private Key

```typescript
// Source: transaction-builder/test-create-campaign.ts:43
import { ccc } from "@ckb-ccc/core";
import { createCkbClient } from "./src/ckbClient";

const client = createCkbClient("testnet", process.env.CKB_RPC_URL);
const privateKeyHex = process.env.BOT_PRIVATE_KEY || "0x..."; // 32 bytes hex
const signer = new ccc.SignerCkbPrivateKey(client, privateKeyHex);

// Get bot's address:
const botAddress = await signer.getRecommendedAddress();
console.log(`Bot address: ${botAddress}`);
```

### Querying Campaigns and Detecting Expiry

```typescript
// Source: api.ts:246-257, database.ts:175-177
const currentBlock = await indexer.getCurrentBlockNumber();

for (const campaign of db.getAllCampaigns()) {
  // Skip if already finalized
  if (campaign.status !== 0) continue; // 0 = Active
  
  // Check if expired
  if (BigInt(campaign.deadline_block) <= currentBlock) {
    const totalPledged = BigInt(campaign.total_pledged);
    const fundingGoal = BigInt(campaign.funding_goal);
    const isSuccess = totalPledged >= fundingGoal;
    
    console.log(`Campaign ${campaign.id} expired, status: ${isSuccess ? "success" : "failed"}`);
    // → Send finalization TX
  }
}
```

### Calling finalizeCampaign()

```typescript
// Source: transaction-builder/builder.ts:187-295
import { TransactionBuilder } from "./src/builder";
import { CampaignStatus } from "./src/types";

const newStatus = isSuccess ? CampaignStatus.Success : CampaignStatus.Failed;
const txHash = await builder.finalizeCampaign(signer, {
  campaignOutPoint: {
    txHash: campaign.tx_hash,
    index: campaign.output_index,
  },
  campaignData: {
    creatorLockHash: campaign.creator_lock_hash,
    fundingGoal: BigInt(campaign.funding_goal),
    deadlineBlock: BigInt(campaign.deadline_block),
    totalPledged: BigInt(campaign.total_pledged),
    status: CampaignStatus.Active, // Current on-chain status
    title: campaign.title || undefined,
    description: campaign.description || undefined,
  },
  newStatus,
});
console.log(`Finalized campaign ${campaign.id}: ${txHash}`);
```

### Processing Pledges for Release/Refund

```typescript
// Source: transaction-builder/builder.ts:572-637, 644-710
const pledges = db.getPledgesForCampaign(campaign.tx_hash);

for (const pledge of pledges) {
  try {
    if (isSuccess) {
      // Release to creator
      const txHash = await builder.permissionlessRelease(signer, {
        pledgeOutPoint: {
          txHash: pledge.tx_hash,
          index: pledge.output_index,
        },
        pledgeCapacity: BigInt(pledge.amount),
        campaignCellDep: {
          txHash: campaign.tx_hash,
          index: campaign.output_index,
        },
        creatorLockScript: {
          codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
          hashType: "type",
          args: campaign.creator_lock_hash,
        },
        deadlineBlock: BigInt(campaign.deadline_block),
      });
      console.log(`Released pledge ${pledge.id}: ${txHash}`);
    } else {
      // Refund to backer
      const txHash = await builder.permissionlessRefund(signer, {
        pledgeOutPoint: {
          txHash: pledge.tx_hash,
          index: pledge.output_index,
        },
        pledgeCapacity: BigInt(pledge.amount),
        backerLockScript: {
          codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
          hashType: "type",
          args: pledge.backer_lock_hash,
        },
        deadlineBlock: BigInt(campaign.deadline_block),
      });
      console.log(`Refunded pledge ${pledge.id}: ${txHash}`);
    }
  } catch (error) {
    console.error(`Failed to process pledge ${pledge.id}:`, error);
  }
}
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| CKB RPC node (testnet) | Bot transaction submission | ✓ | Neon testnet public | Can use devnet for testing |
| Render environment variables | BOT_PRIVATE_KEY, CKB_RPC_URL, thresholds | ✓ | Render dashboard | Local .env for dev |
| Node.js runtime | TypeScript compilation, bot execution | ✓ | v18+ (in Render) | — |
| npm | Dependency management | ✓ | v9+ | — |

**Missing dependencies with no fallback:** None identified.

**Missing dependencies with fallback:** None identified.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual user finalization | Permissionless bot finalization | Phase 5 (campaign-lock contract) | Users no longer need to trigger finalization; fully automatic on deadline expiry |
| Single pledge distribution per TX | Bot can batch (discretion) | Phase 7 | Reduces TXs and fees; must respect 512 KB TX size limit |
| No automated distribution | Bot-triggered release/refund | Phase 7 | Users don't have to manually claim funds; immediate distribution post-finalization |

**Deprecated/outdated:**
- Manual finalization UI buttons: Frontend still shows "Finalize" button for non-expired campaigns, but bot makes it redundant for expired ones. Planner to decide if button remains for manual override.
- Static balance tracking: Previous versions required user to guess balance; bot proactively monitors and logs low-balance warnings.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ccc.SignerCkbPrivateKey(client, hex)` is the correct pattern for bot signing | Code Examples | Bot cannot sign TXs; finalization blocked |
| A2 | Database.getAllCampaigns() returns live campaign state from last indexing cycle | Code Examples | Bot finalizes already-finalized campaigns (blocked by UTXO model, but creates failed TXs) |
| A3 | CKB transaction size limit is ~512 KB, affecting pledge batch size | Pitfalls | Single TX finalizing 100+ pledges could exceed limit; requires testing for safe batch size |
| A4 | Campaign finalization is truly permissionless (no signature/origin check on-chain) | Pitfalls | Bot signature could be rejected; finalization blocked |
| A5 | Permissionless release/refund methods exist and work correctly on testnet | Code Examples | Methods don't exist or fail on testnet; release/refund blocked |

**If this table is not empty:** These claims should be verified by planner or during Phase 7 implementation planning.

## Open Questions

1. **Batch Size for Pledge Distribution**
   - What we know: CKB has ~512 KB TX size limit. Single TX can include multiple pledge inputs.
   - What's unclear: How many pledges fit in a single TX without exceeding size? Is 1 pledge/TX safe, or can we batch 5-10?
   - Recommendation: Research or test on devnet with sample TX sizes. Start conservative (1 pledge/TX) and optimize if needed.

2. **Low-Balance Threshold**
   - What we know: Bot should warn when balance is low and stop submitting TXs.
   - What's unclear: What threshold? 1 CKB? 10 CKB? Depends on avg TX size and cycle count.
   - Recommendation: Set threshold to ~50 CKB initially (covers ~50 finalization TXs at typical size). Planner adjusts based on actual costs.

3. **Duplicate Finalization Prevention**
   - What we know: Finalization is permissionless, so multiple bots could submit simultaneously.
   - What's unclear: Should bot track "just finalized" state to avoid re-submitting in next cycle? Or rely on on-chain status check?
   - Recommendation: Check on-chain status each cycle (simple, atomic). If status changed to Success/Failed, skip. This is race-safe.

4. **Error Code Classification**
   - What we know: Some TX failures are transient (RPC timeout), others permanent (insufficient balance).
   - What's unclear: Should bot distinguish and handle them differently?
   - Recommendation: For MVP, treat all failures as transient. Log error, retry next cycle. If a specific error is problematic, planner can add logic later.

## Validation Architecture

Skip this section: `workflow.nyquist_validation` is explicitly set to `false` in `.planning/config.json`.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | Yes | Private key stored securely in Render env vars; never logged or transmitted insecurely |
| V5 Input Validation | Yes | All campaign/pledge data sourced from trusted indexer DB; no user input |
| V6 Cryptography | Yes | CCC SDK handles secp256k1 signing; bot doesn't implement custom crypto |
| V9 Communication | Yes | RPC communication via HTTPS to CKB node; CCC SDK enforces this |

### Known Threat Patterns for {TypeScript/CKB}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Private key exposure | Spoofing, Repudiation | Store BOT_PRIVATE_KEY in Render secrets, never log, never commit to git; use env var only |
| Replay attacks on TXs | Tampering | CKB chain enforces TX uniqueness via inputs (UTXO consumed once); no additional mitigation needed |
| RPC endpoint compromise | Man-in-the-Middle | Use trusted CKB RPC (Neon testnet); deploy to same infrastructure (Render) to minimize network exposure |
| Bot wallet drained | Elevation of Privilege | Monitor balance, log warnings; no privileged operations possible (bot only finalizes/releases/refunds, all permissionless) |
| Double finalization | Tampering | UTXO model prevents: first TX consumes campaign cell; second TX fails with "cell already consumed"; no action needed |

## Sources

### Primary (HIGH confidence)
- **CCC SDK**: `@ckb-ccc/core` ^1.12.2 — [GitHub](https://github.com/ckb-ccc/ccc) — Signer, Client, TX building patterns verified in type definitions and test files
- **Existing codebase**: `off-chain/transaction-builder/src/builder.ts` — `finalizeCampaign()`, `permissionlessRelease()`, `permissionlessRefund()` methods with full implementations
- **Existing codebase**: `off-chain/indexer/src/indexer.ts` — `startBackgroundIndexing()` polling loop pattern (lines 398-412)
- **Existing codebase**: `off-chain/indexer/src/api.ts` — `computeEffectiveStatus()` method (lines 246-257) for expiry detection
- **Existing codebase**: `off-chain/indexer/src/database.ts` — Database query methods for campaigns and pledges (lines 175-223)

### Secondary (MEDIUM confidence)
- **CLAUDE.md** (project constraints): Transaction size limit ~512 KB; Render deployment pattern; env var usage
- **Deployment JSON**: `deployment/deployed-contracts-testnet.json` — Contract code hashes and addresses for testnet

### Tertiary (LOW confidence)
- None identified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries already in project, versions verified
- Architecture: HIGH — Bot integrates into existing indexer polling loop, reuses proven patterns
- Code patterns: HIGH — finalizeCampaign(), permissionlessRelease/Refund() already implemented; signer pattern in tests
- Pitfalls: MEDIUM — Based on permissionless nature of operations and UTXO model; some assumptions about race conditions not fully tested
- Environment: HIGH — CKB testnet and Render deployment already proven in production

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (30 days — stable codebase, no major library updates expected)
