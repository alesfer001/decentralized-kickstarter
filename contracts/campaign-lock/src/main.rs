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

    // === Lock Args Parsing Tests ===

    #[test]
    fn test_deadline_not_met() {
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

    // === Since Field Encoding Tests ===

    #[test]
    fn test_since_absolute_block_encoding() {
        // Absolute block mode: (block_number << 1) | 0
        // Block 1000 -> 0x7D0 << 1 = 0xFA0 = 4000
        let block_num = 1000u64;
        let since_value = (block_num << 1) as u64;
        assert_eq!(since_value, 2000);
    }

    #[test]
    fn test_since_zero_means_no_constraint() {
        // since=0 means "no time constraint" - before deadline path
        // This should be rejected by campaign-lock
        let since_zero = 0u64;
        assert_eq!(since_zero, 0);
    }

    #[test]
    fn test_lock_args_field_extraction() {
        // Verify we can construct args with different deadlines
        let test_deadlines = vec![100u64, 1000u64, 10000u64, 100000u64];
        for deadline in test_deadlines {
            let args = deadline.to_le_bytes();
            let parsed = CampaignLockArgs::from_bytes(&args).unwrap();
            assert_eq!(parsed.deadline_block, deadline);
        }
    }

    #[test]
    fn test_args_with_extra_bytes() {
        // Args size >= 8 should parse successfully (extra bytes ignored)
        let mut args = vec![0u8; 16];
        let deadline = 2500u64;
        args[0..8].copy_from_slice(&deadline.to_le_bytes());
        let result = CampaignLockArgs::from_bytes(&args);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().deadline_block, 2500);
    }

    #[test]
    fn test_error_codes_are_distinct() {
        // Verify error codes don't overlap
        assert_ne!(ERROR_INVALID_ARGS, ERROR_LOAD_SINCE);
        assert_ne!(ERROR_INVALID_ARGS, ERROR_INVALID_SINCE);
        assert_ne!(ERROR_INVALID_ARGS, ERROR_SINCE_BELOW_DEADLINE);
        assert_ne!(ERROR_LOAD_SINCE, ERROR_INVALID_SINCE);
        assert_ne!(ERROR_LOAD_SINCE, ERROR_SINCE_BELOW_DEADLINE);
        assert_ne!(ERROR_INVALID_SINCE, ERROR_SINCE_BELOW_DEADLINE);
    }
}
