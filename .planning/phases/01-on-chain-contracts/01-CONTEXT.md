# Phase 1: On-Chain Contracts - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement and test four on-chain Rust scripts that enforce trustless fund distribution:
1. **Pledge Lock Script** (NEW) — controls when/how pledge cells can be spent, routes funds to correct destination
2. **Receipt Type Script** (NEW) — validates backer proof-of-pledge cells
3. **Campaign Type Script** (UPDATED) — add TypeID for unforgeable identity
4. **Pledge Type Script** (UPDATED) — allow merge pattern (N→1) and partial refund pattern

Does NOT include: transaction builder, indexer, frontend, or deployment (Phase 2-3).
</domain>

<decisions>
## Implementation Decisions

### Lock Script Args Layout
- **D-01:** Full context in args: `campaign_type_script_hash (32B) + deadline (8B) + backer_lock_hash (32B) = 72 bytes`. Lock is fully self-contained for all validation paths.
- **D-02:** `backer_lock_hash` in args ensures unique lock args per backer, preventing CKB lock script dedup vulnerability.

### Lock Script Spending Logic
- **D-03:** Before deadline: reject all spending (pledges locked). Exception: merge transactions (multiple pledge cells → 1, same lock, capacity preserved).
- **D-04:** After deadline + campaign cell_dep with status=Success: verify output goes to `creator_lock_hash` (read from campaign cell data).
- **D-05:** After deadline + campaign cell_dep with status=Failed: verify output goes to `backer_lock_hash` (from lock args).
- **D-06:** After deadline + NO campaign cell_dep provided: **fail-safe refund** — default to backer refund path. This prevents creator griefing by destroying the campaign cell.

### Fee Handling
- **D-07:** Lock enforces minimum output: `output_capacity >= input_capacity - MAX_FEE` (MAX_FEE = 1 CKB = 100_000_000 shannons). Prevents pledge draining while allowing fee flexibility. Fee comes from the difference.

### Campaign Type Script Changes
- **D-08:** Adopt TypeID — first 32 bytes of type script args are TypeID (standard CKB pattern). Pledge lock args reference the full type script hash including TypeID.
- **D-09:** Campaign destruction protection: off-chain enforcement via indexer/tx builder for v1.1. The fail-safe refund (D-06) provides on-chain backer protection regardless.

### Receipt Type Script
- **D-10:** Receipt cell stores: `pledge_amount (8B) + backer_lock_hash (32B) = 40 bytes` in cell data.
- **D-11:** Creation validation: receipt must be created in same transaction as a valid pledge cell with matching amount.
- **D-12:** Destruction during refund: verify refund amount matches receipt's stored pledge_amount, and output goes to backer_lock_hash from receipt data.

### Pledge Type Script Changes
- **D-13:** Allow merge pattern: N input pledge cells → 1 output pledge cell (same campaign, total capacity preserved).
- **D-14:** Allow partial refund from merged cell: 1 input → 1 reduced output + 1 refund output (capacity difference matches receipt amount).

### Testing Strategy
- **D-15:** Native simulator for unit tests (all script paths) + devnet for integration tests (full transactions).
- **D-16:** Must-have test scenarios (~10 cases): success release, failed refund, fail-safe refund (no cell_dep), deadline enforcement (before/at/after), fake cell_dep rejection, lock dedup safety, receipt creation validation, receipt destruction validation, merge capacity preservation, TypeID verification.

### Claude's Discretion
- Exact MAX_FEE constant value (1 CKB suggested, Claude can adjust)
- Internal error code numbering
- Helper function organization within contracts
- Specific ckb-std API usage patterns
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Contracts
- `contracts/campaign/src/main.rs` — Current campaign type script (Rust). CampaignData struct at line 42, finalization logic to understand.
- `contracts/pledge/src/main.rs` — Current pledge type script (Rust). ERROR_MODIFICATION_NOT_ALLOWED blocks merging — must be updated.
- `contracts/campaign/Cargo.toml` — ckb-std 1.0 dependency configuration
- `contracts/pledge/Cargo.toml` — Same ckb-std 1.0 setup to replicate for new contracts

### Research & Analysis
- `.planning/research/ARCHITECTURE.md` — Transaction structures for all 4 operations
- `.planning/research/PITFALLS.md` — Critical vulnerabilities: fake cell_deps, lock dedup, since confusion, receipt forgery
- `.planning/research/STACK.md` — ckb-std APIs for lock scripts, since validation helpers

### Prior Art
- Memory: `reference_joii2020_crowdfunding.md` — joii2020/crowdfunding Contribution lock script pattern, Claim receipt pattern, merge design

### Build Configuration
- `Makefile` — Contract build commands
- `scripts/build-contracts.sh` — Build script for RISC-V compilation
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CampaignData` struct (`contracts/campaign/src/main.rs:42`) — 65-byte layout with creator_lock_hash, funding_goal, deadline_block, status. Lock script reads this from cell_deps.
- `PledgeData` struct (`contracts/pledge/src/main.rs`) — existing pledge cell data layout. May need extending for v1.1.
- Build toolchain — Makefile + build script already configured for RISC-V Rust compilation.

### Established Patterns
- `ckb_std::entry!` macro for contract entry points
- `ckb_std::default_alloc!` for heap configuration (16KB fixed, 1.2MB dynamic)
- Error codes as `const i8` values
- `from_bytes` / `to_bytes` pattern for cell data serialization
- `high_level::load_script()`, `load_cell_data()`, `load_cell_type_hash()` for cell access

### Integration Points
- New contracts will be compiled alongside existing ones via Makefile
- Deployment script (`scripts/deploy-contracts.ts`) will need entries for new contracts
- `deployment/deployed-contracts-testnet.json` stores code hashes after deployment
</code_context>

<specifics>
## Specific Ideas

- joii2020/crowdfunding validates the Contribution-as-Lock-Script pattern — our Rust implementation follows the same conceptual model but with different encoding
- Fail-safe refund (D-06) is a novel addition not present in joii2020 — provides backer protection even if campaign cell is destroyed
- TypeID adoption follows standard CKB pattern (first 32 bytes of type script args)
</specifics>

<deferred>
## Deferred Ideas

- **Fully on-chain pledge counter** — Track active pledge count in campaign cell to prevent destruction without indexer. Deferred due to tx contention concerns. Revisit if community wants fully trustless destruction protection.
- **Community-run indexer** — Allow anyone to run the indexer for true decentralization. Architecture already supports it (open source), but no formal federation/incentive model yet.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.
</deferred>

---

*Phase: 01-on-chain-contracts*
*Context gathered: 2026-03-26*
