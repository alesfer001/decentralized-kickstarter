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
const ERROR_MODIFICATION_NOT_ALLOWED: i8 = 10;

/// Pledge data structure (stored in cell data)
/// Layout (total: 72 bytes):
/// - campaign_id: [u8; 32]        (bytes 0-31) - hash of the campaign cell
/// - backer_lock_hash: [u8; 32]   (bytes 32-63) - who made the pledge
/// - amount: u64                  (bytes 64-71) - pledge amount in CKB
pub struct PledgeData {
    pub campaign_id: [u8; 32],
    pub backer_lock_hash: [u8; 32],
    pub amount: u64,
}

impl PledgeData {
    pub const SIZE: usize = 72;

    /// Parse pledge data from bytes
    pub fn from_bytes(data: &[u8]) -> Result<Self, i8> {
        if data.len() < Self::SIZE {
            debug!("Pledge data too short: {} bytes", data.len());
            return Err(1);
        }

        let mut campaign_id = [0u8; 32];
        campaign_id.copy_from_slice(&data[0..32]);

        let mut backer_lock_hash = [0u8; 32];
        backer_lock_hash.copy_from_slice(&data[32..64]);

        let amount = u64::from_le_bytes(data[64..72].try_into().unwrap());

        Ok(PledgeData {
            campaign_id,
            backer_lock_hash,
            amount,
        })
    }

    /// Convert pledge data to bytes
    pub fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut bytes = [0u8; Self::SIZE];
        bytes[0..32].copy_from_slice(&self.campaign_id);
        bytes[32..64].copy_from_slice(&self.backer_lock_hash);
        bytes[64..72].copy_from_slice(&self.amount.to_le_bytes());
        bytes
    }

    /// Validate pledge creation
    pub fn validate_creation(&self) -> Result<(), i8> {
        // Campaign ID must not be all zeros
        if self.campaign_id == [0u8; 32] {
            debug!("Invalid campaign ID: cannot be zero");
            return Err(3);
        }

        // Backer lock hash must not be all zeros
        if self.backer_lock_hash == [0u8; 32] {
            debug!("Invalid backer lock hash: cannot be zero");
            return Err(4);
        }

        // Pledge amount must be greater than 0
        if self.amount == 0 {
            debug!("Invalid pledge amount: must be > 0");
            return Err(5);
        }

        Ok(())
    }
}

pub fn program_entry() -> i8 {
    debug!("Pledge Type Script running");

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
            match PledgeData::from_bytes(&data) {
                Ok(pledge) => {
                    debug!("Pledge creation validation");
                    if let Err(code) = pledge.validate_creation() {
                        return code;
                    }
                    debug!("Pledge creation passed");
                    0
                }
                Err(code) => code,
            }
        }

        // Destruction: has input, no output — allow (lock script guards spending)
        (true, false) => {
            debug!("Pledge destruction allowed");
            0
        }

        // Modification: has input AND output — reject (pledges are immutable)
        (true, true) => {
            debug!("Pledge modification not allowed");
            ERROR_MODIFICATION_NOT_ALLOWED
        }

        // No input, no output — shouldn't happen but allow
        (false, false) => {
            debug!("No pledge cells in transaction");
            0
        }
    }
}
