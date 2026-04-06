# Phase 5: Permissionless Finalization (Campaign Lock Script) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 05-permissionless-finalization-campaign-lock-script
**Areas discussed:** Lock script validation logic, Deployment & migration strategy, Finalization status determination, Testing approach

---

## Lock Script Validation Logic

### Deadline Enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| CKB since field | Use transaction's since field to enforce minimum block number — CKB natively rejects tx if current block < since value. Same pattern as pledge-lock. | ✓ |
| Read block header in script | Load header from cell_deps and compare against deadline. More flexible but adds complexity. | |

**User's choice:** CKB since field (Recommended)
**Notes:** Consistent with pledge-lock pattern already used in the project.

### Lock Args Content

| Option | Description | Selected |
|--------|-------------|----------|
| deadline_block only (8 bytes) | Minimal — lock only needs the deadline. Campaign data is in the type script's cell data. | ✓ |
| deadline_block + creator_lock_hash (40 bytes) | Includes creator hash for optional early finalization. But early finalization deferred to v1.2. | |
| deadline_block + campaign_type_hash (40 bytes) | Includes type script hash for anti-spoofing. Extra safety but TypeID already self-validates. | |

**User's choice:** deadline_block only (8 bytes)
**Notes:** Early finalization deferred to v1.2 per earlier conversation — no need for creator hash in args.

### Validation Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Since field only | Lock just checks since >= deadline_block. Type script validates state transitions. Minimal code. | ✓ |
| Since + verify type script present | Also check output cell still has campaign type script attached. | |
| You decide | Claude picks the right balance. | |

**User's choice:** Since field only (Recommended)
**Notes:** Minimal attack surface. Type script already handles all state validation.

---

## Deployment & Migration Strategy

### Existing Campaign Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Clean slate | Wipe testnet state. All new campaigns use campaign-lock. Old campaigns become orphans. | ✓ |
| Coexist with old campaigns | Keep old campaigns accessible with creator-only finalization. Frontend detects lock type. | |
| You decide | Claude picks based on complexity tradeoffs. | |

**User's choice:** Clean slate (Recommended)
**Notes:** No backward-compatibility code needed.

### Frontend Rollout

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate with deployment | Coordinated push: contracts + frontend constants + remove isCreator check. | ✓ |
| Feature flag | Deploy contracts first, flip flag later. | |

**User's choice:** Immediate with deployment (Recommended)
**Notes:** Testnet doesn't need gradual rollout.

---

## Finalization Status Determination

### On-chain vs Off-chain Trust

| Option | Description | Selected |
|--------|-------------|----------|
| Keep current model | Finalizer submits status, type script validates transition. Off-chain indexer determines correct status. Pledge lock + fail-safe protect backers. | ✓ |
| On-chain enforcement via total_pledged | Type script reads total_pledged vs goal. But total_pledged is written by off-chain code. | |
| Lock script restricts status choices | Only allow Failed; Success requires pledge proof. More trustless but significantly complex. | |

**User's choice:** Keep current model (Recommended)
**Notes:** Backers are protected regardless by pledge lock + fail-safe refund mechanism.

---

## Testing Approach

### Validation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Devnet lifecycle + testnet E2E | Native simulator unit tests, full lifecycle on devnet, then testnet deployment + E2E. | ✓ |
| Devnet only, deploy to testnet after | Skip native simulator, test on devnet, then testnet. Faster but less isolated. | |
| You decide | Claude picks testing depth. | |

**User's choice:** Devnet lifecycle + testnet E2E (Recommended)

### Non-Creator Test

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, explicit non-creator test | Use second devnet account to finalize. Also test before-deadline rejection. | ✓ |
| You decide | Claude determines test scenarios. | |

**User's choice:** Yes, explicit non-creator test (Recommended)
**Notes:** This is the whole point of the fix — must explicitly verify a non-creator can finalize.

---

## Claude's Discretion

- Internal error code numbering
- Exact since field encoding (absolute block number)
- Helper function organization
- Deployment step ordering
- Whether campaign-lock needs to be a cell_dep in other transactions

## Deferred Ideas

- Early finalization (creator before deadline) — v1.2
- On-chain status enforcement (pledge cells as proof) — future consideration
