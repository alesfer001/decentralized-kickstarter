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

    #[allow(dead_code)]
    fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut bytes = [0u8; Self::SIZE];
        bytes[0..8].copy_from_slice(&self.pledge_amount.to_le_bytes());
        bytes[8..40].copy_from_slice(&self.backer_lock_hash);
        bytes
    }
}

/// D-11: Receipt must be created in same transaction as a valid pledge cell
/// with matching backer_lock_hash in its lock args.
fn validate_receipt_creation() -> i8 {
    let receipt_data = match load_cell_data(0, Source::GroupOutput) {
        Ok(d) => d,
        Err(_) => return ERROR_LOAD_DATA,
    };
    let receipt = match ReceiptData::from_bytes(&receipt_data) {
        Ok(r) => r,
        Err(code) => return code,
    };

    // Validate pledge_amount > 0
    if receipt.pledge_amount == 0 {
        debug!("Receipt creation: pledge_amount must be > 0");
        return ERROR_ZERO_PLEDGE_AMOUNT;
    }

    // Validate backer_lock_hash is not all zeros
    if receipt.backer_lock_hash == [0u8; 32] {
        debug!("Receipt creation: backer_lock_hash must not be zero");
        return ERROR_ZERO_BACKER_HASH;
    }

    // Search all transaction outputs for a pledge cell whose lock args contain
    // a matching backer_lock_hash at offset [40..72] (pledge lock args layout).
    let mut found_matching_pledge = false;
    for i in 0.. {
        match load_cell_lock(i, Source::Output) {
            Ok(lock_script) => {
                let lock_args = lock_script.args().raw_data();
                // Check if this is a pledge lock (args length >= 72)
                // and backer_lock_hash at [40..72] matches
                if lock_args.len() >= PLEDGE_LOCK_ARGS_SIZE {
                    let mut backer_hash_in_lock = [0u8; 32];
                    backer_hash_in_lock.copy_from_slice(&lock_args[40..72]);
                    if backer_hash_in_lock == receipt.backer_lock_hash {
                        found_matching_pledge = true;
                        break;
                    }
                }
            }
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return ERROR_LOAD_LOCK,
        }
    }

    if !found_matching_pledge {
        debug!("Receipt creation: no matching pledge cell found in outputs");
        return ERROR_NO_MATCHING_PLEDGE;
    }

    0
}

/// D-12: During refund, verify refund amount matches receipt's stored pledge_amount,
/// and output goes to backer_lock_hash from receipt data.
fn validate_receipt_destruction() -> i8 {
    // Load the receipt being destroyed
    let receipt_data = match load_cell_data(0, Source::GroupInput) {
        Ok(d) => d,
        Err(_) => return ERROR_LOAD_DATA,
    };
    let receipt = match ReceiptData::from_bytes(&receipt_data) {
        Ok(r) => r,
        Err(code) => return code,
    };

    // Verify that an output exists going to backer_lock_hash
    // with capacity >= pledge_amount - MAX_FEE
    let min_refund = receipt.pledge_amount
        .checked_sub(MAX_FEE)
        .unwrap_or(0);

    let mut refund_found = false;
    for i in 0.. {
        match load_cell_lock_hash(i, Source::Output) {
            Ok(hash) => {
                if hash == receipt.backer_lock_hash {
                    let cap = match load_cell_capacity(i, Source::Output) {
                        Ok(c) => c,
                        Err(_) => return ERROR_LOAD_CAPACITY,
                    };
                    if cap >= min_refund {
                        refund_found = true;
                        break;
                    }
                }
            }
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return ERROR_LOAD_LOCK_HASH,
        }
    }

    if !refund_found {
        debug!("Receipt destruction: refund output missing or insufficient");
        return ERROR_REFUND_OUTPUT_MISSING;
    }

    0
}

pub fn program_entry() -> i8 {
    debug!("Receipt Type Script running");

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
        // Creation: validate receipt is created alongside a valid pledge
        (false, true) => validate_receipt_creation(),

        // Destruction: validate it's part of a valid refund
        (true, false) => validate_receipt_destruction(),

        // Modification: receipts are immutable (RCPT-02)
        (true, true) => {
            debug!("Receipt modification not allowed");
            ERROR_RECEIPT_MODIFICATION_NOT_ALLOWED
        }

        // No cells — shouldn't happen
        (false, false) => {
            debug!("No receipt cells in transaction");
            0
        }
    }
}
