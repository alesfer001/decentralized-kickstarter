#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]

#[cfg(any(feature = "library", test))]
extern crate alloc;

#[cfg(not(any(feature = "library", test)))]
ckb_std::entry!(program_entry);
#[cfg(not(any(feature = "library", test)))]
// By default, the following heap configuration is used:
// * 16KB fixed heap
// * 1.2MB(rounded up to be 16-byte aligned) dynamic heap
// * Minimal memory block in dynamic heap is 64 bytes
// For more details, please refer to ckb-std's default_alloc macro
// and the buddy-alloc alloc implementation.
ckb_std::default_alloc!(16384, 1258306, 64);

use ckb_std::{
    debug,
    high_level::{load_script, load_cell_data, load_input_since},
    ckb_constants::Source,
    error::SysError,
    type_id::check_type_id,
    since::{Since, LockValue},
};

/// Error codes
const ERROR_NO_SCRIPT: i8 = 7;
const ERROR_LOAD_DATA: i8 = 9;
const ERROR_INVALID_FINALIZATION: i8 = 10;
#[allow(dead_code)]
const ERROR_MODIFICATION_NOT_ALLOWED: i8 = 11;
const ERROR_INVALID_TYPE_ID: i8 = 12;
const ERROR_DESTRUCTION_NOT_ALLOWED: i8 = 13;
const ERROR_LOAD_SINCE: i8 = 14;

/// Grace period: ~180 days at 8s/block = 1,944,000 blocks
/// Success campaigns can only be destroyed after this period past deadline
const GRACE_PERIOD_BLOCKS: u64 = 1_944_000;

/// Campaign status enum
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CampaignStatus {
    Active = 0,
    Success = 1,
    Failed = 2,
}

/// Campaign data structure (stored in cell data)
/// Layout (total: 65 bytes):
/// - creator_lock_hash: [u8; 32]  (bytes 0-31)
/// - funding_goal: u64            (bytes 32-39)
/// - deadline_block: u64          (bytes 40-47)
/// - total_pledged: u64           (bytes 48-55)
/// - status: u8                   (byte 56)
/// - reserved: [u8; 8]            (bytes 57-64) for future use
pub struct CampaignData {
    pub creator_lock_hash: [u8; 32],
    pub funding_goal: u64,
    pub deadline_block: u64,
    pub total_pledged: u64,
    pub status: CampaignStatus,
}

impl CampaignData {
    pub const SIZE: usize = 65;

    /// Parse campaign data from bytes
    pub fn from_bytes(data: &[u8]) -> Result<Self, i8> {
        if data.len() < Self::SIZE {
            debug!("Campaign data too short: {} bytes", data.len());
            return Err(1);
        }

        let mut creator_lock_hash = [0u8; 32];
        creator_lock_hash.copy_from_slice(&data[0..32]);

        let funding_goal = u64::from_le_bytes(data[32..40].try_into().unwrap());
        let deadline_block = u64::from_le_bytes(data[40..48].try_into().unwrap());
        let total_pledged = u64::from_le_bytes(data[48..56].try_into().unwrap());

        let status = match data[56] {
            0 => CampaignStatus::Active,
            1 => CampaignStatus::Success,
            2 => CampaignStatus::Failed,
            _ => {
                debug!("Invalid campaign status: {}", data[56]);
                return Err(2);
            }
        };

        Ok(CampaignData {
            creator_lock_hash,
            funding_goal,
            deadline_block,
            total_pledged,
            status,
        })
    }

    /// Convert campaign data to bytes
    pub fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut bytes = [0u8; Self::SIZE];
        bytes[0..32].copy_from_slice(&self.creator_lock_hash);
        bytes[32..40].copy_from_slice(&self.funding_goal.to_le_bytes());
        bytes[40..48].copy_from_slice(&self.deadline_block.to_le_bytes());
        bytes[48..56].copy_from_slice(&self.total_pledged.to_le_bytes());
        bytes[56] = self.status as u8;
        // bytes[57..65] reserved for future use
        bytes
    }

    /// Validate campaign creation
    pub fn validate_creation(&self) -> Result<(), i8> {
        // Funding goal must be greater than 0
        if self.funding_goal == 0 {
            debug!("Invalid funding goal: must be > 0");
            return Err(3);
        }

        // Deadline must be in the future (we'll check against current block in the transaction)
        // For now, just ensure it's not zero
        if self.deadline_block == 0 {
            debug!("Invalid deadline: must be > 0");
            return Err(4);
        }

        // New campaigns must start with 0 pledged
        if self.total_pledged != 0 {
            debug!("New campaign must have total_pledged = 0");
            return Err(5);
        }

        // New campaigns must be in Active status
        if self.status != CampaignStatus::Active {
            debug!("New campaign must have Active status");
            return Err(6);
        }

        Ok(())
    }
}

/// Validate a finalization (state transition from Active to Success/Failed)
fn validate_finalization(old_data: &[u8], new_data: &[u8], old: &CampaignData, new: &CampaignData) -> Result<(), i8> {
    // Issue 5 fix: enforce deadline via since field (defense in depth)
    // The campaign-lock script also enforces this, but type script check
    // ensures deadline is respected even if lock script changes.
    let since_raw = load_input_since(0, Source::GroupInput)
        .map_err(|_| ERROR_LOAD_SINCE)?;

    if since_raw == 0 {
        debug!("Finalization: since field required (deadline enforcement)");
        return Err(ERROR_INVALID_FINALIZATION);
    }

    let since = Since::new(since_raw);
    if !since.is_absolute() || !since.flags_is_valid() {
        debug!("Finalization: invalid since encoding");
        return Err(ERROR_INVALID_FINALIZATION);
    }

    match since.extract_lock_value() {
        Some(LockValue::BlockNumber(block)) => {
            if block < old.deadline_block {
                debug!("Finalization: since {} < deadline {}", block, old.deadline_block);
                return Err(ERROR_INVALID_FINALIZATION);
            }
        }
        _ => {
            debug!("Finalization: since must be absolute block number");
            return Err(ERROR_INVALID_FINALIZATION);
        }
    }

    // Old campaign must be Active
    if old.status != CampaignStatus::Active {
        debug!("Finalization: old campaign must be Active");
        return Err(ERROR_INVALID_FINALIZATION);
    }

    // Immutable fields must not change
    if old.creator_lock_hash != new.creator_lock_hash {
        debug!("Finalization: creator_lock_hash changed");
        return Err(ERROR_INVALID_FINALIZATION);
    }
    if old.funding_goal != new.funding_goal {
        debug!("Finalization: funding_goal changed");
        return Err(ERROR_INVALID_FINALIZATION);
    }
    if old.deadline_block != new.deadline_block {
        debug!("Finalization: deadline_block changed");
        return Err(ERROR_INVALID_FINALIZATION);
    }
    if old.total_pledged != new.total_pledged {
        debug!("Finalization: total_pledged changed");
        return Err(ERROR_INVALID_FINALIZATION);
    }

    // Issue 6b fix: reserved bytes and metadata must not change
    if old_data.len() >= CampaignData::SIZE && new_data.len() >= CampaignData::SIZE {
        // Check reserved bytes [57..65] are identical
        if old_data[57..65] != new_data[57..65] {
            debug!("Finalization: reserved bytes changed");
            return Err(ERROR_INVALID_FINALIZATION);
        }

        // Check metadata tail (bytes 65+) is identical
        let old_tail = &old_data[CampaignData::SIZE..];
        let new_tail = &new_data[CampaignData::SIZE..];
        if old_tail != new_tail {
            debug!("Finalization: metadata changed");
            return Err(ERROR_INVALID_FINALIZATION);
        }
    }

    // New status must be either Success or Failed (not Active)
    // Note: pledge tracking is done off-chain via separate pledge cells, so we can't
    // enforce total_pledged vs funding_goal on-chain. The lock script ensures only the
    // creator can sign this transition, and the off-chain indexer determines correct status.
    if new.status != CampaignStatus::Success && new.status != CampaignStatus::Failed {
        debug!("Finalization: new status must be Success or Failed");
        return Err(ERROR_INVALID_FINALIZATION);
    }

    Ok(())
}

pub fn program_entry() -> i8 {
    debug!("Campaign Type Script running");

    // CAMP-01: Validate TypeID — first 32 bytes of args
    // On creation: verifies hash matches blake2b(first_input.out_point || output_index)
    // On update/burn: passes (TypeID rules allow transfer and burn)
    if let Err(_) = check_type_id(0, 32) {
        debug!("TypeID validation failed");
        return ERROR_INVALID_TYPE_ID;
    }

    // Load the script
    let script = match load_script() {
        Ok(script) => script,
        Err(_err) => {
            debug!("Failed to load script");
            return ERROR_NO_SCRIPT;
        }
    };

    let _args = script.args().raw_data();
    debug!("Script args length: {}", _args.len());

    // Detect scenario by checking GroupInput and GroupOutput
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
        // Creation: no input, has output
        (false, true) => {
            let data = match load_cell_data(0, Source::GroupOutput) {
                Ok(d) => d,
                Err(_) => return ERROR_LOAD_DATA,
            };
            match CampaignData::from_bytes(&data) {
                Ok(campaign) => {
                    debug!("Campaign creation validation");
                    if let Err(code) = campaign.validate_creation() {
                        return code;
                    }
                    debug!("Campaign creation passed");
                    0
                }
                Err(code) => code,
            }
        }

        // Finalization: has input AND output (state transition)
        (true, true) => {
            let old_data = match load_cell_data(0, Source::GroupInput) {
                Ok(d) => d,
                Err(_) => return ERROR_LOAD_DATA,
            };
            let new_data = match load_cell_data(0, Source::GroupOutput) {
                Ok(d) => d,
                Err(_) => return ERROR_LOAD_DATA,
            };
            let old = match CampaignData::from_bytes(&old_data) {
                Ok(c) => c,
                Err(code) => return code,
            };
            let new_campaign = match CampaignData::from_bytes(&new_data) {
                Ok(c) => c,
                Err(code) => return code,
            };
            if let Err(code) = validate_finalization(&old_data, &new_data, &old, &new_campaign) {
                return code;
            }
            debug!("Campaign finalization passed");
            0
        }

        // Destruction: has input, no output
        // Issue 1 fix: restrict destruction by campaign status
        (true, false) => {
            let data = match load_cell_data(0, Source::GroupInput) {
                Ok(d) => d,
                Err(_) => return ERROR_LOAD_DATA,
            };
            let campaign = match CampaignData::from_bytes(&data) {
                Ok(c) => c,
                Err(code) => return code,
            };

            match campaign.status {
                CampaignStatus::Failed => {
                    // Failed campaigns can be destroyed — refund uses backer_lock_hash
                    // from pledge-lock args, doesn't need campaign cell_dep
                    debug!("Failed campaign destruction allowed");
                    0
                }
                CampaignStatus::Active => {
                    // Active campaigns should not be destroyed
                    debug!("Active campaign destruction blocked");
                    ERROR_DESTRUCTION_NOT_ALLOWED
                }
                CampaignStatus::Success => {
                    // Success campaigns: allow destruction only after grace period
                    // This ensures pledges can still reference the campaign during
                    // normal release operations
                    let since_raw = match load_input_since(0, Source::GroupInput) {
                        Ok(v) => v,
                        Err(_) => return ERROR_LOAD_SINCE,
                    };

                    if since_raw == 0 {
                        debug!("Success campaign destruction blocked — since field required");
                        return ERROR_DESTRUCTION_NOT_ALLOWED;
                    }

                    let since = Since::new(since_raw);
                    if !since.is_absolute() || !since.flags_is_valid() {
                        debug!("Success campaign destruction blocked — invalid since encoding");
                        return ERROR_DESTRUCTION_NOT_ALLOWED;
                    }

                    let grace_deadline = campaign.deadline_block
                        .saturating_add(GRACE_PERIOD_BLOCKS);
                    match since.extract_lock_value() {
                        Some(LockValue::BlockNumber(block)) if block >= grace_deadline => {
                            debug!("Success campaign destruction after grace period allowed");
                            0
                        }
                        _ => {
                            debug!("Success campaign destruction blocked — grace period active");
                            ERROR_DESTRUCTION_NOT_ALLOWED
                        }
                    }
                }
            }
        }

        // No input, no output — shouldn't happen but allow
        (false, false) => {
            debug!("No campaign cells in transaction");
            0
        }
    }
}
