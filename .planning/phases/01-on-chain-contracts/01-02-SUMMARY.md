# Plan 02: Receipt Type Script - Summary

**Status:** Complete
**Completed:** 2026-03-27

## Tasks Completed

### 02-01: Create receipt crate scaffold
- Created `contracts/receipt/Cargo.toml` with `name = "receipt"` and `ckb-std = "1.0"`
- Created `contracts/receipt/src/lib.rs` with `pub use main::program_entry` pattern
- Created `contracts/receipt/src/main.rs` with standard CKB boilerplate (`ckb_std::entry!`, `default_alloc!`)
- Compiles with `cargo check --lib --features library`
- **Commit:** `f34dcde feat(receipt): create receipt type script crate scaffold`

### 02-02: Implement ReceiptData struct, error codes, and imports
- Added `ReceiptData` struct with 40-byte layout: `pledge_amount` (u64 LE, bytes 0-7) + `backer_lock_hash` ([u8;32], bytes 8-39)
- Implemented `from_bytes` and `to_bytes` serialization methods
- Defined all error codes: ERROR_LOAD_DATA (9), ERROR_INVALID_RECEIPT_DATA (10), ERROR_RECEIPT_MODIFICATION_NOT_ALLOWED (11), ERROR_ZERO_PLEDGE_AMOUNT (12), ERROR_ZERO_BACKER_HASH (13), ERROR_NO_MATCHING_PLEDGE (14), ERROR_REFUND_OUTPUT_MISSING (15), ERROR_LOAD_LOCK (16), ERROR_LOAD_CAPACITY (17), ERROR_LOAD_LOCK_HASH (18)
- Added constants: MAX_FEE (100_000_000), PLEDGE_LOCK_ARGS_SIZE (72)
- **Commit:** `635166a feat(receipt): add ReceiptData struct, error codes, and imports`

### 02-03: Implement validate_receipt_creation
- Validates receipt creation per D-11: receipt must be created alongside a valid pledge cell
- Loads receipt data from `Source::GroupOutput` index 0
- Rejects `pledge_amount == 0` (ERROR_ZERO_PLEDGE_AMOUNT) and `backer_lock_hash == [0u8; 32]` (ERROR_ZERO_BACKER_HASH)
- Iterates `Source::Output` checking lock args length >= 72 and comparing backer_lock_hash at offset [40..72]
- Returns ERROR_NO_MATCHING_PLEDGE if no matching pledge cell found
- **Commit:** `0b2b978 feat(receipt): implement validate_receipt_creation`

### 02-04: Implement validate_receipt_destruction
- Validates receipt destruction per D-12: during refund, output must go to backer with sufficient capacity
- Loads receipt data from `Source::GroupInput` index 0
- Computes `min_refund = pledge_amount.checked_sub(MAX_FEE).unwrap_or(0)`
- Iterates `Source::Output` checking for output to `backer_lock_hash` with `cap >= min_refund`
- Returns ERROR_REFUND_OUTPUT_MISSING if no matching refund output found
- **Commit:** `981f3ee feat(receipt): implement validate_receipt_destruction`

### 02-05: Implement program_entry with creation/destruction/modification routing
- Replaced placeholder `program_entry` with full routing logic
- `(false, true)` -> `validate_receipt_creation()` (RCPT-01)
- `(true, false)` -> `validate_receipt_destruction()` (RCPT-03)
- `(true, true)` -> `ERROR_RECEIPT_MODIFICATION_NOT_ALLOWED` (RCPT-02, receipts immutable)
- `(false, false)` -> `0` (no-op)
- **Commit:** Pending (code complete, needs staging)

## Verification

- All five tasks implemented in `contracts/receipt/src/main.rs`
- Contract compiles with `cargo check --lib --features library` (2 minor warnings for unused imports)
- Contains: `ReceiptData`, `validate_receipt_creation`, `validate_receipt_destruction`, `program_entry`
- program_entry routes to creation validation, destruction validation, or modification rejection
- Follows same patterns as existing `contracts/pledge/src/main.rs`

## Files Modified
- `contracts/receipt/Cargo.toml` (new)
- `contracts/receipt/src/lib.rs` (new)
- `contracts/receipt/src/main.rs` (new)

## Requirements Covered
- **RCPT-01:** Receipt created alongside valid pledge cell with matching backer_lock_hash
- **RCPT-02:** Receipts are immutable (modification returns error)
- **RCPT-03:** Receipt destruction validates refund output to backer with capacity >= pledge_amount - MAX_FEE
