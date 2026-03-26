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
        load_cell_lock,
        load_cell_lock_hash,
        load_cell_capacity,
    },
    ckb_constants::Source,
    error::SysError,
};

// === Error Codes ===
const ERROR_LOAD_DATA: i8 = 9;
const ERROR_INVALID_RECEIPT_DATA: i8 = 10;
const ERROR_RECEIPT_MODIFICATION_NOT_ALLOWED: i8 = 11;
const ERROR_ZERO_PLEDGE_AMOUNT: i8 = 12;
const ERROR_ZERO_BACKER_HASH: i8 = 13;
const ERROR_NO_MATCHING_PLEDGE: i8 = 14;
const ERROR_REFUND_OUTPUT_MISSING: i8 = 15;
const ERROR_LOAD_LOCK: i8 = 16;
const ERROR_LOAD_CAPACITY: i8 = 17;
const ERROR_LOAD_LOCK_HASH: i8 = 18;

/// Maximum fee deducted during refund (1 CKB = 100M shannons)
const MAX_FEE: u64 = 100_000_000;

/// Size of pledge lock args (used to identify pledge cells in outputs)
const PLEDGE_LOCK_ARGS_SIZE: usize = 72;

/// Receipt data layout (40 bytes):
/// - pledge_amount: u64     (bytes 0-7, LE)
/// - backer_lock_hash: [u8; 32]  (bytes 8-39)
struct ReceiptData {
    pledge_amount: u64,
    backer_lock_hash: [u8; 32],
}

impl ReceiptData {
    const SIZE: usize = 40;

    fn from_bytes(data: &[u8]) -> Result<Self, i8> {
        if data.len() < Self::SIZE {
            return Err(ERROR_INVALID_RECEIPT_DATA);
        }
        let pledge_amount = u64::from_le_bytes(data[0..8].try_into().unwrap());
        let mut backer_lock_hash = [0u8; 32];
        backer_lock_hash.copy_from_slice(&data[8..40]);
        Ok(ReceiptData { pledge_amount, backer_lock_hash })
    }

    fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut bytes = [0u8; Self::SIZE];
        bytes[0..8].copy_from_slice(&self.pledge_amount.to_le_bytes());
        bytes[8..40].copy_from_slice(&self.backer_lock_hash);
        bytes
    }
}

pub fn program_entry() -> i8 {
    0
}
