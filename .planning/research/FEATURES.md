# Features Research — CKB Trustless Fund Distribution (v1.1)

## Table Stakes Features

These are required for the platform to be considered "trustless":

| Feature | Complexity | Description |
|---------|-----------|-------------|
| **Custom pledge lock script** | High | Lock script that routes funds based on campaign outcome. Core of v1.1. |
| **Permissionless release** | Medium | Anyone can trigger fund release on success. Lock script enforces creator gets funds. |
| **Permissionless refund** | Medium | Anyone can trigger refund on failure. Lock script enforces backer gets funds back. |
| **On-chain deadline enforcement** | Medium | Use CKB `since` field. No spending before deadline. After deadline, status determines routing. |
| **Pledge locking** | Low | Pledges cannot be withdrawn before deadline. Lock script rejects early spending. |

## Differentiators

These add value but aren't strictly required for trustless operation:

| Feature | Complexity | Description |
|---------|-----------|-------------|
| **Receipt/claim cells** | High | Separate proof-of-pledge cell. Enables merging while preserving refund identity. |
| **Pledge consolidation** | High | Merge N pledge cells into 1. Solves tx size limits for popular campaigns. |
| **Batch release/refund** | Medium | Process multiple pledges in one transaction. UX improvement for campaigns with many backers. |
| **Bot-triggered distribution** | Low | Simple script that watches for finalized campaigns and auto-triggers release/refund txs. |
| **Campaign cell TypeID** | Low | Stable identity for campaign cells across state transitions. Already planned. |

## Anti-Features (Do NOT Build)

| Anti-Feature | Why Not |
|-------------|---------|
| **Creator-controlled fund routing** | Defeats trustless purpose. Lock script must enforce, not creator. |
| **Upgradeable lock scripts** | Security risk. Deployed lock script should be immutable. |
| **Off-chain status oracle** | No external oracles. Campaign status must be read from on-chain cell. |
| **Partial refunds** | All-or-nothing model. Backer gets full amount back or nothing. |

## Feature Dependencies

```
Custom Pledge Lock Script
  └── On-chain Deadline Enforcement (since field)
  └── Cell Deps Pattern (reading campaign status)

Receipt/Claim Cells
  └── New Type Script (receipt validation)
  └── Updated Pledge Creation (mint receipt during pledge)

Pledge Consolidation
  └── Receipt/Claim Cells (preserves identity after merge)
  └── Updated Lock Script (handle merge case)

Permissionless Release/Refund
  └── Custom Pledge Lock Script (enforces routing)
  └── Updated Transaction Builder (new operations)
  └── Updated Frontend (remove manual buttons, show auto status)
```

## Complexity Estimates

| Feature | Contract Work | Off-Chain Work | Total |
|---------|--------------|----------------|-------|
| Pledge Lock Script | High (new Rust contract) | Medium (new tx builder ops) | **High** |
| Receipt Type Script | Medium (new Rust contract) | Medium (new tx builder ops) | **Medium-High** |
| On-chain Deadline | Low (since field in lock) | Low (set since in tx builder) | **Low** |
| Pledge Merging | Medium (lock script logic) | Medium (new merge operation) | **Medium** |
| Frontend Updates | N/A | Medium (new UX flow) | **Medium** |
| Indexer Updates | N/A | Medium (track new cell types) | **Medium** |
