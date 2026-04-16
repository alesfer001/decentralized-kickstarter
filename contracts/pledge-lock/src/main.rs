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
    high_level::{
        load_script,
        load_cell_data,
        load_cell_type_hash,
        load_cell_lock_hash,
        load_cell_capacity,
        load_input_since,
    },
    ckb_constants::Source,
    error::SysError,
    since::{Since, LockValue},
};

// === Error Codes ===
// Script loading errors
const ERROR_INVALID_ARGS: i8 = 10;
const ERROR_LOAD_SINCE: i8 = 11;
const ERROR_INVALID_SINCE: i8 = 12;
const ERROR_SINCE_BELOW_DEADLINE: i8 = 13;

// Campaign cell_dep errors
const ERROR_CAMPAIGN_STILL_ACTIVE: i8 = 20;
const ERROR_CAMPAIGN_CELL_DEP_MISSING: i8 = 21;

/// Grace period: ~180 days at 8s/block = 1,944,000 blocks
/// After this period past deadline, allow refund without campaign cell_dep
const GRACE_PERIOD_BLOCKS: u64 = 1_944_000;

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
#[allow(dead_code)]
const ERROR_MERGE_LOCK_MISMATCH: i8 = 44;

/// Maximum fee deducted from pledge capacity during release/refund (1 CKB = 100M shannons)
const MAX_FEE: u64 = 100_000_000;

const PLEDGE_LOCK_ARGS_SIZE: usize = 72;

/// Pledge lock script args layout (72 bytes):
/// - campaign_type_script_hash: [u8; 32]  (bytes 0-31)
/// - deadline_block: u64                  (bytes 32-39, LE)
/// - backer_lock_hash: [u8; 32]           (bytes 40-71)
struct PledgeLockArgs {
    campaign_type_script_hash: [u8; 32],
    deadline_block: u64,
    backer_lock_hash: [u8; 32],
}

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

/// Campaign status enum (mirrors campaign contract)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CampaignStatus {
    Active = 0,
    Success = 1,
    Failed = 2,
}

/// Campaign data layout (65 bytes) — read-only, for parsing cell_dep data
struct CampaignData {
    creator_lock_hash: [u8; 32],
    status: CampaignStatus,
}

impl CampaignData {
    const SIZE: usize = 65;

    fn from_bytes(data: &[u8]) -> Result<Self, i8> {
        if data.len() < Self::SIZE {
            return Err(ERROR_INVALID_ARGS);
        }
        let mut creator_lock_hash = [0u8; 32];
        creator_lock_hash.copy_from_slice(&data[0..32]);
        // Skip funding_goal (32..40), deadline_block (40..48), total_pledged (48..56)
        let status = match data[56] {
            0 => CampaignStatus::Active,
            1 => CampaignStatus::Success,
            2 => CampaignStatus::Failed,
            _ => return Err(ERROR_INVALID_ARGS),
        };
        Ok(CampaignData {
            creator_lock_hash,
            status,
        })
    }
}

/// Search cell_deps for a cell whose type script hash matches the expected campaign hash.
fn find_campaign_in_cell_deps(expected_hash: &[u8; 32]) -> Option<CampaignData> {
    for i in 0.. {
        match load_cell_type_hash(i, Source::CellDep) {
            Ok(Some(hash)) => {
                if hash == *expected_hash {
                    let data = load_cell_data(i, Source::CellDep).ok()?;
                    return CampaignData::from_bytes(&data).ok();
                }
            }
            Ok(None) => continue,
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return None,
        }
    }
    None
}

/// Sum capacity of all cells in GroupInput (cells sharing this lock script).
fn sum_group_input_capacity() -> Result<u64, i8> {
    let mut total: u64 = 0;
    for i in 0.. {
        match load_cell_capacity(i, Source::GroupInput) {
            Ok(cap) => {
                total = total.checked_add(cap).ok_or(ERROR_OVERFLOW)?;
            }
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return Err(ERROR_LOAD_CAPACITY),
        }
    }
    Ok(total)
}

/// Verify that outputs going to expected_lock_hash have total capacity >= min_capacity - MAX_FEE.
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

/// D-04: After deadline + Success -> output must go to creator_lock_hash
fn validate_release(_lock_args: &PledgeLockArgs, campaign: &CampaignData) -> i8 {
    let total_input_capacity = match sum_group_input_capacity() {
        Ok(v) => v,
        Err(code) => return code,
    };
    match find_output_to_lock_hash(&campaign.creator_lock_hash, total_input_capacity) {
        Ok(()) => 0,
        Err(code) => code,
    }
}

/// D-05/D-06: After deadline + Failed (or no cell_dep) -> output must go to backer_lock_hash
fn validate_refund(lock_args: &PledgeLockArgs) -> i8 {
    let total_input_capacity = match sum_group_input_capacity() {
        Ok(v) => v,
        Err(code) => return code,
    };
    match find_output_to_lock_hash(&lock_args.backer_lock_hash, total_input_capacity) {
        Ok(()) => 0,
        Err(code) => code,
    }
}

/// D-03: Before deadline, only merging is allowed.
/// Merge = multiple inputs with same lock -> 1 output with same lock, capacity preserved exactly.
/// Uses Source::Output with manual lock hash comparison (avoids GroupOutput matching issues).
fn validate_merge(_lock_args: &PledgeLockArgs) -> i8 {
    // Count group inputs and sum capacity
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

    // Must have multiple inputs (otherwise not a merge)
    if input_count < 2 {
        return ERROR_NOT_A_MERGE;
    }

    // Get our lock script hash from the first group input
    let our_lock_hash = match load_cell_lock_hash(0, Source::GroupInput) {
        Ok(h) => h,
        Err(_) => return ERROR_LOAD_LOCK_HASH,
    };

    // Scan all outputs for cells matching our lock hash
    let mut matching_output_count: usize = 0;
    let mut matching_output_cap: u64 = 0;
    for i in 0.. {
        match load_cell_lock_hash(i, Source::Output) {
            Ok(hash) => {
                if hash == our_lock_hash {
                    matching_output_count += 1;
                    let cap = match load_cell_capacity(i, Source::Output) {
                        Ok(c) => c,
                        Err(_) => return ERROR_LOAD_CAPACITY,
                    };
                    matching_output_cap = match matching_output_cap.checked_add(cap) {
                        Some(v) => v,
                        None => return ERROR_OVERFLOW,
                    };
                }
            }
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return ERROR_LOAD_LOCK_HASH,
        }
    }

    // Must have exactly 1 matching output
    if matching_output_count == 0 {
        return ERROR_NO_MERGE_OUTPUT;
    }
    if matching_output_count > 1 {
        return ERROR_MULTIPLE_MERGE_OUTPUTS;
    }

    // Output capacity must equal total input capacity (no fee during merge)
    if matching_output_cap != total_input_cap {
        return ERROR_MERGE_CAPACITY_MISMATCH;
    }

    0
}

pub fn program_entry() -> i8 {
    debug!("Pledge Lock Script running");

    // 1. Load own script and parse args
    let script = match load_script() {
        Ok(s) => s,
        Err(_) => {
            debug!("Failed to load script");
            return ERROR_INVALID_ARGS;
        }
    };
    let args = script.args().raw_data();
    let lock_args = match PledgeLockArgs::from_bytes(&args) {
        Ok(a) => a,
        Err(code) => return code,
    };

    // 2. Check since field to determine before/after deadline
    let since_raw = match load_input_since(0, Source::GroupInput) {
        Ok(v) => v,
        Err(_) => return ERROR_LOAD_SINCE,
    };

    let (is_after_deadline, since_block) = if since_raw == 0 {
        // since=0 means no time constraint — before deadline path
        (false, 0u64)
    } else {
        // Parse the since value to verify it's absolute block number
        let since = Since::new(since_raw);
        if !since.is_absolute() || !since.flags_is_valid() {
            return ERROR_INVALID_SINCE;
        }
        match since.extract_lock_value() {
            Some(LockValue::BlockNumber(block)) => {
                if block < lock_args.deadline_block {
                    return ERROR_SINCE_BELOW_DEADLINE;
                }
                (true, block)
            }
            _ => return ERROR_INVALID_SINCE,
        }
    };

    if !is_after_deadline {
        // BEFORE DEADLINE: only merge is allowed
        return validate_merge(&lock_args);
    }

    // AFTER DEADLINE: release or refund based on campaign status
    match find_campaign_in_cell_deps(&lock_args.campaign_type_script_hash) {
        Some(campaign_data) => {
            match campaign_data.status {
                CampaignStatus::Success => validate_release(&lock_args, &campaign_data),
                CampaignStatus::Failed => validate_refund(&lock_args),
                CampaignStatus::Active => ERROR_CAMPAIGN_STILL_ACTIVE,
            }
        }
        None => {
            // Issue 1 fix: campaign cell_dep is mandatory within grace period
            // Grace period fail-safe: allow refund only well past deadline
            let grace_deadline = lock_args.deadline_block
                .saturating_add(GRACE_PERIOD_BLOCKS);
            if since_block >= grace_deadline {
                debug!("Grace period expired — fail-safe refund allowed");
                validate_refund(&lock_args)
            } else {
                debug!("Campaign cell_dep required (grace period active)");
                ERROR_CAMPAIGN_CELL_DEP_MISSING
            }
        }
    }
}
