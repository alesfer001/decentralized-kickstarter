# Phase 1: On-Chain Contracts - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 01-on-chain-contracts
**Areas discussed:** Lock script args layout, Fee handling model, Campaign type script changes, Testing strategy

---

## Lock Script Args Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Full context (72B) | campaign_type_script_hash + deadline + backer_lock_hash. Fully self-contained. | ✓ |
| Minimal + cell_deps (64B) | Skip deadline, read from campaign cell_dep. Smaller but requires campaign cell. | |
| Extended with amount (80B) | Full + pledge_amount. Redundant but defense-in-depth. | |

**User's choice:** Full context (72 bytes)
**Notes:** Self-contained lock means all validation paths work without external dependencies except campaign cell_dep for status check.

---

## Fee Handling Model

| Option | Description | Selected |
|--------|-------------|----------|
| Lock verifies destination only | Tx builder handles amounts. Simpler but drainable. | |
| Lock enforces min output | output >= input - MAX_FEE. Prevents draining. | ✓ |
| Lock enforces exact output | output == input. Fee from separate cell only. Strictest. | |

**User's choice:** Lock enforces min output (capacity - MAX_FEE)
**Notes:** Balances security (prevents draining) with flexibility (fee deducted from pledge capacity).

---

## Campaign Type Script Changes

### Destruction Protection

| Option | Description | Selected |
|--------|-------------|----------|
| Off-chain enforcement | Indexer/tx builder prevents premature destruction | |
| Pledge counter (on-chain) | Campaign tracks active pledge count | |
| Fail-safe refund fallback | No campaign cell_dep after deadline = default refund | ✓ |

**User's choice:** Initially leaned toward off-chain, then chose fail-safe refund as on-chain protection
**Notes:** User raised concern about decentralization of indexer-only approach. Fail-safe refund provides on-chain backer protection: if campaign cell is absent after deadline, backers can always refund. Off-chain enforcement via indexer supplements this for v1.1.

### TypeID

| Option | Description | Selected |
|--------|-------------|----------|
| First 32B of args = TypeID | Standard CKB pattern | ✓ |
| Separate TypeID type script | Layered type scripts. Non-standard. | |

**User's choice:** Standard TypeID in first 32 bytes of args
**Notes:** No discussion needed — straightforward standard pattern.

---

## Testing Strategy

### Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Native simulator + devnet | Unit tests + integration tests | ✓ |
| Native simulator only | Unit tests only, faster but misses integration bugs | |
| Devnet only | Slower iteration, tests real transactions | |

### Scenarios

| Option | Description | Selected |
|--------|-------------|----------|
| Core paths + attacks (~10 cases) | Success, failure, deadline, fake cell_dep, dedup, receipt | ✓ |
| Happy paths only (~4 cases) | Basic success/failure only | |
| Comprehensive (~15+ cases) | All above + edge cases | |

**User's choice:** Native simulator + devnet, core paths + attacks
**Notes:** ~10 must-have test scenarios covering both happy paths and attack vectors.

---

## Deferred Ideas

- Fully on-chain pledge counter for trustless destruction protection
- Community-run indexer federation model
