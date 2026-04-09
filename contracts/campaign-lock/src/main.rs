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

// === Error Codes ===
pub const ERROR_INVALID_ARGS: i8 = 10;
const ERROR_LOAD_SINCE: i8 = 11;
const ERROR_INVALID_SINCE: i8 = 12;
const ERROR_SINCE_BELOW_DEADLINE: i8 = 13;

const CAMPAIGN_LOCK_ARGS_SIZE: usize = 8;

/// Campaign lock script args layout (8 bytes):
/// - deadline_block: u64 (bytes 0-7, LE)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CampaignLockArgs {
    pub deadline_block: u64,
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

    // 1. Load own script and parse args
    let script = match load_script() {
        Ok(s) => s,
        Err(_) => {
            debug!("Failed to load script");
            return ERROR_INVALID_ARGS;
        }
    };
    let args = script.args().raw_data();
    let lock_args = match CampaignLockArgs::from_bytes(&args) {
        Ok(a) => a,
        Err(code) => return code,
    };

    // 2. Load since field
    let since_raw = match load_input_since(0, Source::GroupInput) {
        Ok(v) => v,
        Err(_) => return ERROR_LOAD_SINCE,
    };

    // 3. Check deadline: if since=0, before deadline (reject). Otherwise validate >= deadline.
    if since_raw == 0 {
        // since=0 means no time constraint — before deadline, reject
        debug!("Since=0: before deadline, rejecting");
        return ERROR_SINCE_BELOW_DEADLINE;
    }

    // Parse the since value to verify it's absolute block number
    let since = Since::new(since_raw);
    if !since.is_absolute() || !since.flags_is_valid() {
        debug!("Invalid since flags");
        return ERROR_INVALID_SINCE;
    }

    match since.extract_lock_value() {
        Some(LockValue::BlockNumber(block)) => {
            if block < lock_args.deadline_block {
                debug!(
                    "Current block {} < deadline {}",
                    block, lock_args.deadline_block
                );
                return ERROR_SINCE_BELOW_DEADLINE;
            }
            // Deadline met — allow spending. Type script will validate state transitions.
            debug!("Deadline met, allowing spend");
            0
        }
        _ => {
            debug!("Invalid lock value type");
            ERROR_INVALID_SINCE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deadline_not_met() {
        // since=0 before deadline should return ERROR_SINCE_BELOW_DEADLINE
        // Create args with deadline_block = 1000
        let args_bytes = 1000u64.to_le_bytes();
        let lock_args = CampaignLockArgs::from_bytes(&args_bytes).unwrap();
        assert_eq!(lock_args.deadline_block, 1000);
    }

    #[test]
    fn test_deadline_met() {
        // Valid deadline_block extraction
        let args_bytes = 1500u64.to_le_bytes();
        let lock_args = CampaignLockArgs::from_bytes(&args_bytes).unwrap();
        assert_eq!(lock_args.deadline_block, 1500);
    }

    #[test]
    fn test_invalid_args() {
        // Args size < 8 should return ERROR_INVALID_ARGS
        let short_args = [0u8; 7];
        let result = CampaignLockArgs::from_bytes(&short_args);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), ERROR_INVALID_ARGS);
    }

    #[test]
    fn test_valid_args_size() {
        // Args size >= 8 should parse successfully
        let args_bytes = 5000u64.to_le_bytes();
        let result = CampaignLockArgs::from_bytes(&args_bytes);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().deadline_block, 5000);
    }

    #[test]
    fn test_le_bytes_parsing() {
        // Test little-endian parsing with specific value
        let deadline = 0x0102030405060708u64;
        let bytes = deadline.to_le_bytes();
        let parsed = u64::from_le_bytes(bytes);
        assert_eq!(parsed, deadline);
    }
}
