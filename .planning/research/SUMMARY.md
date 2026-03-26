# Research Summary — CKB Trustless Fund Distribution (v1.1)

## Key Findings

### Stack
- **Rust + ckb-std 1.0** for all new contracts (consistent with v1.0)
- Lock script APIs: `load_cell_data`, `load_cell_type_hash`, `load_input_since` from cell_deps
- **CCC SDK v1.12.2** for transaction building (already in use)
- `since` field with absolute block number mode for deadline enforcement
- Native simulator for unit testing, devnet for integration

### Table Stakes (must have for v1.1)
1. Custom pledge lock script — routes funds based on campaign status
2. Permissionless release/refund — anyone can trigger, lock enforces routing
3. On-chain deadline enforcement — via CKB `since` field
4. Pledges locked until deadline — no early withdrawal

### Differentiators (included in scope)
1. Receipt/claim cells — proof of pledge surviving consolidation
2. Pledge consolidation/merging — solves tx size limits for popular campaigns

### Watch Out For
1. **Fake cell deps** — MUST verify type script hash of campaign cell dep (CRITICAL)
2. **Receipt forgery** — type script must validate creation context (HIGH)
3. **Since field modes** — use absolute block number, test boundary conditions
4. **Fee handling** — deduct small fee from pledge capacity for permissionless txs
5. **Campaign cell lifecycle** — can't destroy until all pledges resolved

## Architecture Decision

### Script Model (4 scripts total)
```
Campaign Type Script (existing, minor updates)
Pledge Type Script (existing, minor updates)
Pledge Lock Script (NEW) — fund custody & routing
Receipt Type Script (NEW) — backer proof of pledge
```

### Build Order
1. **Contracts first:** Pledge Lock Script + Receipt Type Script
2. **Type script updates:** Campaign/Pledge may need minor changes
3. **Transaction builder:** New operations for lock script flow
4. **Indexer:** Track receipt cells, merged pledges
5. **Frontend:** New automatic distribution UX

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Fake cell deps attack | Critical | Verify type script hash in lock args |
| Receipt forgery | High | Validate creation context in receipt type script |
| Since field bugs | Medium | Use ckb_std::since helper, test boundaries |
| Campaign consumed early | Medium | Prevent destruction while pledges exist |
| Fee economics | Low | Deduct from pledge capacity |

## Recommendation

Proceed with coarse-grained phasing:
1. **Phase 1: On-chain contracts** — Pledge Lock Script + Receipt Type Script + updated type scripts + contract tests
2. **Phase 2: Off-chain integration** — Transaction builder + indexer updates + deployment
3. **Phase 3: Frontend + E2E** — UI updates + end-to-end testing + testnet validation

This follows the natural dependency chain: contracts → tx builder → UI.
