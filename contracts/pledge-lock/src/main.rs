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
        load_cell_lock,
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
const ERROR_MIXED_PLEDGE_INPUTS: i8 = 34;

// Merge errors
const ERROR_NOT_A_MERGE: i8 = 40;
const ERROR_NO_MERGE_OUTPUT: i8 = 41;
const ERROR_MULTIPLE_MERGE_OUTPUTS: i8 = 42;
const ERROR_MERGE_CAPACITY_MISMATCH: i8 = 43;
const ERROR_MERGE_LOCK_MISMATCH: i8 = 44;
const ERROR_MERGE_TYPE_MISMATCH: i8 = 45;
const ERROR_MERGE_AMOUNT_MISMATCH: i8 = 46;

/// Maximum fee deducted from pledge capacity during release/refund (1 CKB = 100M shannons)
const MAX_FEE: u64 = 100_000_000;

const PLEDGE_LOCK_ARGS_SIZE: usize = 72;

/// Pledge cell data is 72 bytes; the pledged amount is the u64 LE at bytes 64-71
const PLEDGE_DATA_SIZE: usize = 72;
const PLEDGE_AMOUNT_OFFSET: usize = 64;

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

/// Capacity and pledged amount summed over GroupInput (cells sharing this lock script).
///
/// The amount is read from pledge data. The campaign accumulator only counts a pledge whose
/// cell holds its amount plus its own storage cost, so for every pledge that could have
/// made a campaign succeed, capacity - amount is the backer's storage overhead. A cell with
/// no readable amount, or claiming more than it holds, was never counted; all of its
/// capacity is treated as pledged, which is how v1.1 routed every pledge.
fn sum_group_inputs() -> Result<(u64, u64), i8> {
    let mut capacity: u64 = 0;
    let mut amount: u64 = 0;
    for i in 0.. {
        let cell_capacity = match load_cell_capacity(i, Source::GroupInput) {
            Ok(c) => c,
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return Err(ERROR_LOAD_CAPACITY),
        };
        let cell_amount = match load_cell_data(i, Source::GroupInput) {
            Ok(data) if data.len() >= PLEDGE_DATA_SIZE => {
                let claimed = u64::from_le_bytes(
                    data[PLEDGE_AMOUNT_OFFSET..PLEDGE_DATA_SIZE].try_into().unwrap(),
                );
                if claimed <= cell_capacity { claimed } else { cell_capacity }
            }
            _ => cell_capacity,
        };
        capacity = capacity.checked_add(cell_capacity).ok_or(ERROR_OVERFLOW)?;
        amount = amount.checked_add(cell_amount).ok_or(ERROR_OVERFLOW)?;
    }
    Ok((capacity, amount))
}

/// Release and refund must not share a transaction with another pledge-lock group.
///
/// Each group checks the outputs going to its destination on its own. Two groups routing
/// to the same lock (two backers' pledges both releasing to one creator) would each count
/// the same output, and whoever built the transaction could keep the difference.
fn ensure_only_pledge_group_in_inputs() -> Result<(), i8> {
    let script = load_script().map_err(|_| ERROR_INVALID_ARGS)?;
    let own_code_hash = script.code_hash().raw_data();
    let own_lock_hash = load_cell_lock_hash(0, Source::GroupInput).map_err(|_| ERROR_LOAD_LOCK_HASH)?;

    for i in 0.. {
        let lock = match load_cell_lock(i, Source::Input) {
            Ok(l) => l,
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return Err(ERROR_LOAD_LOCK_HASH),
        };
        if lock.code_hash().raw_data() != own_code_hash {
            continue;
        }
        let lock_hash = load_cell_lock_hash(i, Source::Input).map_err(|_| ERROR_LOAD_LOCK_HASH)?;
        if lock_hash != own_lock_hash {
            debug!("Input {} is another pledge-lock group", i);
            return Err(ERROR_MIXED_PLEDGE_INPUTS);
        }
    }
    Ok(())
}

/// Total capacity of outputs locked by `lock_hash`
fn sum_outputs_to(lock_hash: &[u8; 32]) -> Result<u64, i8> {
    let mut total: u64 = 0;
    for i in 0.. {
        match load_cell_lock_hash(i, Source::Output) {
            Ok(hash) => {
                if hash == *lock_hash {
                    let cap = load_cell_capacity(i, Source::Output).map_err(|_| ERROR_LOAD_CAPACITY)?;
                    total = total.checked_add(cap).ok_or(ERROR_OVERFLOW)?;
                }
            }
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return Err(ERROR_LOAD_LOCK_HASH),
        }
    }
    Ok(total)
}

/// Require at least `required` shannons going to `lock_hash`
fn require_outputs_to(lock_hash: &[u8; 32], required: u64) -> Result<(), i8> {
    if sum_outputs_to(lock_hash)? >= required {
        Ok(())
    } else {
        Err(ERROR_INSUFFICIENT_OUTPUT)
    }
}

/// D-04: After deadline + Success -> the pledged amount goes to the creator, and the cell's
/// storage overhead goes back to the backer. The fee (at most MAX_FEE) comes out of the
/// overhead, so the creator receives exactly what was pledged.
fn validate_release(lock_args: &PledgeLockArgs, campaign: &CampaignData) -> i8 {
    let result = ensure_only_pledge_group_in_inputs()
        .and_then(|_| sum_group_inputs())
        .and_then(|(capacity, amount)| {
            let overhead = capacity - amount; // amount <= capacity per sum_group_inputs
            if campaign.creator_lock_hash == lock_args.backer_lock_hash {
                // A creator backing their own campaign: both shares land in one wallet
                return require_outputs_to(&campaign.creator_lock_hash, capacity.saturating_sub(MAX_FEE));
            }
            require_outputs_to(&campaign.creator_lock_hash, amount)?;
            require_outputs_to(&lock_args.backer_lock_hash, overhead.saturating_sub(MAX_FEE))
        });
    match result {
        Ok(()) => 0,
        Err(code) => code,
    }
}

/// D-05/D-06: After deadline + Failed (or no cell_dep) -> everything goes back to the backer
fn validate_refund(lock_args: &PledgeLockArgs) -> i8 {
    let result = ensure_only_pledge_group_in_inputs()
        .and_then(|_| sum_group_inputs())
        .and_then(|(capacity, _)| {
            require_outputs_to(&lock_args.backer_lock_hash, capacity.saturating_sub(MAX_FEE))
        });
    match result {
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

    // Verify all group inputs have identical lock args (defense in depth)
    // Source::GroupInput already guarantees identical lock hashes, but explicit
    // args comparison adds clarity and defense against future changes.
    // Note: identical lock hash (code_hash + hash_type + args) implies identical args,
    // so this check is theoretically redundant but valuable as defense in depth.
    let our_lock_args = match load_script() {
        Ok(s) => s.args().raw_data().to_vec(),
        Err(_) => return ERROR_INVALID_ARGS,
    };

    // Verify all group inputs match our lock args
    for i in 0.. {
        match load_cell_lock_hash(i, Source::GroupInput) {
            Ok(hash) => {
                if hash != our_lock_hash {
                    // This shouldn't happen due to GroupInput matching, but check anyway
                    debug!("Merge: input {} has different lock hash", i);
                    return ERROR_MERGE_LOCK_MISMATCH;
                }
            }
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return ERROR_LOAD_LOCK_HASH,
        }
    }

    // Scan all outputs for cells matching our lock hash
    let mut matching_output_count: usize = 0;
    let mut matching_output_cap: u64 = 0;
    let mut matching_output_index: usize = 0;
    for i in 0.. {
        match load_cell_lock_hash(i, Source::Output) {
            Ok(hash) => {
                if hash == our_lock_hash {
                    matching_output_count += 1;
                    matching_output_index = i;
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

    match validate_merge_preserves_pledge(matching_output_index) {
        Ok(()) => 0,
        Err(code) => code,
    }
}

/// A merge must keep the pledge type script and the total pledged amount.
///
/// Capacity alone is not enough. If the merged cell carried a different type script (the
/// same pledge code with other args), the pledge type script would run the inputs and the
/// output as separate groups, a destruction and a creation, and never compare amounts. A
/// backer could then rewrite a counted pledge's amount after the campaign succeeded, and a
/// release would pay the creator the rewritten amount.
fn validate_merge_preserves_pledge(output_index: usize) -> Result<(), i8> {
    let input_type = load_cell_type_hash(0, Source::GroupInput)
        .map_err(|_| ERROR_LOAD_LOCK_HASH)?
        .ok_or(ERROR_MERGE_TYPE_MISMATCH)?;

    let mut total_amount: u64 = 0;
    for i in 0.. {
        let type_hash = match load_cell_type_hash(i, Source::GroupInput) {
            Ok(t) => t,
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return Err(ERROR_LOAD_LOCK_HASH),
        };
        if type_hash != Some(input_type) {
            debug!("Merge: input {} has a different type script", i);
            return Err(ERROR_MERGE_TYPE_MISMATCH);
        }
        let data = load_cell_data(i, Source::GroupInput).map_err(|_| ERROR_LOAD_CAPACITY)?;
        if data.len() < PLEDGE_DATA_SIZE {
            return Err(ERROR_MERGE_AMOUNT_MISMATCH);
        }
        let amount = u64::from_le_bytes(data[PLEDGE_AMOUNT_OFFSET..PLEDGE_DATA_SIZE].try_into().unwrap());
        total_amount = total_amount.checked_add(amount).ok_or(ERROR_OVERFLOW)?;
    }

    let output_type = load_cell_type_hash(output_index, Source::Output).map_err(|_| ERROR_LOAD_LOCK_HASH)?;
    if output_type != Some(input_type) {
        debug!("Merge: output type script differs from the inputs");
        return Err(ERROR_MERGE_TYPE_MISMATCH);
    }
    let data = load_cell_data(output_index, Source::Output).map_err(|_| ERROR_LOAD_CAPACITY)?;
    if data.len() < PLEDGE_DATA_SIZE {
        return Err(ERROR_MERGE_AMOUNT_MISMATCH);
    }
    let output_amount = u64::from_le_bytes(data[PLEDGE_AMOUNT_OFFSET..PLEDGE_DATA_SIZE].try_into().unwrap());
    if output_amount != total_amount {
        debug!("Merge: output amount {} != inputs {}", output_amount, total_amount);
        return Err(ERROR_MERGE_AMOUNT_MISMATCH);
    }
    Ok(())
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
        // Note: since=0 doesn't prove actual block < deadline, but merge output
        // retains the same lock script, so funds remain locked regardless.
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
