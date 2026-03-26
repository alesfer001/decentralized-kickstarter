# CKB Kickstarter v1.1 — Trustless Automatic Fund Distribution

## What This Is

A decentralized all-or-nothing crowdfunding platform on Nervos CKB. v1.0 (testnet MVP) handles the full campaign lifecycle but requires backers to manually cooperate for fund release/refund. v1.1 replaces manual cooperation with on-chain enforced, permissionless fund distribution — making the platform truly trustless.

## Core Value

Backers' funds are automatically routed to the correct destination (creator on success, backer on failure) without anyone's cooperation — enforced entirely by on-chain scripts.

## Requirements

### Validated

- ✓ Campaign creation with on-chain metadata (title, description, goal, deadline) — v1.0
- ✓ Backer pledging with individual pledge cells linked to campaigns — v1.0
- ✓ Campaign finalization (Active → Success/Failed based on goal) — v1.0
- ✓ Manual fund release to creator on success — v1.0
- ✓ Manual refund to backer on failure — v1.0
- ✓ Campaign destruction and capacity reclaim — v1.0
- ✓ Frontend with campaign listing, creation, detail pages, wallet integration — v1.0
- ✓ SQLite indexer with REST API for campaign/pledge queries — v1.0
- ✓ JoyID wallet integration via CCC connector — v1.0
- ✓ Multi-network support (devnet, testnet, mainnet) — v1.0

### Active

- [ ] Custom Pledge Lock Script — Rust lock script that enforces fund routing based on campaign status (read via cell_deps). Permissionless: anyone can trigger release/refund transactions.
- [ ] Receipt/Claim Type Script — Rust type script issued to backers when pledging. Stores pledge amount + backer lock script hash. Serves as proof of contribution for refunds after pledge consolidation.
- [ ] Pledge Consolidation/Merging — Anyone can merge multiple pledge cells into fewer cells. Receipt cells preserve per-backer identity for refunds.
- [ ] On-chain Deadline Enforcement — Use CKB `since` field to enforce campaign deadline in contract validation. No more off-chain-only deadline checks.
- [ ] Pledges Locked Until Deadline — Custom lock script prevents spending pledge cells before deadline (no early withdrawal).
- [ ] Updated Transaction Builder — New operations: createPledgeWithReceipt, mergeContributions, permissionlessRelease, permissionlessRefund.
- [ ] Updated Indexer — Track receipt/claim cells, merged contributions, new lock script hash.
- [ ] Updated Frontend — Remove manual release/refund buttons. Show automatic distribution status. Display receipt cells per backer.

### Out of Scope

- Campaign cancellation/editing — v1.2
- sUDT/xUDT support (stablecoin campaigns) — v1.3
- Milestone-based fund release with backer voting — v2.0
- NFT rewards via Spore — v2.0
- .bit identity integration — v2.0
- Cross-chain pledging via RGB++ — v3.0
- Mainnet deployment — after v1.1 testnet validation

## Context

- **Prior art:** joii2020/crowdfunding demo on CKB uses the same Contribution-as-Lock-Script pattern with separate Claim receipt cells. Referenced by RetricSu (CKB core developer). Written in TypeScript via ckb-js-vm. Our implementation will be in Rust for consistency with existing contracts.
- **Existing contracts:** Campaign Type Script (`contracts/campaign/src/main.rs`) and Pledge Type Script (`contracts/pledge/src/main.rs`) — both Rust, compiled to RISC-V via ckb-std.
- **CKBuilder feedback:** Issue #6 submitted to CKBuilder-projects repo for technical review of the lock script design. Awaiting responses.
- **Community engagement:** Nervos Talk post live with positive feedback from Ophiuchus and RetricSu. Indexer migrated from Cloudflare tunnel to Render for reliability.
- **Testnet validation:** Neon (CKB team member) successfully tested full lifecycle on testnet.

## Constraints

- **Tech stack**: Rust + ckb-std for on-chain contracts, TypeScript + CCC SDK for off-chain. Must maintain consistency with v1.0.
- **CKB cell model**: Lock scripts control spending, type scripts validate state. Custom lock script must work within CKB's UTXO-like model.
- **Transaction size**: CKB has max transaction size limits. Pledge merging addresses this but adds complexity.
- **Backward compatibility**: v1.1 deploys new contracts. Existing v1.0 campaigns/pledges on testnet won't be migrated — clean deployment.
- **Budget**: Free tier infrastructure (Render indexer, Vercel frontend). No paid services.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Pledge-as-Lock-Script (custom lock) | Enables permissionless fund routing — anyone can trigger, script enforces destination | — Pending |
| Separate Receipt/Claim cell | Required for pledge merging — preserves per-backer identity after consolidation | — Pending |
| Read campaign status via cell_deps | Lock script reads campaign cell from cell_deps to determine release vs refund routing | — Pending |
| Fully permissionless release/refund | Anyone (bot or user) can build release/refund transactions. Lock script enforces correct routing | — Pending |
| Pledges locked until deadline | No early withdrawal. Stronger commitment model, simpler lock script logic | — Pending |
| Rust for new contracts | Consistent with existing campaign/pledge type scripts. Battle-tested on CKB | — Pending |
| On-chain deadline via `since` field | Removes off-chain-only deadline enforcement gap. CKB native mechanism | — Pending |
| Include pledge merging in v1.1 | joii2020 pattern validated. Solves scalability for popular campaigns | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-26 after initialization*
