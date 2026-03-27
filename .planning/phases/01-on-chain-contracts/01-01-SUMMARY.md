# Plan 01-01 Summary: Pledge Lock Script

**Status:** Complete
**Date:** 2026-03-27

## What Was Done

Created the pledge-lock contract (`contracts/pledge-lock/`) implementing the core trustless fund distribution logic for CKB Kickstarter v1.1.

### Tasks Completed

1. **01-01: Crate scaffold** - Created `contracts/pledge-lock/` with Cargo.toml, lib.rs, and main.rs matching existing contract patterns (ckb-std 1.0, library/native-simulator features).

2. **01-02: PledgeLockArgs struct** - Implemented 72-byte args layout (`campaign_type_script_hash[32] + deadline_block[8] + backer_lock_hash[32]`), all 14 error codes, and MAX_FEE constant (1 CKB = 100M shannons).

3. **01-03: CampaignData struct** - Added read-only CampaignStatus enum and CampaignData struct for parsing campaign cell_dep data (65 bytes). Extracts creator_lock_hash (bytes 0-31) and status (byte 56).

4. **01-04: Helper functions** - Implemented `find_campaign_in_cell_deps` (iterates cell_deps by type hash), `sum_group_input_capacity` (sums GroupInput with overflow protection), and `find_output_to_lock_hash` (verifies output capacity >= input - MAX_FEE).

5. **01-05: Validation functions** - Implemented `validate_release` (routes to creator on success), `validate_refund` (routes to backer on failure), and `validate_merge` (enforces N>=2 inputs to 1 output, exact capacity, same lock hash).

6. **01-06: program_entry** - Full entry point with since-based deadline detection, campaign cell_dep lookup, and all four routing paths: merge (before deadline), release (after + Success), refund (after + Failed), fail-safe refund (after + no cell_dep).

### Files Created/Modified

- `contracts/pledge-lock/Cargo.toml` (new)
- `contracts/pledge-lock/src/lib.rs` (new)
- `contracts/pledge-lock/src/main.rs` (new, 330 lines)

### Requirements Covered

- **LOCK-01:** Routes funds to creator on success, backer on failure
- **LOCK-02:** Enforces deadline via since field (absolute block number)
- **LOCK-03:** Reads campaign from cell_deps, verifies type script hash
- **LOCK-04:** backer_lock_hash in args ensures unique args per backer

### Design Decisions Implemented

- **D-01:** Full context in args (72 bytes, self-contained)
- **D-02:** backer_lock_hash prevents lock script dedup vulnerability
- **D-03:** Before deadline: only merge allowed
- **D-04:** After deadline + Success: release to creator
- **D-05:** After deadline + Failed: refund to backer
- **D-06:** Fail-safe refund when no campaign cell_dep
- **D-07:** MAX_FEE = 1 CKB tolerance on output verification

### Verification

- `cargo check --features library` passes (native check; `cargo check` without features fails for all CKB contracts due to no_std binary target requiring RISC-V)
- All structs, enums, functions, and error codes present per plan specification
- All four program_entry paths implemented: merge, release, refund, fail-safe refund

### Commits

1. `de341aa` - feat(pledge-lock): create pledge-lock crate scaffold
2. `b9c0fb6` - feat(pledge-lock): add PledgeLockArgs struct and error codes
3. `9a5db62` - feat(pledge-lock): add CampaignData struct for cell_dep parsing
4. `28ac1ab` - feat(pledge-lock): add helper functions for cell_dep lookup, capacity summing, and output verification
5. (pending) - feat(pledge-lock): implement validate functions and program_entry with since-based routing
