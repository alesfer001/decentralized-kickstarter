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

pub fn program_entry() -> i8 {
    0
}
