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
    high_level::{load_script, load_cell_data, load_cell_type},
    ckb_constants::Source,
    error::SysError,
};

/// Error codes
const ERROR_NO_SCRIPT: i8 = 7;
const ERROR_LOAD_DATA: i8 = 9;
const ERROR_MODIFICATION_NOT_ALLOWED: i8 = 10;
const ERROR_MERGE_DIFFERENT_CAMPAIGNS: i8 = 11;
const ERROR_MERGE_AMOUNT_MISMATCH: i8 = 12;
const ERROR_OVERFLOW: i8 = 13;
const ERROR_CAMPAIGN_MISMATCH: i8 = 14;
const ERROR_PARTIAL_REFUND_INVALID: i8 = 15;
const ERROR_REFUND_AMOUNT_MISMATCH: i8 = 16;
const ERROR_NO_RECEIPT_IN_INPUTS: i8 = 17;

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

/// Count cells matching the current type script in the given source.
fn count_group_cells(source: Source) -> usize {
    let mut count = 0;
    for i in 0.. {
        match load_cell_data(i, source) {
            Ok(_) => count += 1,
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => break,
        }
    }
    count
}

/// D-13: Merge N pledge cells into 1 output.
/// All inputs must reference the same campaign. Output amount must equal sum of input amounts.
fn validate_merge_pledge() -> i8 {
    // Load first input to get reference campaign_id
    let first_data = match load_cell_data(0, Source::GroupInput) {
        Ok(d) => d,
        Err(_) => return ERROR_LOAD_DATA,
    };
    let first_pledge = match PledgeData::from_bytes(&first_data) {
        Ok(p) => p,
        Err(code) => return code,
    };

    // Sum all input amounts and verify same campaign_id
    let mut total_amount: u64 = 0;
    for i in 0.. {
        match load_cell_data(i, Source::GroupInput) {
            Ok(data) => {
                let pledge = match PledgeData::from_bytes(&data) {
                    Ok(p) => p,
                    Err(code) => return code,
                };
                if pledge.campaign_id != first_pledge.campaign_id {
                    debug!("Merge: input {} has different campaign_id", i);
                    return ERROR_MERGE_DIFFERENT_CAMPAIGNS;
                }
                total_amount = match total_amount.checked_add(pledge.amount) {
                    Some(v) => v,
                    None => return ERROR_OVERFLOW,
                };
            }
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return ERROR_LOAD_DATA,
        }
    }

    // Verify output pledge data
    let output_data = match load_cell_data(0, Source::GroupOutput) {
        Ok(d) => d,
        Err(_) => return ERROR_LOAD_DATA,
    };
    let output_pledge = match PledgeData::from_bytes(&output_data) {
        Ok(p) => p,
        Err(code) => return code,
    };

    // Output must reference same campaign
    if output_pledge.campaign_id != first_pledge.campaign_id {
        debug!("Merge: output has different campaign_id");
        return ERROR_MERGE_DIFFERENT_CAMPAIGNS;
    }

    // Output amount must equal sum of input amounts
    if output_pledge.amount != total_amount {
        debug!("Merge: output amount {} != input total {}", output_pledge.amount, total_amount);
        return ERROR_MERGE_AMOUNT_MISMATCH;
    }

    0
}

/// D-14: Partial refund from merged cell.
/// 1 input -> 1 reduced output (capacity difference matches receipt being destroyed).
/// Cross-checks that the amount difference equals the destroyed receipt's pledge_amount.
fn validate_partial_refund(receipt_type_hash: Option<&[u8; 32]>) -> i8 {
    let input_data = match load_cell_data(0, Source::GroupInput) {
        Ok(d) => d,
        Err(_) => return ERROR_LOAD_DATA,
    };
    let input_pledge = match PledgeData::from_bytes(&input_data) {
        Ok(p) => p,
        Err(code) => return code,
    };

    let output_data = match load_cell_data(0, Source::GroupOutput) {
        Ok(d) => d,
        Err(_) => return ERROR_LOAD_DATA,
    };
    let output_pledge = match PledgeData::from_bytes(&output_data) {
        Ok(p) => p,
        Err(code) => return code,
    };

    // Must reference same campaign
    if input_pledge.campaign_id != output_pledge.campaign_id {
        debug!("Partial refund: campaign_id mismatch");
        return ERROR_CAMPAIGN_MISMATCH;
    }

    // Output amount must be less than input amount (some was refunded)
    if output_pledge.amount >= input_pledge.amount {
        debug!("Partial refund: output amount must be less than input amount");
        return ERROR_PARTIAL_REFUND_INVALID;
    }

    let amount_difference = match input_pledge.amount.checked_sub(output_pledge.amount) {
        Some(diff) => diff,
        None => {
            debug!("Partial refund: amount difference underflow");
            return ERROR_OVERFLOW;
        }
    };

    // Cross-check with destroyed receipt (by code_hash, not full type script hash)
    if let Some(receipt_code_hash) = receipt_type_hash {
        let mut found_receipt = false;
        for i in 0.. {
            match load_cell_type(i, Source::Input) {
                Ok(Some(type_script)) => {
                    let code_hash = type_script.code_hash().raw_data();
                    if code_hash.as_ref() == receipt_code_hash {
                        // Found destroyed receipt — read its data
                        let receipt_data = match load_cell_data(i, Source::Input) {
                            Ok(d) => d,
                            Err(_) => return ERROR_LOAD_DATA,
                        };
                        if receipt_data.len() < 8 {
                            continue;
                        }
                        let receipt_amount = u64::from_le_bytes(
                            receipt_data[0..8].try_into().unwrap()
                        );

                        // Amount difference must equal receipt amount
                        if amount_difference != receipt_amount {
                            debug!("Partial refund: diff {} != receipt {}",
                                   amount_difference, receipt_amount);
                            return ERROR_REFUND_AMOUNT_MISMATCH;
                        }
                        found_receipt = true;
                        break;
                    }
                }
                Ok(None) => continue,
                Err(SysError::IndexOutOfBound) => break,
                Err(_) => return ERROR_LOAD_DATA,
            }
        }

        if !found_receipt {
            debug!("Partial refund: no receipt found in inputs");
            return ERROR_NO_RECEIPT_IN_INPUTS;
        }
    }
    // If no receipt_type_hash in args (legacy), skip cross-check
    // This provides backward compatibility for the transition period

    0
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

    let args = script.args().raw_data();
    debug!("Script args length: {}", args.len());

    // Parse receipt type script hash from args (first 32 bytes)
    let receipt_type_hash: Option<[u8; 32]> = if args.len() >= 32 {
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&args[0..32]);
        Some(hash)
    } else {
        None
    };

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

        // Modification: has input AND output — check if merge or partial refund
        (true, true) => {
            let input_count = count_group_cells(Source::GroupInput);
            let output_count = count_group_cells(Source::GroupOutput);

            if input_count >= 2 && output_count == 1 {
                // MERGE: N inputs -> 1 output (D-13 / MERGE-02)
                debug!("Pledge merge: {} inputs -> 1 output", input_count);
                validate_merge_pledge()
            } else if input_count == 1 && output_count == 1 {
                // PARTIAL REFUND from merged cell (D-14 / MERGE-02)
                debug!("Pledge partial refund: 1 input -> 1 reduced output");
                validate_partial_refund(receipt_type_hash.as_ref())
            } else {
                debug!("Invalid pledge modification pattern: {} inputs -> {} outputs", input_count, output_count);
                ERROR_MODIFICATION_NOT_ALLOWED
            }
        }

        // No input, no output — shouldn't happen but allow
        (false, false) => {
            debug!("No pledge cells in transaction");
            0
        }
    }
}
