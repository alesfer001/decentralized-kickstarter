# Phase 7: Automatic Finalization Bot - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 07-automatic-finalization-bot
**Areas discussed:** Architecture & hosting, Scope of automation, Bot wallet & funding, Failure handling

---

## Architecture & Hosting

| Option | Description | Selected |
|--------|-------------|----------|
| Inside the indexer (Recommended) | Add finalization loop to existing indexer on Render. Already polls CKB and knows expired campaigns. No new deployment. | ✓ |
| Separate service | Standalone Node.js service deployed independently. Cleaner separation but adds a second Render service. | |
| Cron job endpoint | HTTP endpoint on indexer triggered by external cron service. Simpler scheduling control. | |

**User's choice:** Inside the indexer
**Notes:** None

### Poll Frequency

| Option | Description | Selected |
|--------|-------------|----------|
| Same as indexer poll (10s) | Check every indexing cycle. Campaigns finalized within seconds of expiring. | ✓ |
| Slower interval (1-5 min) | Separate timer, less frequent checks. Reduces RPC calls. | |
| You decide | Claude picks based on CKB block time and Render constraints. | |

**User's choice:** Same as indexer poll (10s)
**Notes:** None

---

## Scope of Automation

| Option | Description | Selected |
|--------|-------------|----------|
| Finalize + release/refund (Recommended) | After finalizing, also submit release (success) or refund (failure) for each pledge. Full end-to-end. | ✓ |
| Finalize only | Only transitions Active → Success/Failed. Release/refund still needs manual trigger. | |
| Finalize + release only | Auto-release to creator on success, refunds still manual. | |

**User's choice:** Finalize + release/refund
**Notes:** None

### Batch Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| One pledge per tx | Each release/refund is separate tx. Simpler, avoids tx size limits. | |
| Batch multiple pledges | Group several pledges into one tx. Fewer transactions, faster. | |
| You decide | Claude picks based on CKB tx size constraints and existing patterns. | ✓ |

**User's choice:** You decide
**Notes:** None

---

## Bot Wallet & Funding

### Key Management

| Option | Description | Selected |
|--------|-------------|----------|
| Environment variable (Recommended) | Store private key as Render env var. Same pattern as other secrets. | ✓ |
| Generated on first run | Bot generates keypair on startup. Persistence issues on Render free tier. | |
| Hardcoded devnet key | Use existing devnet test account key. Only works on devnet. | |

**User's choice:** Environment variable
**Notes:** None

### Funding Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Manual top-up | Developer sends CKB when balance low. Bot logs warning below threshold. | ✓ |
| Faucet on startup | Devnet: pre-funded keys. Testnet: log address, prompt manual funding. | |
| You decide | Claude picks based on network and existing patterns. | |

**User's choice:** Manual top-up
**Notes:** None

---

## Failure Handling

### Retry Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Retry next cycle (Recommended) | Log error, skip, try again next 10s cycle. No backoff or counter. | ✓ |
| Retry with backoff | Exponential backoff per campaign. More complex state tracking. | |
| Retry N times then skip | Try 3-5 times then stop. Requires persistent tracking. | |

**User's choice:** Retry next cycle
**Notes:** None

### Monitoring

| Option | Description | Selected |
|--------|-------------|----------|
| Console logs only (Recommended) | Log attempts, successes, failures, balance warnings to stdout. Visible in Render. | ✓ |
| Logs + API status endpoint | Console logs plus GET /bot-status endpoint. Queryable from frontend or curl. | |
| You decide | Claude picks based on existing indexer logging patterns. | |

**User's choice:** Console logs only
**Notes:** None

---

## Claude's Discretion

- Batch vs single pledge processing for release/refund
- Low-balance warning threshold
- Signer construction from private key
- Duplicate submission prevention within same cycle
- Error classification (transient vs permanent)

## Deferred Ideas

None — discussion stayed within phase scope
