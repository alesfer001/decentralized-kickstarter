# Requirements: CKB Kickstarter v1.1

**Defined:** 2026-03-26
**Core Value:** Backers' funds are automatically routed to the correct destination (creator on success, backer on failure) without anyone's cooperation — enforced entirely by on-chain scripts.

## v1 Requirements

Requirements for v1.1 release. Each maps to roadmap phases.

### Pledge Lock Script

- [ ] **LOCK-01**: Pledge lock script enforces fund routing — on success, output capacity goes to creator lock hash; on failure, output capacity goes to backer lock hash
- [ ] **LOCK-02**: Pledge lock script enforces deadline via CKB `since` field — pledges cannot be spent before deadline block
- [ ] **LOCK-03**: Pledge lock script reads campaign status from cell_deps and verifies campaign identity via type script hash (TypeID)
- [ ] **LOCK-04**: Pledge lock script args encode backer_lock_hash to prevent lock script dedup vulnerability (unique args per backer)

### Receipt Type Script

- [ ] **RCPT-01**: Receipt type script validates creation alongside valid pledge cell with matching amount
- [ ] **RCPT-02**: Receipt cell stores pledge amount and backer lock hash, immutable after creation
- [ ] **RCPT-03**: Receipt type script validates destruction during refund — amount matches capacity returned to backer

### Pledge Merging

- [ ] **MERGE-01**: Pledge cells for the same campaign can be merged (N inputs → 1 output, capacity sum preserved)
- [ ] **MERGE-02**: Pledge type script updated to allow merge pattern (N → 1) and partial refund pattern (1 → 1 reduced + 1 refund)

### Campaign Updates

- [ ] **CAMP-01**: Campaign type script updated to use TypeID for unforgeable identity
- [ ] **CAMP-02**: Campaign type script prevents destruction while unresolved pledge cells exist

### Transaction Builder

- [ ] **TXB-01**: Transaction builder supports createPledgeWithReceipt operation (pledge cell + receipt cell in one tx)
- [ ] **TXB-02**: Transaction builder supports permissionlessRelease operation (anyone triggers, lock routes to creator)
- [ ] **TXB-03**: Transaction builder supports permissionlessRefund operation (anyone triggers, lock routes to backer using receipt)
- [ ] **TXB-04**: Transaction builder supports mergeContributions operation (N pledge cells → 1)

### Indexer

- [ ] **IDX-01**: Indexer tracks receipt cells and maps them to backers/campaigns
- [ ] **IDX-02**: Indexer tracks merged pledge cells and reports correct totals

### Frontend

- [ ] **UI-01**: Frontend removes manual release/refund buttons, shows automatic distribution status
- [ ] **UI-02**: Frontend displays receipt cells per backer as proof of pledge
- [ ] **UI-03**: Frontend shows pledge lock status (locked/released/refunded)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Campaign Management
- **CMGMT-01**: Campaign cancellation by creator (before first pledge)
- **CMGMT-02**: Campaign editing (title/description before first pledge)
- **CMGMT-03**: User dashboard showing created campaigns and pledges

### Token Support
- **TOKEN-01**: sUDT/xUDT campaigns (stablecoin-denominated goals)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Milestone-based fund release | v2.0 — requires backer voting mechanism |
| NFT rewards via Spore | v2.0 — separate reward system |
| .bit identity integration | v2.0 — identity layer |
| Cross-chain pledging via RGB++ | v3.0 — cross-chain complexity |
| Mainnet deployment | After v1.1 testnet validation |
| Early pledge withdrawal | Design decision — pledges locked until deadline for stronger commitment |
| Bot/automation service | Nice-to-have but not core — any user/bot can trigger permissionless txs |

## Traceability

| Requirement | Phase | Status |
|------------|-------|--------|
| LOCK-01 | — | Pending |
| LOCK-02 | — | Pending |
| LOCK-03 | — | Pending |
| LOCK-04 | — | Pending |
| RCPT-01 | — | Pending |
| RCPT-02 | — | Pending |
| RCPT-03 | — | Pending |
| MERGE-01 | — | Pending |
| MERGE-02 | — | Pending |
| CAMP-01 | — | Pending |
| CAMP-02 | — | Pending |
| TXB-01 | — | Pending |
| TXB-02 | — | Pending |
| TXB-03 | — | Pending |
| TXB-04 | — | Pending |
| IDX-01 | — | Pending |
| IDX-02 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
| UI-03 | — | Pending |
