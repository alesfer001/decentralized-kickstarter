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
    high_level::{load_script, load_cell_data},
    ckb_constants::Source,
    error::SysError,
};

/// Error codes
const ERROR_NO_SCRIPT: i8 = 7;
const ERROR_LOAD_DATA: i8 = 9;
const ERROR_INVALID_FINALIZATION: i8 = 10;
#[allow(dead_code)]
const ERROR_MODIFICATION_NOT_ALLOWED: i8 = 11;

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
fn validate_finalization(old: &CampaignData, new: &CampaignData) -> Result<(), i8> {
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
            if let Err(code) = validate_finalization(&old, &new_campaign) {
                return code;
            }
            debug!("Campaign finalization passed");
            0
        }

        // Destruction: has input, no output — allow (lock script guards spending)
        (true, false) => {
            debug!("Campaign destruction allowed");
            0
        }

        // No input, no output — shouldn't happen but allow
        (false, false) => {
            debug!("No campaign cells in transaction");
            0
        }
    }
}
