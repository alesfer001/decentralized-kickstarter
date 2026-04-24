# Phase 7: Automatic Finalization Bot - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Build an automatic finalization bot that detects expired campaigns and submits finalization transactions, then triggers permissionless release/refund for all associated pledges. Integrated into the existing indexer process. The platform becomes fully automatic — no manual intervention needed after a campaign deadline passes.

Does NOT include: new contract changes, frontend changes, or mainnet deployment.

</domain>

<decisions>
## Implementation Decisions

### Architecture & Hosting
- **D-01:** Bot runs inside the existing indexer process on Render — no new service deployment. The indexer already polls CKB and tracks campaign state, so the bot adds a finalization check to the same loop.
- **D-02:** Finalization check runs on the same 10-second polling interval as the indexer. Each cycle, after indexing, the bot scans for campaigns with `expired_success` or `expired_failed` effective status that are still `Active` on-chain.

### Scope of Automation
- **D-03:** Full end-to-end automation: finalize expired campaigns (Active → Success/Failed), then trigger permissionless release (success) or permissionless refund (failure) for each pledge cell.
- **D-04:** After finalizing a campaign, the bot processes release/refund for associated pledges in subsequent cycles — finalize first, distribute next.

### Bot Wallet & Funding
- **D-05:** Bot private key stored as a Render environment variable (`BOT_PRIVATE_KEY`). Same pattern as other secrets (code hashes, RPC URL).
- **D-06:** Bot wallet funded manually — developer sends CKB to the bot's address when balance is low. Bot logs a warning when balance drops below a configurable threshold.
- **D-07:** On devnet, use one of the pre-funded test account keys for convenience.

### Failure Handling
- **D-08:** On tx failure, log the error and skip the campaign/pledge. Retry on the next poll cycle (10s). No backoff, no retry counter — the bot simply keeps trying each cycle until the tx succeeds.
- **D-09:** Console logging only — finalization attempts, successes, failures, and balance warnings to stdout. Visible in Render logs dashboard. No external monitoring or status endpoints.

### Claude's Discretion
- Whether to process release/refund as one pledge per tx or batch multiple pledges (based on CKB tx size constraints and existing builder patterns)
- Exact low-balance warning threshold
- How to construct the CCC signer from the private key (likely `ccc.SignerCkbPrivateKey`)
- Whether to track "in-progress" finalization state to avoid duplicate tx submissions within the same cycle
- Error code classification (transient vs permanent failures)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Transaction Builder (finalization + release/refund)
- `off-chain/transaction-builder/src/builder.ts` — `finalizeCampaign()` at line 187, `permissionlessRelease()`, `permissionlessRefund()` — the bot will call these methods
- `off-chain/transaction-builder/src/types.ts` — `FinalizeCampaignParams`, release/refund param types

### Indexer (bot host + campaign state)
- `off-chain/indexer/src/indexer.ts` — `CampaignIndexer` class, `startBackgroundIndexing()` at line 380, polling loop structure
- `off-chain/indexer/src/index.ts` — Entry point, `POLL_INTERVAL` config, env var loading
- `off-chain/indexer/src/api.ts` — `computeEffectiveStatus()` at line 246 — logic for detecting expired campaigns
- `off-chain/indexer/src/database.ts` — Campaign/pledge DB schema, query patterns
- `off-chain/indexer/src/types.ts` — `Campaign`, `CampaignStatus`, `Pledge` types

### CKB Client
- `off-chain/indexer/src/indexer.ts` — `createCkbClient()` pattern for RPC client construction
- `off-chain/transaction-builder/src/ckbClient.ts` — CCC client factory

### Contract Code Hashes
- `deployment/deployed-contracts-testnet.json` — Deployed contract code hashes needed for tx construction

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TransactionBuilder.finalizeCampaign()` — Complete finalization tx construction, takes signer + params, returns tx hash
- `TransactionBuilder.permissionlessRelease()` / `permissionlessRefund()` — Release/refund tx construction
- `CampaignIndexer` class — Already has polling loop, DB access, CKB client
- `computeEffectiveStatus()` — Already computes `expired_success`/`expired_failed` for campaigns past deadline
- `Database` class — SQLite queries for campaigns and pledges by status

### Established Patterns
- `setInterval` polling with `POLL_INTERVAL` env var
- `ccc.ClientPublicTestnet` / `ccc.ClientPublicMainnet` for RPC client (network from env)
- `console.log()` for all logging (no logging framework)
- Environment variables for all config (`process.env.*`)
- `async/await` with try-catch for CKB RPC calls

### Integration Points
- Bot logic hooks into `startBackgroundIndexing()` — after each `indexAll()` call, run finalization check
- Bot needs a `ccc.Signer` constructed from private key — `ccc.SignerCkbPrivateKey` likely
- Bot queries `Database` for campaigns where on-chain status is Active but effective status is expired
- Bot queries `Database` for pledges linked to finalized campaigns that haven't been released/refunded

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-automatic-finalization-bot*
*Context gathered: 2026-04-24*
