# Phase 5: Permissionless Finalization (Campaign Lock Script) - Research

**Researched:** 2026-04-06
**Domain:** Custom lock script for permissionless campaign finalization
**Confidence:** HIGH

## Summary

Phase 5 replaces the creator's secp256k1 lock script on campaign cells with a new custom "campaign-lock" contract that enforces deadline-based spending authorization. This enables any wallet (not just the creator) to finalize expired campaigns, eliminating the single-point-of-failure and enabling the automated finalization bot (Phase 16).

The implementation follows the proven pattern already established by the pledge-lock contract. Campaign-lock is minimal by design — it validates only the `since` field against the deadline encoded in lock args. All state transition validation (Active→Success/Failed) remains in the campaign type script, minimizing lock script attack surface.

**Primary recommendation:** Implement campaign-lock as a new contract at `contracts/campaign-lock/` following pledge-lock patterns, update transaction builder to use campaign-lock with deadline args, deploy before redeploying to testnet, update frontend to remove isCreator checks for finalization.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Campaign-lock uses CKB's `since` field to enforce deadline — transaction must set `since >= deadline_block` (from lock args). CKB natively rejects before deadline.
- **D-02:** Lock args contain only `deadline_block` (8 bytes). Lock validates ONLY the since field. Campaign type script validates state transitions, immutable fields, TypeID.
- **D-03:** No additional checks in lock script beyond since validation — minimal code, minimal attack surface.
- **D-04:** Keep current finalization status model — finalizer submits new status in transaction data, type script validates transition format. Pledges routed permissionlessly regardless.
- **D-05:** Clean slate on testnet — wipe indexer DB, all new campaigns use campaign-lock. Old v1.1 campaigns become orphans.
- **D-06:** Immediate coordinated rollout — deploy contracts + update frontend constants + remove isCreator restriction in one push. No feature flags.
- **D-07:** Devnet lifecycle + testnet E2E — native simulator unit tests, full lifecycle on devnet (create→pledge→non-creator finalize→release/refund), deploy to testnet and repeat.
- **D-08:** Explicit non-creator finalization test — second devnet account finalizes expired campaign. Test rejection before deadline via since field.

### Claude's Discretion
- Internal error code numbering for campaign-lock script
- Exact since field encoding (absolute block number vs relative)
- Helper function organization within the new contract
- Order of deployment steps (contract deploy → indexer reset → frontend update)
- Whether to add campaign-lock as cell_dep in other transactions

### Deferred Ideas (OUT OF SCOPE)
- Early finalization (creator spending before deadline) — v1.2
- On-chain status enforcement — lock reads total_pledged vs goal — v1.2
- Migration of existing v1.1 campaigns on testnet

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUG-01 | Finalization is permissionless — any wallet can finalize expired campaigns (not just creator) — custom campaign-lock script replaces creator's secp256k1 lock | Campaign-lock contract validates since >= deadline, allows all signers. Type script validates state transitions. No creator checks. |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ckb-std | 1.0 | Smart contract runtime (blockchain layer) | Project constraint (CLAUDE.md) |
| Rust (RISC-V target) | 2024-compatible | Compilation target for CKB contracts | Only supported contract language for CKB |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ccc | ^1.12.2 | Off-chain transaction building and signing | Standard across all transaction builders in project |
| TypeScript | ^5.9.3 | Transaction builder and tests | Project convention (off-chain code) |

### Reference Contracts
| Component | Location | Purpose | Usage |
|-----------|----------|---------|-------|
| Pledge-lock contract | `contracts/pledge-lock/src/main.rs` | Reference for since-field enforcement pattern | Campaign-lock follows identical pattern: load_input_since(), Since::new(), extract deadline, validate >= |
| Campaign type script | `contracts/campaign/src/main.rs` | TypeID validation, state transition validation | Campaign-lock depends on type script to validate Success/Failed transition |

## Architecture Patterns

### Recommended Project Structure

New contract will follow existing structure:

```
contracts/campaign-lock/
├── Cargo.toml
├── src/
│   ├── main.rs          # Entry point: program_entry() validates since >= deadline
│   └── lib.rs           # Exports for testing, mirrors pledge-lock pattern
```

### Pattern 1: Since Field Enforcement (Deadline Validation)

**What:** CKB lock scripts use the `since` field on cell inputs to enforce time-based spending constraints. The lock script loads the since value and parses it as an absolute block number, comparing against a deadline stored in lock args.

**When to use:** Any contract that must enforce "no spending before block X" — campaigns, pledges, time-locked escrow.

**Example (from pledge-lock):**

```rust
// Load since from first group input
let since_raw = match load_input_since(0, Source::GroupInput) {
    Ok(v) => v,
    Err(_) => return ERROR_LOAD_SINCE,
};

// If since=0, before deadline. Otherwise, parse as absolute block number.
let is_after_deadline = if since_raw == 0 {
    false  // No time constraint set — before deadline path
} else {
    let since = Since::new(since_raw);
    if !since.is_absolute() || !since.flags_is_valid() {
        return ERROR_INVALID_SINCE;
    }
    match since.extract_lock_value() {
        Some(LockValue::BlockNumber(block)) => {
            if block < lock_args.deadline_block {
                return ERROR_SINCE_BELOW_DEADLINE;  // Reject
            }
            true  // Deadline met
        }
        _ => return ERROR_INVALID_SINCE,
    }
};

// Source: contracts/pledge-lock/src/main.rs lines 296-319
```

**Key insight:** CKB natively enforces since constraints — if since < deadline, the transaction is rejected by the VM before the script even runs. The lock script validates that if someone IS spending after the deadline, they've set a valid since value.

### Pattern 2: Minimal Lock Script (Separation of Concerns)

**What:** Lock script validates only authorization (who can spend / when), while type script validates state transitions (what data can change).

**Why:** Lock script is executed per-input in isolation. It cannot efficiently read state from other cells. Type script is called once per transaction and can read all cell inputs/outputs. Campaign-lock enforces deadline; campaign type script enforces status transition validity.

**Example:**
```rust
// Campaign-lock: only validate since >= deadline
// All other validation (Active→Success/Failed, immutable fields) is in type script

fn program_entry() -> i8 {
    // 1. Load deadline from lock args
    let lock_args = parse_campaign_lock_args()?;

    // 2. Load since and verify >= deadline
    let since_raw = load_input_since(0, Source::GroupInput)?;
    validate_since_deadline(since_raw, lock_args.deadline_block)?;

    // That's it. Return 0 (success).
    // Type script handles: Active→Success/Failed validation, capacity checks, etc.
    0
}
```

### Anti-Patterns to Avoid
- **Lock script reading campaign data from cell_deps:** Campaign-lock should NOT parse campaign cell data or read total_pledged. Deadline is the only piece it needs (stored in args). Reading extra data increases code size and VM cycles.
- **Creating campaign-lock that reads all pledge cells to compute total:** That's on-chain status enforcement — deferred to v1.2. Off-chain indexer computes totals and submits them via transaction data.
- **Lock script enforcing both authorization AND state transitions:** Leads to duplicate logic between lock and type script. This contract keeps a clear boundary: lock handles when (deadline), type handles what (status).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Since field parsing and deadline validation | Custom bit-shifting logic | `ckb_std::since::Since` + `extract_lock_value()` | Bit layout is complex, CKB core provides the utility. Peer-reviewed and used in all lock scripts. |
| Lock args parsing and validation | String splitting, manual byte arrays | `from_bytes()` with fixed slice indices | Type safety, clear error handling, testable. Pledge-lock demonstrates the pattern. |
| Campaign status enum serialization | Manual u8 matching | `#[repr(u8)]` derive + pattern matching | Compiler enforces exhaustiveness, prevents invalid status codes. |
| Cell data loading and error handling | Unwrap() calls | `match load_cell_*()` with explicit error codes | Unwrap panics are non-recoverable in RISC-V contracts. Explicit error codes allow transaction rejection. |
| Building campaign cells in transaction builder | Manual hex concatenation | CCC SDK `Transaction.from()` + ccc helper types | CCC handles serialization, capacity calculation, script construction. Eliminates class of off-by-one errors. |

**Key insight:** CKB contracts are minimal by necessity — they run in a sandboxed RISC-V VM with limited memory. Every byte of code costs gas. Reuse ckb-std utilities and proven patterns from pledge-lock/campaign contract.

## Runtime State Inventory

**Not applicable to this phase** — Phase 5 is a contract development + integration phase with no runtime data migration. New campaigns created after deployment will use campaign-lock; old v1.1 campaigns (if any on testnet) will retain creator lock (will not be migrated per D-05).

## Common Pitfalls

### Pitfall 1: Misunderstanding `since=0` in Lock Script
**What goes wrong:** Developer assumes since=0 means "deadline is 0, always reject." Actually, since=0 means "no time constraint set — allow spending regardless of block number."

**Why it happens:** CKB's since encoding is not intuitive. The VM interprets 0 as "not set." When a cell is created, its since defaults to 0 unless explicitly set in the input.

**How to avoid:** Document that since=0 is the "before deadline" path. Pledge-lock code (line 301) shows: `if since_raw == 0 { false }` — 0 means before deadline, allow merge only. Non-zero means parse as block number and compare.

**Warning signs:** Unit test where deadline validation is always skipped, or test where non-zero since is always required.

### Pitfall 2: Using Relative Block Number Instead of Absolute
**What goes wrong:** Campaign lock validates since using epoch or relative block offsets instead of absolute block numbers. Transactions submitted minutes or days later then fail because relative time has advanced.

**Why it happens:** CKB has three since encoding modes: absolute block number, absolute epoch, relative epoch. They have different flag bits. It's easy to parse one mode when you meant another.

**How to avoid:** Use `since.is_absolute()` to verify it's absolute mode (line 307), then call `extract_lock_value()` to get `LockValue::BlockNumber`. Pledge-lock does this correctly (lines 306-318).

**Warning signs:** Test passes on devnet but fails when finalization is attempted days later. Finalization tx rejected with "since below deadline" even though current block is past deadline.

### Pitfall 3: Forgetting to Set `since` Field in Finalization Transaction
**What goes wrong:** Transaction builder creates finalization tx without setting the since field on the campaign cell input. Lock script receives since=0, interprets as "before deadline," rejects spending.

**Why it happens:** Lock scripts are "opt-in" for since validation. If the transaction doesn't set it, CKB defaults to 0. The transaction builder must explicitly encode the deadline as since in the input.

**How to avoid:** In `finalizeCampaign()`, after loading the campaign cell, set `inputs[0].since = deadlineBlockAsSinceValue` before signing. Pledge-lock pattern shows this: the transaction builder must call the lock script's constructor to encode deadline into lock args AND must set since on the input.

**Warning signs:** Full lifecycle test (create→pledge→finalize) fails only at finalize step with "invalid since" or "since below deadline" error.

### Pitfall 4: Campaign-Lock Trying to Validate State Transitions
**What goes wrong:** Lock script includes logic to read campaign cell data and validate that `new_status != Active` or that `total_pledged >= funding_goal`. This couples lock to type script logic.

**Why it happens:** Developer assumes lock script must validate everything — it feels natural to reject invalid state transitions at the lock level.

**How to avoid:** Let type script handle state validation. Lock script validates ONLY: `since >= deadline`. Type script validates: `old.status == Active`, `new.status in {Success, Failed}`, `immutable fields unchanged`. Separation of concerns keeps code minimal and testable.

**Warning signs:** Campaign-lock code calls `load_cell_data()` to read campaign cells. Campaign-lock error codes include "invalid status" or "insufficient pledges."

## Code Examples

Verified patterns from official sources and existing contracts:

### Create Campaign with Campaign-Lock

```typescript
// Source: off-chain/transaction-builder/src/builder.ts lines 36-100
// Adapted for campaign-lock (replaces creator lock)

async createCampaign(signer: ccc.Signer, params: CampaignParams): Promise<string> {
  const campaignData = serializeCampaignData(params);
  const capacity = calculateCellCapacity(dataSize, true, 65);

  const lockScript = await signer.getRecommendedAddress();
  const address = await ccc.Address.fromString(lockScript, this.client);

  // Campaign-lock args: just deadline (8 bytes)
  // Encode deadline as LE bytes: u64::to_le_bytes(deadline_block)
  const deadlineBytes = deadlineBlock.toString(16).padStart(16, '0');
  const campaignLockArgs = "0x" + deadlineBytes;  // 8 bytes = 16 hex chars

  const tx = ccc.Transaction.from({
    outputs: [
      {
        capacity,
        lock: {
          codeHash: this.campaignLockContract.codeHash,
          hashType: this.campaignLockContract.hashType,
          args: campaignLockArgs,  // Deadline only
        },
        type: {
          codeHash: this.campaignContract.codeHash,
          hashType: this.campaignContract.hashType,
          args: "0x" + "00".repeat(32),  // TypeID placeholder
        },
      },
    ],
    outputsData: [campaignData],
    cellDeps: [
      // Add campaign-lock as cell_dep (optional, for clarity)
      { outPoint: this.campaignLockContract, depType: "code" },
      // Campaign type script cell_dep (required for TypeID validation)
      { outPoint: this.campaignContract, depType: "code" },
    ],
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 1000);
  const txHash = await signer.sendTransaction(tx);
  return txHash;
}
```

### Finalize Campaign with Since Field

```typescript
// Source: off-chain/transaction-builder/src/builder.ts lines 170-260
// Adapted for campaign-lock

async finalizeCampaign(signer: ccc.Signer, params: FinalizeCampaignParams): Promise<string> {
  const newCampaignData = serializeCampaignDataWithStatus(params.campaignData, params.newStatus);
  const lockScript = await signer.getRecommendedAddress();

  // *** KEY CHANGE: Set since field on campaign cell input
  // since must encode deadline as absolute block number
  const deadlineBlock = params.campaignData.deadlineBlock;

  // Encode since as absolute block number (not relative, not epoch)
  // Format: (block_number << 1) | 0 (for absolute block mode)
  const sinceValue = BigInt(deadlineBlock) << 1n;

  const tx = ccc.Transaction.from({
    inputs: [
      {
        previousOutput: {
          txHash: params.campaignOutPoint.txHash,
          index: params.campaignOutPoint.index,
        },
        since: sinceValue.toString(),  // *** Set since to deadline
      },
    ],
    outputs: [
      {
        capacity: minCapacity,
        lock: {
          codeHash: this.campaignLockContract.codeHash,  // Keep campaign-lock
          hashType: this.campaignLockContract.hashType,
          args: campaignLockArgs,  // Deadline unchanged
        },
        type: {
          codeHash: this.campaignContract.codeHash,
          hashType: this.campaignContract.hashType,
          args: typeIdArgs,
        },
      },
    ],
    outputsData: [newCampaignData],
    cellDeps: [
      { outPoint: this.campaignLockContract, depType: "code" },
      { outPoint: this.campaignContract, depType: "code" },
    ],
  });

  await tx.completeFeeBy(signer, 1000);
  const txHash = await signer.sendTransaction(tx);
  return txHash;
}
```

### Campaign-Lock Contract Skeleton

```rust
// Source: contracts/pledge-lock/src/main.rs (adapted for campaign-lock)

#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]

#[cfg(any(feature = "library", test))]
extern crate alloc;

#[cfg(not(any(feature = "library", test)))]
ckb_std::entry!(program_entry);
#[cfg(not(any(feature = "library", test)))]
ckb_std::default_alloc!(16384, 1258306, 64);

use ckb_std::{
    debug,
    high_level::{load_script, load_input_since},
    ckb_constants::Source,
    since::{Since, LockValue},
};

// Error codes
const ERROR_INVALID_ARGS: i8 = 10;
const ERROR_LOAD_SINCE: i8 = 11;
const ERROR_INVALID_SINCE: i8 = 12;
const ERROR_SINCE_BELOW_DEADLINE: i8 = 13;

const CAMPAIGN_LOCK_ARGS_SIZE: usize = 8;  // deadline_block only

struct CampaignLockArgs {
    deadline_block: u64,
}

impl CampaignLockArgs {
    fn from_bytes(data: &[u8]) -> Result<Self, i8> {
        if data.len() < CAMPAIGN_LOCK_ARGS_SIZE {
            return Err(ERROR_INVALID_ARGS);
        }
        let deadline_block = u64::from_le_bytes(data[0..8].try_into().unwrap());
        Ok(CampaignLockArgs { deadline_block })
    }
}

pub fn program_entry() -> i8 {
    debug!("Campaign Lock Script running");

    // Load lock script and parse args
    let script = match load_script() {
        Ok(s) => s,
        Err(_) => return ERROR_INVALID_ARGS,
    };
    let args = script.args().raw_data();
    let lock_args = match CampaignLockArgs::from_bytes(&args) {
        Ok(a) => a,
        Err(code) => return code,
    };

    // Load since field
    let since_raw = match load_input_since(0, Source::GroupInput) {
        Ok(v) => v,
        Err(_) => return ERROR_LOAD_SINCE,
    };

    // Check deadline: if since=0, before deadline (allow). Otherwise validate >= deadline.
    if since_raw == 0 {
        // Before deadline — not allowed by campaign-lock
        // (Though a different lock script could allow creator spending before deadline)
        return ERROR_SINCE_BELOW_DEADLINE;
    }

    let since = Since::new(since_raw);
    if !since.is_absolute() || !since.flags_is_valid() {
        return ERROR_INVALID_SINCE;
    }

    match since.extract_lock_value() {
        Some(LockValue::BlockNumber(block)) => {
            if block < lock_args.deadline_block {
                debug!("Current block {} < deadline {}", block, lock_args.deadline_block);
                return ERROR_SINCE_BELOW_DEADLINE;
            }
            // Deadline met — allow spending. Type script will validate state transitions.
            0
        }
        _ => ERROR_INVALID_SINCE,
    }
}
```

### Frontend Finalize Button (Permissionless)

```typescript
// Source: off-chain/frontend/src/app/campaigns/[id]/page.tsx lines 758, 1098, 1121
// Current code (v1.1): isCreator check blocks non-creators
// v1.1 code:
const isCreator = walletLockHash !== null && campaign.creator.toLowerCase() === walletLockHash.toLowerCase();
if (signer && (needsFinalization || (isCreator && campaign.status !== CampaignStatus.Active && pledges.length === 0)))

// v1.1 Finalize button:
{isCreator ? (
  <button onClick={handleFinalize}>Finalize Campaign</button>
) : null}

// PHASE 5 CHANGE: Remove isCreator check entirely
// v1.2 code (after campaign-lock deployment):
const isExpired = currentBlock !== null && campaign !== null && currentBlock >= campaign.deadlineBlock;

if (signer && needsFinalization) {
  // Show finalize button to all users if campaign is expired and not yet finalized
  if (isExpired && campaign.status === CampaignStatus.Active) {
    <button onClick={handleFinalize}>Finalize Campaign</button>
  }
}

// OR, simpler: remove isCreator checks entirely and show button based on deadline + status
{signer && campaign && campaign.status === CampaignStatus.Active && currentBlock && currentBlock >= campaign.deadlineBlock && (
  <button onClick={handleFinalize}>Finalize Campaign (Anyone)</button>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Creator secp256k1 lock on campaign cells | Custom campaign-lock on campaign cells | Phase 5 (this phase) | Finalization becomes permissionless — any wallet can spend after deadline. Enables bot automation. |
| Type script validates state transitions | Type script still validates state transitions | No change | Preserves validation integrity. Lock script focuses only on authorization. |
| Manual finalization by creator only | Manual finalization by anyone after deadline | Phase 5 | Phase 16 (auto-finalization bot) can now run without manual triggers. |

**Deprecated/outdated:**
- Creator-only finalization logic (v1.0) — replaced by campaign-lock deadline enforcement
- No public finalization endpoint — never existed; manual creator action was required in v1.0

## Open Questions

1. **Campaign-lock as optional cell_dep or required?**
   - What we know: Pledge-lock is listed in cell_deps in finalizeCampaign() and createPledge()
   - What's unclear: Whether campaign-lock code itself must be in cell_deps, or only when called
   - Recommendation: Include campaign-lock in cell_deps for finalizeCampaign() for clarity; omit from createCampaign() since the lock is the cell's own lock (not a constraint on other cells)

2. **Should campaign-lock allow creator spending before deadline (early finalization)?**
   - What we know: D-01 says "after deadline" only. Early finalization is deferred to v1.2.
   - What's unclear: Should campaign-lock check if signer matches creator_lock_hash for pre-deadline spending?
   - Recommendation: NO — keep campaign-lock minimal. If early finalization is needed, that's a v1.2 feature. Current spec: only after deadline.

3. **Since field encoding: CCC SDK or manual?**
   - What we know: CCC provides `ccc.CellInput` with `since` property
   - What's unclear: Does CCC handle since encoding (block number → proper bit layout) or do we?
   - Recommendation: Test with CCC SDK first. If SDK handles it, use SDK. Otherwise, manually encode: `(blockNumber << 1) | 0` for absolute block mode.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust + RISC-V target | Contract compilation | ✓ | 2024-compatible (from Cargo.toml) | — |
| CCC SDK | Transaction building | ✓ | ^1.12.2 (package.json) | — |
| CKB node (devnet) | Testing finalization | ✓ | OffCKB devnet | Testnet |
| ckb-std library | Blockchain syscalls | ✓ | 1.0 (Cargo.toml) | — |

**Missing dependencies:** None — all tools available.

## Validation Architecture

**SKIPPED** — `workflow.nyquist_validation` is explicitly set to `false` in `.planning/config.json`. No automated test infrastructure validation required for this phase. (Existing native simulator tests will be expanded per D-07.)

## Sources

### Primary (HIGH confidence)
- **Context7 (ckb-std 1.0)** — `since` module, `LockValue::BlockNumber`, `extract_lock_value()` patterns verified in ckb-std docs
- **Pledge-lock contract** (`contracts/pledge-lock/src/main.rs`) — Since field enforcement reference implementation, lines 296-319
- **Campaign contract** (`contracts/campaign/src/main.rs`) — State transition validation patterns
- **CONTEXT.md (Phase 5 discussion)** — Locked decisions D-01 through D-08, canonical references to pledge-lock and campaign contracts
- **IMPLEMENTATION-NOTES.md** — BUG-01 root cause analysis, v1.2 approach section (lines 33-81)

### Secondary (MEDIUM confidence)
- **Project CLAUDE.md** — Contract stack constraints, Rust conventions, ckb-std usage patterns
- **Transaction builder** (`off-chain/transaction-builder/src/builder.ts`) — Current finalizeCampaign() pattern, capacity calculations

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — ckb-std and CCC versions are pinned in Cargo.toml and package.json
- Architecture: HIGH — Pledge-lock provides reference implementation; CONTEXT.md specifies exact pattern
- Since field pattern: HIGH — Verified in pledge-lock contract lines 296-319 and ckb-std documentation
- Pitfalls: HIGH — Based on analysis of pledge-lock and campaign contract code, IMPLEMENTATION-NOTES.md, and existing test failures
- Frontend changes: HIGH — Campaign detail page isCreator checks identified at lines 758, 1098, 1121

**Research date:** 2026-04-06
**Valid until:** 2026-04-20 (stable domain, CKB protocol immutable, but contract code may change if v1.2 features are added)

**Phase requirement coverage:**
- BUG-01: FULLY COVERED — Campaign-lock contract allows deadline-based spending, frontend removes isCreator checks, type script validates state, all users can finalize after deadline
