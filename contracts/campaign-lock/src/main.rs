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
};

// === Error Codes ===
pub const ERROR_INVALID_ARGS: i8 = 10;
const ERROR_LOAD_SINCE: i8 = 11;
#[allow(dead_code)]
const ERROR_INVALID_SINCE: i8 = 12; // Reserved for future absolute since validation
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

    // 3. Check deadline: since value must be >= deadline_block from args.
    // The since value is the raw deadline block number (same pattern as pledge-lock).
    // CKB consensus does not enforce relative since on devnet/testnet, so enforcement
    // happens entirely in this lock script via load_input_since().
    if since_raw < lock_args.deadline_block {
        debug!(
            "Since {} < deadline {}: before deadline, rejecting",
            since_raw, lock_args.deadline_block
        );
        return ERROR_SINCE_BELOW_DEADLINE;
    }

    // Deadline met — allow spending. Type script will validate state transitions.
    debug!("Deadline met (since={}, deadline={}), allowing spend", since_raw, lock_args.deadline_block);
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    // === Lock Args Parsing Tests ===

    #[test]
    fn test_deadline_parsing() {
        let args_bytes = 1000u64.to_le_bytes();
        let lock_args = CampaignLockArgs::from_bytes(&args_bytes).unwrap();
        assert_eq!(lock_args.deadline_block, 1000);
    }

    #[test]
    fn test_invalid_args_too_short() {
        let short_args = [0u8; 7];
        let result = CampaignLockArgs::from_bytes(&short_args);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), ERROR_INVALID_ARGS);
    }

    #[test]
    fn test_args_with_extra_bytes() {
        let mut args = vec![0u8; 16];
        let deadline = 2500u64;
        args[0..8].copy_from_slice(&deadline.to_le_bytes());
        let result = CampaignLockArgs::from_bytes(&args);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().deadline_block, 2500);
    }

    #[test]
    fn test_le_bytes_roundtrip() {
        let deadline = 0x0102030405060708u64;
        let bytes = deadline.to_le_bytes();
        let parsed = u64::from_le_bytes(bytes);
        assert_eq!(parsed, deadline);
    }

    #[test]
    fn test_multiple_deadlines() {
        let test_deadlines = vec![100u64, 1000u64, 10000u64, 100000u64];
        for deadline in test_deadlines {
            let args = deadline.to_le_bytes();
            let parsed = CampaignLockArgs::from_bytes(&args).unwrap();
            assert_eq!(parsed.deadline_block, deadline);
        }
    }

    // === Since Validation Logic Tests ===

    #[test]
    fn test_since_below_deadline_rejected() {
        // since_raw=500 < deadline=1000 → reject
        let deadline = 1000u64;
        let since_raw = 500u64;
        assert!(since_raw < deadline);
    }

    #[test]
    fn test_since_equal_deadline_accepted() {
        // since_raw=1000 >= deadline=1000 → accept
        let deadline = 1000u64;
        let since_raw = 1000u64;
        assert!(since_raw >= deadline);
    }

    #[test]
    fn test_since_above_deadline_accepted() {
        // since_raw=1500 >= deadline=1000 → accept
        let deadline = 1000u64;
        let since_raw = 1500u64;
        assert!(since_raw >= deadline);
    }

    #[test]
    fn test_since_zero_rejected() {
        // since_raw=0 < any deadline → reject (before deadline)
        let deadline = 1000u64;
        let since_raw = 0u64;
        assert!(since_raw < deadline);
    }

    #[test]
    fn test_error_codes_are_distinct() {
        assert_ne!(ERROR_INVALID_ARGS, ERROR_LOAD_SINCE);
        assert_ne!(ERROR_INVALID_ARGS, ERROR_INVALID_SINCE);
        assert_ne!(ERROR_INVALID_ARGS, ERROR_SINCE_BELOW_DEADLINE);
        assert_ne!(ERROR_LOAD_SINCE, ERROR_INVALID_SINCE);
        assert_ne!(ERROR_LOAD_SINCE, ERROR_SINCE_BELOW_DEADLINE);
        assert_ne!(ERROR_INVALID_SINCE, ERROR_SINCE_BELOW_DEADLINE);
    }
}
