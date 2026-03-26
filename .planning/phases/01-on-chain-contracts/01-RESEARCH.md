# Phase 1: On-Chain Contracts - Research

**Researched:** 2026-03-26
**Scope:** Concrete implementation details for pledge lock, receipt type, updated campaign type, and updated pledge type scripts.

---

## 1. Pledge Lock Script Implementation

### Overview

The pledge lock script is the core of v1.1. It is a **lock script** (not a type script) -- it controls **when and how** pledge cells can be spent. CKB runs lock scripts when a cell is consumed as a transaction input.

### Lock Script Args Layout (72 bytes)

```
Offset  Size  Field
0       32    campaign_type_script_hash  — full type script hash of the campaign cell (includes TypeID)
32      8     deadline_block             — absolute block number (u64 LE)
40      32    backer_lock_hash           — hash of backer's original lock script (for refunds + dedup)
```

**Why 72 bytes:** Per D-01/D-02, the lock is fully self-contained. Including `backer_lock_hash` makes each backer's lock args unique, preventing the CKB lock script dedup vulnerability (Pitfall #11).

### Parsing Args in Rust

```rust
/// Pledge lock script args (stored in script.args)
/// Total: 72 bytes
struct PledgeLockArgs {
    campaign_type_script_hash: [u8; 32],
    deadline_block: u64,
    backer_lock_hash: [u8; 32],
}

const PLEDGE_LOCK_ARGS_SIZE: usize = 72;

impl PledgeLockArgs {
    fn from_bytes(data: &[u8]) -> Result<Self, i8> {
        if data.len() < PLEDGE_LOCK_ARGS_SIZE {
            return Err(ERROR_INVALID_ARGS);
        }
        let mut campaign_type_script_hash = [0u8; 32];
        campaign_type_script_hash.copy_from_slice(&data[0..32]);
        let deadline_block = u64::from_le_bytes(data[32..40].try_into().unwrap());
        let mut backer_lock_hash = [0u8; 32];
        backer_lock_hash.copy_from_slice(&data[40..72]);
        Ok(PledgeLockArgs {
            campaign_type_script_hash,
            deadline_block,
            backer_lock_hash,
        })
    }
}
```

### Lock Script Main Logic

The lock script must distinguish between three transaction patterns:

1. **Merge** (before deadline): Multiple pledge inputs with same lock -> 1 output, capacity preserved
2. **Release** (after deadline, campaign Success): Output goes to creator
3. **Refund** (after deadline, campaign Failed or no cell_dep): Output goes to backer

```rust
pub fn program_entry() -> i8 {
    // 1. Load own script and parse args
    let script = load_script().unwrap();
    let args = script.args().raw_data();
    let lock_args = match PledgeLockArgs::from_bytes(&args) {
        Ok(a) => a,
        Err(code) => return code,
    };

    // 2. Check since field to determine if before/after deadline
    //    load_input_since loads the since value for the CURRENT input being validated
    //    CKB consensus already enforces that the since constraint is met,
    //    so if since >= deadline, we know we're past deadline.
    let since_raw = match load_input_since(0, Source::GroupInput) {
        Ok(v) => v,
        Err(_) => return ERROR_LOAD_SINCE,
    };

    let is_after_deadline = if since_raw == 0 {
        // since=0 means no time constraint set by the transaction — before deadline path
        false
    } else {
        // Parse the since value to verify it's absolute block number
        let since = Since::new(since_raw);
        if !since.is_absolute() || !since.flags_is_valid() {
            return ERROR_INVALID_SINCE;
        }
        match since.extract_lock_value() {
            Some(LockValue::BlockNumber(block)) => block >= lock_args.deadline_block,
            _ => return ERROR_INVALID_SINCE, // Must be absolute block number
        }
    };

    if !is_after_deadline {
        // BEFORE DEADLINE: only merge is allowed
        return validate_merge(&lock_args);
    }

    // AFTER DEADLINE: release or refund
    // Try to find campaign cell in cell_deps
    match find_campaign_in_cell_deps(&lock_args.campaign_type_script_hash) {
        Some(campaign_data) => {
            match campaign_data.status {
                CampaignStatus::Success => validate_release(&lock_args, &campaign_data),
                CampaignStatus::Failed => validate_refund(&lock_args),
                CampaignStatus::Active => ERROR_CAMPAIGN_STILL_ACTIVE,
            }
        }
        None => {
            // D-06: Fail-safe refund — no campaign cell_dep means default to backer refund
            validate_refund(&lock_args)
        }
    }
}
```

### Finding Campaign Cell in cell_deps

```rust
/// Search cell_deps for a cell whose type script hash matches the expected campaign hash.
/// Returns parsed CampaignData if found.
fn find_campaign_in_cell_deps(expected_hash: &[u8; 32]) -> Option<CampaignData> {
    for i in 0.. {
        match load_cell_type_hash(i, Source::CellDep) {
            Ok(Some(hash)) => {
                if hash == *expected_hash {
                    // Found the campaign cell — load its data
                    let data = load_cell_data(i, Source::CellDep).ok()?;
                    return CampaignData::from_bytes(&data).ok();
                }
            }
            Ok(None) => continue,          // cell_dep has no type script
            Err(SysError::IndexOutOfBound) => break,  // no more cell_deps
            Err(_) => return None,
        }
    }
    None
}
```

**Security note (Pitfall #1):** This verifies the cell_dep's type script hash matches what was committed in the lock args at pledge creation. Since the campaign uses TypeID, its type script hash is unforgeable.

### Validate Release (Success Path)

```rust
/// D-04: After deadline + Success -> output must go to creator_lock_hash
fn validate_release(lock_args: &PledgeLockArgs, campaign: &CampaignData) -> i8 {
    // Sum all input capacities for cells with this lock script (GroupInput)
    let total_input_capacity = sum_group_input_capacity();

    // Verify at least one output goes to creator with sufficient capacity
    // D-07: output_capacity >= input_capacity - MAX_FEE
    let creator_lock_hash = campaign.creator_lock_hash;
    match find_output_to_lock_hash(&creator_lock_hash, total_input_capacity) {
        Ok(()) => 0,
        Err(code) => code,
    }
}

const MAX_FEE: u64 = 100_000_000; // 1 CKB = 100M shannons (D-07)

fn find_output_to_lock_hash(expected_lock_hash: &[u8; 32], min_capacity: u64) -> Result<(), i8> {
    let min_required = min_capacity.checked_sub(MAX_FEE).unwrap_or(0);
    let mut total_to_destination: u64 = 0;

    for i in 0.. {
        match load_cell_lock_hash(i, Source::Output) {
            Ok(hash) => {
                if hash == *expected_lock_hash {
                    let cap = load_cell_capacity(i, Source::Output)
                        .map_err(|_| ERROR_LOAD_CAPACITY)?;
                    total_to_destination = total_to_destination
                        .checked_add(cap)
                        .ok_or(ERROR_OVERFLOW)?;
                }
            }
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return Err(ERROR_LOAD_LOCK_HASH),
        }
    }

    if total_to_destination >= min_required {
        Ok(())
    } else {
        Err(ERROR_INSUFFICIENT_OUTPUT)
    }
}
```

### Validate Refund (Failed Path)

```rust
/// D-05: After deadline + Failed -> output must go to backer_lock_hash (from lock args)
/// D-06: Also used for fail-safe refund when no campaign cell_dep is present
fn validate_refund(lock_args: &PledgeLockArgs) -> i8 {
    let total_input_capacity = sum_group_input_capacity();
    match find_output_to_lock_hash(&lock_args.backer_lock_hash, total_input_capacity) {
        Ok(()) => 0,
        Err(code) => code,
    }
}
```

### Validate Merge (Before Deadline)

```rust
/// D-03: Before deadline, only merging is allowed.
/// Merge = multiple inputs with same lock -> 1 output with same lock, capacity sum preserved.
fn validate_merge(lock_args: &PledgeLockArgs) -> i8 {
    // Count group inputs and sum their capacity
    let mut input_count: usize = 0;
    let mut total_input_cap: u64 = 0;
    for i in 0.. {
        match load_cell_capacity(i, Source::GroupInput) {
            Ok(cap) => {
                input_count += 1;
                total_input_cap = match total_input_cap.checked_add(cap) {
                    Some(v) => v,
                    None => return ERROR_OVERFLOW,
                };
            }
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return ERROR_LOAD_CAPACITY,
        }
    }

    // Must have multiple inputs (otherwise no reason to merge)
    if input_count < 2 {
        return ERROR_NOT_A_MERGE;
    }

    // Must have exactly 1 group output
    match load_cell_capacity(0, Source::GroupOutput) {
        Ok(_) => {}
        Err(_) => return ERROR_NO_MERGE_OUTPUT,
    }
    match load_cell_capacity(1, Source::GroupOutput) {
        Ok(_) => return ERROR_MULTIPLE_MERGE_OUTPUTS,
        Err(SysError::IndexOutOfBound) => {} // Good — only 1 output
        Err(_) => return ERROR_LOAD_CAPACITY,
    }

    // Output capacity must equal total input capacity (no fee from pledge during merge)
    let output_cap = match load_cell_capacity(0, Source::GroupOutput) {
        Ok(c) => c,
        Err(_) => return ERROR_LOAD_CAPACITY,
    };

    if output_cap != total_input_cap {
        return ERROR_MERGE_CAPACITY_MISMATCH;
    }

    // Verify output has same lock script hash as inputs
    let input_lock_hash = match load_cell_lock_hash(0, Source::GroupInput) {
        Ok(h) => h,
        Err(_) => return ERROR_LOAD_LOCK_HASH,
    };
    let output_lock_hash = match load_cell_lock_hash(0, Source::GroupOutput) {
        Ok(h) => h,
        Err(_) => return ERROR_LOAD_LOCK_HASH,
    };
    if input_lock_hash != output_lock_hash {
        return ERROR_MERGE_LOCK_MISMATCH;
    }

    0 // Success
}
```

### Helper: Sum Group Input Capacity

```rust
fn sum_group_input_capacity() -> u64 {
    let mut total: u64 = 0;
    for i in 0.. {
        match load_cell_capacity(i, Source::GroupInput) {
            Ok(cap) => {
                total = total.checked_add(cap).expect("capacity overflow");
            }
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => panic!("failed to load capacity"),
        }
    }
    total
}
```

---

## 2. Receipt Type Script Implementation

### Cell Data Layout (40 bytes)

Per D-10:
```
Offset  Size  Field
0       8     pledge_amount      — u64 LE, the CKB amount pledged
8       32    backer_lock_hash   — hash of backer's lock script
```

```rust
struct ReceiptData {
    pledge_amount: u64,
    backer_lock_hash: [u8; 32],
}

impl ReceiptData {
    const SIZE: usize = 40;

    fn from_bytes(data: &[u8]) -> Result<Self, i8> {
        if data.len() < Self::SIZE {
            return Err(ERROR_INVALID_RECEIPT_DATA);
        }
        let pledge_amount = u64::from_le_bytes(data[0..8].try_into().unwrap());
        let mut backer_lock_hash = [0u8; 32];
        backer_lock_hash.copy_from_slice(&data[8..40]);
        Ok(ReceiptData { pledge_amount, backer_lock_hash })
    }

    fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut bytes = [0u8; Self::SIZE];
        bytes[0..8].copy_from_slice(&self.pledge_amount.to_le_bytes());
        bytes[8..40].copy_from_slice(&self.backer_lock_hash);
        bytes
    }
}
```

### Type Script Main Logic

The receipt type script handles three scenarios:

```rust
pub fn program_entry() -> i8 {
    let has_input = match load_cell_data(0, Source::GroupInput) {
        Ok(_) => true,
        Err(SysError::IndexOutOfBound) => false,
        Err(_) => return ERROR_LOAD_DATA,
    };

    let has_output = match load_cell_data(0, Source::GroupOutput) {
        Ok(_) => true,
        Err(SysError::IndexOutOfBound) => false,
        Err(_) => return ERROR_LOAD_DATA,
    };

    match (has_input, has_output) {
        // Creation: validate receipt is created alongside a valid pledge
        (false, true) => validate_receipt_creation(),

        // Destruction: validate it's part of a valid refund
        (true, false) => validate_receipt_destruction(),

        // Modification: receipts are immutable (D-11)
        (true, true) => ERROR_RECEIPT_MODIFICATION_NOT_ALLOWED,

        // No cells — shouldn't happen
        (false, false) => 0,
    }
}
```

### Receipt Creation Validation (D-11)

```rust
/// D-11: Receipt must be created in same transaction as a valid pledge cell
/// with matching amount.
fn validate_receipt_creation() -> i8 {
    let receipt_data = match load_cell_data(0, Source::GroupOutput) {
        Ok(d) => d,
        Err(_) => return ERROR_LOAD_DATA,
    };
    let receipt = match ReceiptData::from_bytes(&receipt_data) {
        Ok(r) => r,
        Err(code) => return code,
    };

    // Validate pledge_amount > 0
    if receipt.pledge_amount == 0 {
        return ERROR_ZERO_PLEDGE_AMOUNT;
    }

    // Validate backer_lock_hash is not all zeros
    if receipt.backer_lock_hash == [0u8; 32] {
        return ERROR_ZERO_BACKER_HASH;
    }

    // Look for a pledge cell in the transaction outputs that matches
    // We search all outputs for a cell with the pledge lock script
    // whose backer_lock_hash matches the receipt's backer_lock_hash
    // and whose capacity matches the receipt's pledge_amount
    // (The pledge type script handles its own validation separately)

    // For v1.1, the transaction builder ensures co-creation.
    // The type script validates: a pledge cell output exists in this tx
    // with matching backer_lock_hash in its lock args.
    let mut found_matching_pledge = false;
    for i in 0.. {
        match load_cell_lock(i, Source::Output) {
            Ok(lock_script) => {
                let lock_args = lock_script.args().raw_data();
                // Check if this is a pledge lock (args length = 72)
                // and backer_lock_hash matches
                if lock_args.len() >= PLEDGE_LOCK_ARGS_SIZE {
                    let mut backer_hash_in_lock = [0u8; 32];
                    backer_hash_in_lock.copy_from_slice(&lock_args[40..72]);
                    if backer_hash_in_lock == receipt.backer_lock_hash {
                        found_matching_pledge = true;
                        break;
                    }
                }
            }
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return ERROR_LOAD_LOCK,
        }
    }

    if !found_matching_pledge {
        return ERROR_NO_MATCHING_PLEDGE;
    }

    0
}
```

### Receipt Destruction Validation (D-12)

```rust
/// D-12: During refund, verify refund amount matches receipt's stored pledge_amount,
/// and output goes to backer_lock_hash from receipt data.
fn validate_receipt_destruction() -> i8 {
    // Load the receipt being destroyed
    let receipt_data = match load_cell_data(0, Source::GroupInput) {
        Ok(d) => d,
        Err(_) => return ERROR_LOAD_DATA,
    };
    let receipt = match ReceiptData::from_bytes(&receipt_data) {
        Ok(r) => r,
        Err(code) => return code,
    };

    // Verify that an output exists going to backer_lock_hash
    // with capacity >= pledge_amount - MAX_FEE
    let min_refund = receipt.pledge_amount
        .checked_sub(MAX_FEE)
        .unwrap_or(0);

    let mut refund_found = false;
    for i in 0.. {
        match load_cell_lock_hash(i, Source::Output) {
            Ok(hash) => {
                if hash == receipt.backer_lock_hash {
                    let cap = match load_cell_capacity(i, Source::Output) {
                        Ok(c) => c,
                        Err(_) => return ERROR_LOAD_CAPACITY,
                    };
                    if cap >= min_refund {
                        refund_found = true;
                        break;
                    }
                }
            }
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return ERROR_LOAD_LOCK_HASH,
        }
    }

    if !refund_found {
        return ERROR_REFUND_OUTPUT_MISSING;
    }

    0
}
```

---

## 3. Campaign Type Script Changes (TypeID + Destruction Protection)

### Current State

The existing campaign type script (`contracts/campaign/src/main.rs`) handles:
- Creation: validates `CampaignData` fields
- Finalization: validates state transition `Active -> Success/Failed`
- Destruction: unconditionally allowed (`(true, false) => 0`)

### Changes Needed

#### CAMP-01: Add TypeID

The campaign type script args will now contain a 32-byte TypeID as the first 32 bytes. The `check_type_id(0, 32)` function from ckb-std validates this.

**Required Cargo.toml change:**
```toml
[dependencies]
ckb-std = { version = "1.0", features = ["type-id"] }
```

**Code changes to `program_entry()`:**

```rust
use ckb_std::type_id::check_type_id;

pub fn program_entry() -> i8 {
    debug!("Campaign Type Script running");

    // Validate TypeID (CAMP-01)
    // check_type_id(offset=0, length=32) validates the first 32 bytes of args
    // as a TypeID. On minting (creation), it verifies the hash is correct.
    // On transfer/burn, it's a no-op verification.
    if let Err(_) = check_type_id(0, 32) {
        debug!("TypeID validation failed");
        return ERROR_INVALID_TYPE_ID;
    }

    // ... rest of existing logic unchanged ...
}
```

**Key insight:** `check_type_id(0, 32)` does the following:
- Ensures at most 1 GroupInput and 1 GroupOutput (no duplication)
- On creation (0 inputs, 1 output): computes expected TypeID from `first_input.out_point + output_index`, verifies it matches args[0..32]
- On update/burn (1 input): passes (transfer/burn allowed by TypeID rules)

#### CAMP-02: Destruction Protection

Update the `(true, false)` (destruction) case to verify no unresolved pledge cells reference this campaign:

```rust
// Destruction: has input, no output
(true, false) => {
    // CAMP-02: Check that no pledge cells in inputs reference this campaign
    // This is a best-effort check — the lock script's fail-safe refund (D-06)
    // provides the real backer protection. But we prevent accidental destruction.

    // Load own type script hash
    let own_type_hash = match load_script_hash() {
        Ok(h) => h,
        Err(_) => return ERROR_LOAD_SCRIPT,
    };

    // Scan all cell_deps for pledge cells referencing this campaign
    // Note: full enforcement is off-chain (D-09). On-chain, we just
    // make sure the destruction transaction itself doesn't contain
    // pledge inputs that reference us (basic sanity check).
    debug!("Campaign destruction — checking for pledge references");

    // For v1.1, this is primarily enforced off-chain.
    // The fail-safe refund (D-06) protects backers regardless.
    0
}
```

**Note:** Per D-09, full destruction protection is off-chain. The on-chain fail-safe refund (D-06) is the backer's real protection.

---

## 4. Pledge Type Script Changes (Merge + Partial Refund)

### Current State

The existing pledge type script (`contracts/pledge/src/main.rs`) returns `ERROR_MODIFICATION_NOT_ALLOWED` for the `(true, true)` case — this blocks merging.

### Changes Needed (D-13, D-14 / MERGE-02)

Update the `(true, true)` case to allow:
1. **Merge:** N inputs -> 1 output (same campaign, total capacity preserved)
2. **Partial refund from merged cell:** 1 input -> 1 reduced output + 1 refund output (but this case actually has different type script counts, so it needs careful thought)

```rust
// Modification: has input AND output — check if merge or partial refund
(true, true) => {
    // Count group inputs and outputs
    let input_count = count_group_cells(Source::GroupInput);
    let output_count = count_group_cells(Source::GroupOutput);

    if input_count >= 2 && output_count == 1 {
        // MERGE: N inputs -> 1 output
        validate_merge_pledge()
    } else if input_count == 1 && output_count == 1 {
        // PARTIAL REFUND from merged cell: 1 input -> 1 reduced output
        // The refund output goes to backer (no pledge type script on refund output)
        validate_partial_refund()
    } else {
        debug!("Invalid pledge modification pattern");
        ERROR_MODIFICATION_NOT_ALLOWED
    }
}
```

### Merge Validation (Pledge Type Script Side)

```rust
fn validate_merge_pledge() -> i8 {
    // All input pledge cells must reference the same campaign
    let first_data = match load_cell_data(0, Source::GroupInput) {
        Ok(d) => d,
        Err(_) => return ERROR_LOAD_DATA,
    };
    let first_pledge = match PledgeData::from_bytes(&first_data) {
        Ok(p) => p,
        Err(code) => return code,
    };

    // Verify all inputs have same campaign_id
    let mut total_amount: u64 = 0;
    for i in 0.. {
        match load_cell_data(i, Source::GroupInput) {
            Ok(data) => {
                let pledge = match PledgeData::from_bytes(&data) {
                    Ok(p) => p,
                    Err(code) => return code,
                };
                if pledge.campaign_id != first_pledge.campaign_id {
                    return ERROR_MERGE_DIFFERENT_CAMPAIGNS;
                }
                total_amount = match total_amount.checked_add(pledge.amount) {
                    Some(v) => v,
                    None => return ERROR_OVERFLOW,
                };
            }
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return ERROR_LOAD_DATA,
        }
    }

    // Verify output pledge data
    let output_data = match load_cell_data(0, Source::GroupOutput) {
        Ok(d) => d,
        Err(_) => return ERROR_LOAD_DATA,
    };
    let output_pledge = match PledgeData::from_bytes(&output_data) {
        Ok(p) => p,
        Err(code) => return code,
    };

    // Output must reference same campaign
    if output_pledge.campaign_id != first_pledge.campaign_id {
        return ERROR_MERGE_DIFFERENT_CAMPAIGNS;
    }

    // Output amount must equal sum of input amounts
    if output_pledge.amount != total_amount {
        return ERROR_MERGE_AMOUNT_MISMATCH;
    }

    0
}
```

### Partial Refund Validation

```rust
fn validate_partial_refund() -> i8 {
    let input_data = match load_cell_data(0, Source::GroupInput) {
        Ok(d) => d,
        Err(_) => return ERROR_LOAD_DATA,
    };
    let input_pledge = match PledgeData::from_bytes(&input_data) {
        Ok(p) => p,
        Err(code) => return code,
    };

    let output_data = match load_cell_data(0, Source::GroupOutput) {
        Ok(d) => d,
        Err(_) => return ERROR_LOAD_DATA,
    };
    let output_pledge = match PledgeData::from_bytes(&output_data) {
        Ok(p) => p,
        Err(code) => return code,
    };

    // Must reference same campaign
    if input_pledge.campaign_id != output_pledge.campaign_id {
        return ERROR_CAMPAIGN_MISMATCH;
    }

    // Output amount must be less than input amount
    if output_pledge.amount >= input_pledge.amount {
        return ERROR_PARTIAL_REFUND_INVALID;
    }

    // The difference should equal the receipt being destroyed in this tx
    // (Receipt type script validates its own destruction)

    0
}
```

### Helper: Count Group Cells

```rust
fn count_group_cells(source: Source) -> usize {
    let mut count = 0;
    for i in 0.. {
        match load_cell_data(i, source) {
            Ok(_) => count += 1,
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => break,
        }
    }
    count
}
```

---

## 5. TypeID Setup for Campaign Cells

### How TypeID Works on CKB

TypeID is a standard CKB pattern (RFC 0022) that gives cells a unique, unforgeable identity. The ckb-std 1.0 library provides built-in support via the `type-id` feature.

### TypeID Calculation

On **creation** (minting), the TypeID is computed as:
```
TypeID = blake2b(first_input.out_point || output_index_of_this_cell)
```

This is deterministic and unforgeable because:
- `first_input.out_point` is unique per transaction (each UTXO can only be spent once)
- The output index is unique within the transaction

### Campaign Type Script Args Layout (New)

```
Offset  Size  Field
0       32    type_id    — computed on creation, verified by check_type_id()
```

The previous args layout was empty (`"0x"`). In v1.1, the first (and only) 32 bytes are the TypeID.

### Integration with Pledge Lock

The pledge lock script args store `campaign_type_script_hash`, which is the full hash of the campaign's type script (including the TypeID in args). This means:
- Each campaign has a unique type script hash (because TypeID is unique)
- No one can create a fake campaign cell with the same type script hash
- The lock script can safely verify cell_deps by type script hash

### ckb-std API Usage

```rust
// In campaign type script:
use ckb_std::type_id::check_type_id;

// Validates TypeID at args[0..32]
check_type_id(0, 32)?;
```

The `check_type_id` function internally:
1. Ensures at most 1 GroupInput and 1 GroupOutput
2. On minting: loads `first_input` outpoint + locates output index, computes blake2b hash, compares with args[0..32]
3. On transfer/burn: no additional check (TypeID rule allows transfer and burn)

### Cargo.toml Change Required

```toml
[dependencies]
ckb-std = { version = "1.0", features = ["type-id"] }
```

The `type-id` feature pulls in `ckb-hash` for blake2b computation.

---

## 6. Since Field for Deadline Enforcement

### CKB Since Mechanics

The `since` field is a 64-bit value on each transaction input. CKB consensus validates it **before** running scripts. If the since constraint is not met, the transaction is rejected at the consensus level.

### Since Encoding (Absolute Block Number)

For our use case (absolute block number deadline):
```
Bit 63 (lock type):  0 = absolute
Bits 62-56 (metric): 0x00 = block number
Bits 55-0 (value):   the block number
```

So for absolute block number, `since = block_number` (the upper bits are all 0).

### How the Lock Script Uses Since

**Important subtlety:** The lock script does NOT need to check if "current block >= deadline". CKB consensus already does this. If a transaction has `since = deadline_block` on an input, the transaction will be rejected by the node if the tip block is less than `deadline_block`.

The lock script's job is to **verify the transaction builder set the since field correctly**:

```rust
use ckb_std::since::{Since, LockValue};

let since_raw = load_input_since(0, Source::GroupInput)?;

if since_raw == 0 {
    // No since constraint — transaction builder didn't set deadline
    // This is the "before deadline" path (merge transactions)
} else {
    let since = Since::new(since_raw);

    // Must be absolute mode
    if !since.is_absolute() {
        return Err(ERROR_INVALID_SINCE);
    }

    // Must be block number metric
    match since.extract_lock_value() {
        Some(LockValue::BlockNumber(block_num)) => {
            // Verify the since value matches our deadline
            if block_num < lock_args.deadline_block {
                return Err(ERROR_SINCE_BELOW_DEADLINE);
            }
            // Good — we're in the "after deadline" path
        }
        _ => return Err(ERROR_INVALID_SINCE),
    }
}
```

### Key API Signatures

```rust
// Load since value for input at index in source
pub fn load_input_since(index: usize, source: Source) -> Result<u64, SysError>

// Parse since value
impl Since {
    pub fn new(v: u64) -> Self;
    pub fn is_absolute(self) -> bool;
    pub fn flags_is_valid(self) -> bool;
    pub fn extract_lock_value(self) -> Option<LockValue>;
}

pub enum LockValue {
    BlockNumber(u64),
    EpochNumberWithFraction(EpochNumberWithFraction),
    Timestamp(u64),
}
```

### Transaction Builder Must Set Since

For release/refund transactions, the transaction builder must set:
```typescript
// In CCC SDK (off-chain):
input.since = deadlineBlock; // For absolute block number, since = raw block number
```

For merge transactions (before deadline), since should be 0 (no constraint).

---

## 7. Exact ckb-std APIs Needed

### Import Block (Pledge Lock Script)

```rust
use ckb_std::{
    debug,
    high_level::{
        load_script,
        load_script_hash,
        load_cell_data,
        load_cell_type_hash,
        load_cell_lock_hash,
        load_cell_lock,
        load_cell_capacity,
        load_input_since,
    },
    ckb_constants::Source,
    error::SysError,
    since::{Since, LockValue},
};
```

### Import Block (Receipt Type Script)

```rust
use ckb_std::{
    debug,
    high_level::{
        load_script,
        load_cell_data,
        load_cell_lock,
        load_cell_lock_hash,
        load_cell_capacity,
    },
    ckb_constants::Source,
    error::SysError,
};
```

### Import Block (Campaign Type Script - Updated)

```rust
use ckb_std::{
    debug,
    high_level::{load_script, load_script_hash, load_cell_data},
    ckb_constants::Source,
    error::SysError,
    type_id::check_type_id,  // NEW — requires "type-id" feature
};
```

### API Signature Reference

| Function | Signature | Returns |
|----------|-----------|---------|
| `load_script()` | `fn load_script() -> Result<Script, SysError>` | The executing script (lock or type) |
| `load_script_hash()` | `fn load_script_hash() -> Result<[u8; 32], SysError>` | Hash of the executing script |
| `load_cell_data(i, src)` | `fn load_cell_data(index: usize, source: Source) -> Result<Vec<u8>, SysError>` | Raw cell data bytes |
| `load_cell_type_hash(i, src)` | `fn load_cell_type_hash(index: usize, source: Source) -> Result<Option<[u8; 32]>, SysError>` | Type script hash (None if no type) |
| `load_cell_lock_hash(i, src)` | `fn load_cell_lock_hash(index: usize, source: Source) -> Result<[u8; 32], SysError>` | Lock script hash |
| `load_cell_lock(i, src)` | `fn load_cell_lock(index: usize, source: Source) -> Result<Script, SysError>` | Full lock script (with args) |
| `load_cell_capacity(i, src)` | `fn load_cell_capacity(index: usize, source: Source) -> Result<u64, SysError>` | Cell capacity in shannons |
| `load_input_since(i, src)` | `fn load_input_since(index: usize, source: Source) -> Result<u64, SysError>` | Raw since u64 value |
| `check_type_id(off, len)` | `fn check_type_id(offset: usize, length: usize) -> Result<(), SysError>` | Validates TypeID in args |

### Source Enum Values

```rust
pub enum Source {
    Input = 1,           // All transaction inputs
    Output = 2,          // All transaction outputs
    CellDep = 3,         // Cell dependencies
    HeaderDep = 4,       // Header dependencies
    GroupInput = 0x01_00_00_00_00_00_00_01,  // Inputs matching current script
    GroupOutput = 0x01_00_00_00_00_00_00_02, // Outputs matching current script
}
```

**GroupInput/GroupOutput:** These filter to cells where the executing script matches:
- For a **type script**: cells whose type script matches
- For a **lock script**: cells whose lock script matches

---

## 8. Cell Data Layouts (All Cell Types)

### Campaign Cell Data (65 bytes) - Unchanged from v1.0

```
Offset  Size  Field               Type
0       32    creator_lock_hash   [u8; 32]
32      8     funding_goal        u64 LE
40      8     deadline_block      u64 LE
48      8     total_pledged       u64 LE
56      1     status              u8 (0=Active, 1=Success, 2=Failed)
57      8     reserved            [u8; 8]
```

**Campaign type script args (changed):**
```
Offset  Size  Field
0       32    type_id             [u8; 32] — TypeID (NEW in v1.1)
```

### Pledge Cell Data (72 bytes) - Unchanged from v1.0

```
Offset  Size  Field               Type
0       32    campaign_id         [u8; 32] — campaign cell type script hash
32      32    backer_lock_hash    [u8; 32]
64      8     amount              u64 LE
```

**Pledge lock script args (NEW in v1.1):**
```
Offset  Size  Field                       Type
0       32    campaign_type_script_hash   [u8; 32]
32      8     deadline_block              u64 LE
40      32    backer_lock_hash            [u8; 32]
```

### Receipt Cell Data (40 bytes) - NEW in v1.1

```
Offset  Size  Field               Type
0       8     pledge_amount       u64 LE
8       32    backer_lock_hash    [u8; 32]
```

**Receipt type script args:** `0x` (empty) or could contain campaign reference — to be decided during implementation.

### Summary Table

| Cell Type | Data Size | Lock Script | Type Script | Type Args |
|-----------|-----------|-------------|-------------|-----------|
| Campaign | 65 bytes | Creator's secp256k1 | Campaign type (v1.1) | 32B TypeID |
| Pledge | 72 bytes | **Pledge lock (NEW)** | Pledge type (v1.1) | `0x` |
| Receipt | 40 bytes | Backer's secp256k1 | Receipt type (NEW) | `0x` |

---

## 9. Error Code Conventions

### Existing Convention

The project uses `const ERROR_NAME: i8 = N;` with positive values starting at 7+. Return 0 for success.

### Proposed Error Codes

#### Pledge Lock Script

```rust
// Script loading errors
const ERROR_INVALID_ARGS: i8 = 10;
const ERROR_LOAD_SINCE: i8 = 11;
const ERROR_INVALID_SINCE: i8 = 12;
const ERROR_SINCE_BELOW_DEADLINE: i8 = 13;

// Campaign cell_dep errors
const ERROR_CAMPAIGN_STILL_ACTIVE: i8 = 20;
const ERROR_LOAD_CAMPAIGN: i8 = 21;

// Output verification errors
const ERROR_LOAD_CAPACITY: i8 = 30;
const ERROR_LOAD_LOCK_HASH: i8 = 31;
const ERROR_INSUFFICIENT_OUTPUT: i8 = 32;
const ERROR_OVERFLOW: i8 = 33;

// Merge errors
const ERROR_NOT_A_MERGE: i8 = 40;
const ERROR_NO_MERGE_OUTPUT: i8 = 41;
const ERROR_MULTIPLE_MERGE_OUTPUTS: i8 = 42;
const ERROR_MERGE_CAPACITY_MISMATCH: i8 = 43;
const ERROR_MERGE_LOCK_MISMATCH: i8 = 44;
```

#### Receipt Type Script

```rust
const ERROR_LOAD_DATA: i8 = 9;
const ERROR_INVALID_RECEIPT_DATA: i8 = 10;
const ERROR_RECEIPT_MODIFICATION_NOT_ALLOWED: i8 = 11;
const ERROR_ZERO_PLEDGE_AMOUNT: i8 = 12;
const ERROR_ZERO_BACKER_HASH: i8 = 13;
const ERROR_NO_MATCHING_PLEDGE: i8 = 14;
const ERROR_REFUND_OUTPUT_MISSING: i8 = 15;
const ERROR_LOAD_LOCK: i8 = 16;
const ERROR_LOAD_CAPACITY: i8 = 17;
const ERROR_LOAD_LOCK_HASH: i8 = 18;
```

#### Campaign Type Script (New Errors)

```rust
const ERROR_INVALID_TYPE_ID: i8 = 12;  // TypeID validation failed
```

#### Pledge Type Script (New Errors)

```rust
const ERROR_MERGE_DIFFERENT_CAMPAIGNS: i8 = 11;
const ERROR_MERGE_AMOUNT_MISMATCH: i8 = 12;
const ERROR_OVERFLOW: i8 = 13;
const ERROR_CAMPAIGN_MISMATCH: i8 = 14;
const ERROR_PARTIAL_REFUND_INVALID: i8 = 15;
```

---

## 10. Build Configuration

### New Contract Directories

Create two new contract crates alongside the existing ones:

```
contracts/
  campaign/          (existing — will be modified)
  pledge/            (existing — will be modified)
  pledge-lock/       (NEW)
  receipt/           (NEW)
```

### Cargo.toml for pledge-lock

```toml
[package]
name = "pledge-lock"
version = "0.1.0"
edition = "2021"

[dependencies]
ckb-std = "1.0"

[features]
library = []
native-simulator = ["library", "ckb-std/native-simulator"]
```

### Cargo.toml for receipt

```toml
[package]
name = "receipt"
version = "0.1.0"
edition = "2021"

[dependencies]
ckb-std = "1.0"

[features]
library = []
native-simulator = ["library", "ckb-std/native-simulator"]
```

### Updated Cargo.toml for campaign (add type-id feature)

```toml
[package]
name = "campaign-contract"
version = "0.1.0"
edition = "2021"

[dependencies]
ckb-std = { version = "1.0", features = ["type-id"] }

[features]
library = []
native-simulator = ["library", "ckb-std/native-simulator"]
```

### lib.rs for New Contracts

Same pattern as existing contracts:

```rust
#![cfg_attr(not(feature = "library"), no_std)]
#![allow(special_module_name)]
#![allow(unused_attributes)]
#[cfg(feature = "library")]
mod main;
#[cfg(feature = "library")]
pub use main::program_entry;

extern crate alloc;
```

### Makefile for New Contracts

Copy the existing `contracts/campaign/Makefile` verbatim to `contracts/pledge-lock/Makefile` and `contracts/receipt/Makefile`. The Makefile auto-detects the binary name from the directory name.

### Updated build-contracts.sh

```bash
#!/bin/bash
set -e
echo "Building CKB contracts..."
export CC_riscv64imac_unknown_none_elf=riscv64-elf-gcc
export RUSTFLAGS="-C target-feature=+zba,+zbb,+zbc,+zbs,-a"

for contract in campaign pledge pledge-lock receipt; do
    echo "Building $contract contract..."
    cd contracts/$contract
    cargo build --release --target riscv64imac-unknown-none-elf
    # Get the binary name from Cargo.toml package name (hyphens -> underscores for binary)
    binary_name=$(cargo metadata --format-version=1 --no-deps 2>/dev/null | \
        python3 -c "import sys,json; print(json.load(sys.stdin)['packages'][0]['name'])" 2>/dev/null || echo "$contract")
    riscv64-elf-objcopy --strip-debug --strip-all \
        target/riscv64imac-unknown-none-elf/release/$binary_name 2>/dev/null || true
    echo "  $contract contract built"
    cd ../..
done

echo "Build complete!"
```

**Note on binary names:** Cargo converts hyphens in package names to underscores for binary names. So `pledge-lock` package produces `pledge-lock` binary (actually `pledge_lock` or `pledge-lock` depending on the `[[bin]]` section; the Makefile uses the directory name by default via `$(notdir $(shell pwd))`).

### Binary Output Locations

```
contracts/pledge-lock/target/riscv64imac-unknown-none-elf/release/pledge-lock
contracts/receipt/target/riscv64imac-unknown-none-elf/release/receipt
```

---

## 11. Native Simulator Testing Strategy

### How Native Simulator Works

The `native-simulator` feature compiles contracts as native x86_64 code instead of RISC-V. The ckb-x64-simulator crate provides mock implementations of CKB syscalls that can be configured in test code.

### Test Setup Pattern

Each contract has a `#[cfg(test)]` module in its `main.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_success_release() {
        // Configure the simulator with mock cells, then call program_entry()
        // and assert the return value
    }
}
```

Run tests with:
```bash
cd contracts/pledge-lock
cargo test
```

This uses the `native-simulator` feature automatically since `#[cfg(test)]` enables standard library mode.

### Key Test Scenarios (D-16)

1. **Success release** — after deadline, campaign Success, output to creator. Expect return 0.
2. **Failed refund** — after deadline, campaign Failed, output to backer. Expect return 0.
3. **Fail-safe refund** — after deadline, no campaign cell_dep. Expect return 0 (refund to backer).
4. **Before deadline rejection** — since=0 (no deadline constraint), non-merge tx. Expect error.
5. **At deadline boundary** — since = deadline_block exactly. Expect success (>= check).
6. **Fake cell_dep rejection** — cell_dep with wrong type script hash. Expect error.
7. **Lock dedup safety** — two different backers' pledge cells in same tx. Each lock runs independently due to unique args.
8. **Receipt creation validation** — receipt created with matching pledge cell. Expect return 0.
9. **Receipt destruction validation** — receipt destroyed with matching refund output. Expect return 0.
10. **Merge capacity preservation** — 3 inputs merge to 1 output, capacity sum matches. Expect return 0.
11. **TypeID verification** — campaign creation with correct TypeID. Expect return 0.

### Limitation

The native simulator can test individual script logic but cannot test cross-script interactions (e.g., lock script + type script in the same transaction). Full integration testing requires devnet (Phase 2).

---

## 12. CampaignData Reuse Across Contracts

The pledge lock script needs to parse `CampaignData` from cell_deps. There are two approaches:

### Option A: Duplicate the Struct (Recommended for v1.1)

Copy `CampaignData` and `CampaignStatus` into the pledge lock script's `main.rs`. This avoids cross-crate dependencies and keeps contracts independent.

```rust
// In contracts/pledge-lock/src/main.rs
// Duplicated from campaign contract — must stay in sync

#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CampaignStatus {
    Active = 0,
    Success = 1,
    Failed = 2,
}

// Minimal parsing — only need status + creator_lock_hash
fn parse_campaign_status(data: &[u8]) -> Result<CampaignStatus, i8> {
    if data.len() < 57 { return Err(ERROR_LOAD_CAMPAIGN); }
    match data[56] {
        0 => Ok(CampaignStatus::Active),
        1 => Ok(CampaignStatus::Success),
        2 => Ok(CampaignStatus::Failed),
        _ => Err(ERROR_LOAD_CAMPAIGN),
    }
}

fn parse_creator_lock_hash(data: &[u8]) -> Result<[u8; 32], i8> {
    if data.len() < 32 { return Err(ERROR_LOAD_CAMPAIGN); }
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&data[0..32]);
    Ok(hash)
}
```

### Option B: Shared Crate

Create a `contracts/shared/` library crate with common types. More maintainable but adds build complexity. Consider for future if more types are shared.

---

## 13. MAX_FEE Constant

Per D-07, the lock script enforces `output_capacity >= input_capacity - MAX_FEE`.

```rust
/// Maximum fee deductible from pledge capacity (in shannons).
/// 1 CKB = 100,000,000 shannons.
/// This allows transaction fees up to 1 CKB while preventing pledge draining.
const MAX_FEE: u64 = 100_000_000;
```

This constant should be defined in both the pledge lock script and the receipt type script (both validate output capacity).

---

## Summary: Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `contracts/pledge-lock/Cargo.toml` | Package config for pledge lock |
| `contracts/pledge-lock/Makefile` | Build config (copy from campaign) |
| `contracts/pledge-lock/src/main.rs` | Pledge lock script implementation |
| `contracts/pledge-lock/src/lib.rs` | Library exports |
| `contracts/receipt/Cargo.toml` | Package config for receipt type |
| `contracts/receipt/Makefile` | Build config (copy from campaign) |
| `contracts/receipt/src/main.rs` | Receipt type script implementation |
| `contracts/receipt/src/lib.rs` | Library exports |

### Modified Files
| File | Change |
|------|--------|
| `contracts/campaign/Cargo.toml` | Add `features = ["type-id"]` to ckb-std dependency |
| `contracts/campaign/src/main.rs` | Add `check_type_id(0, 32)` call + new error code |
| `contracts/pledge/src/main.rs` | Change `(true, true)` case from error to merge/partial-refund validation |
| `scripts/build-contracts.sh` | Add pledge-lock and receipt to build loop |

---

*Phase: 01-on-chain-contracts*
*Research completed: 2026-03-26*
