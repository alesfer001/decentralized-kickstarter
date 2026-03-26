# Stack Research — CKB Trustless Fund Distribution (v1.1)

## Recommended Stack

### On-Chain Contracts
- **Language:** Rust (edition 2021) — consistent with existing campaign/pledge type scripts
- **Framework:** `ckb-std` v1.0 — provides `high_level` APIs for cell access, script loading, since validation
- **Target:** RISC-V (`riscv64imac-unknown-none-elf`) — CKB VM native target
- **Build:** `cargo build --target riscv64imac-unknown-none-elf --release`
- **Key APIs for lock script:**
  - `high_level::load_cell_data(index, Source::CellDep)` — read campaign cell data from cell_deps
  - `high_level::load_cell_type_hash(index, source)` — verify cell identity via type script hash
  - `high_level::load_cell_lock_hash(index, source)` — check lock script identity
  - `high_level::load_cell_capacity(index, source)` — verify capacity routing
  - `high_level::load_input_since(index, source)` — read since field for deadline enforcement
  - `ckb_std::since::Since` — parse since values (absolute/relative, epoch/block/timestamp)

### Off-Chain (Transaction Builder)
- **SDK:** `@ckb-ccc/core` v1.12.2 — already in use, supports custom lock scripts
- **Key patterns:** `ccc.Transaction.from({...})` for building transactions with custom lock/type scripts

### Confidence Levels
| Component | Confidence | Notes |
|-----------|-----------|-------|
| ckb-std 1.0 for lock script | **High** | Same as existing contracts, well-documented |
| Since field for deadline | **High** | CKB native feature, joii2020 validates the pattern |
| CCC SDK for custom locks | **High** | Already used for type scripts, same pattern applies |
| Receipt cell as type script | **Medium** | Pattern validated by joii2020, our implementation differs slightly |

## Lock Script Development

### What a Lock Script Must Do
A CKB lock script runs when a cell is **consumed** (spent). It decides whether the spending transaction is authorized. For our pledge lock:

1. **Parse args** — extract campaign type script hash, deadline, backer lock hash
2. **Check since** — enforce deadline (before deadline = locked, after deadline = spendable)
3. **Read campaign cell from cell_deps** — load campaign data to check status
4. **Route based on status:**
   - Campaign Success → verify output sends capacity to creator lock hash
   - Campaign Failed → verify output sends capacity to backer lock hash (from args or receipt)
   - Campaign Active → reject (locked until deadline)

### Lock Script Args Layout (proposed)
```
campaign_type_script_hash: [u8; 32]  — identifies which campaign
deadline: u64                         — block number (for since validation)
backer_lock_hash: [u8; 32]           — where refunds go
```

## Testing Tools

### ckb-std Native Simulator
- Feature flag `native-simulator` already configured in existing Cargo.toml
- Allows running contract logic as native code for unit tests
- Use `#[cfg(test)]` blocks for standard Rust unit tests

### ckb-testtool / Capsule
- Full transaction simulation against a mock chain
- Validates complete transaction structure including cell_deps
- Recommended for integration testing of lock + type script interaction

### Manual Testing
- Deploy to devnet, build transactions via CCC SDK
- Existing `test-*.ts` scripts can be extended for new operations

## SDK Integration

### Building Transactions with Custom Lock Scripts
```typescript
// Pledge cell with custom lock
const pledgeLock = {
  codeHash: PLEDGE_LOCK_CODE_HASH,
  hashType: "type",
  args: encodePledgeLockArgs(campaignTypeScriptHash, deadline, backerLockHash)
};

// Transaction: pledge creation
const tx = ccc.Transaction.from({
  outputs: [
    { lock: pledgeLock, type: pledgeTypeScript, capacity: pledgeAmount },
    { lock: backerLock, type: receiptTypeScript }  // receipt cell
  ],
  outputsData: [pledgeCellData, receiptCellData],
  cellDeps: [campaignCellDep, pledgeLockDep, receiptTypeDep]
});
```

### Since Field in CCC
```typescript
// Set since on input to enforce deadline
tx.inputs[0].since = absoluteBlockSince(deadlineBlock);
```
