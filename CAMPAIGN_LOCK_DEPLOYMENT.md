# Campaign-Lock Contract Deployment Guide

## Status

The campaign-lock contract has been integrated into the transaction builder and deployment script. The contract source code is ready in `contracts/campaign-lock/src/main.rs`.

## Prerequisites for Compilation

To compile the campaign-lock contract to RISC-V binary, you need:

1. **Rust toolchain** with riscv64 target
   ```bash
   rustup target add riscv64imac-unknown-none-elf
   ```

2. **RISC-V GNU toolchain** (riscv64-unknown-elf-gcc)
   - macOS (homebrew): `brew install riscv-tools`
   - Linux: `apt-get install gcc-riscv64-unknown-elf`
   - Or use the official CKB build docker image

## Compilation Steps

After installing the RISC-V toolchain:

```bash
# Compile campaign-lock contract
cd contracts/campaign-lock
cargo build --target riscv64imac-unknown-none-elf --release

# Output binary location:
# contracts/campaign-lock/target/riscv64imac-unknown-none-elf/release/campaign-lock
```

## Deployment

After compilation, deploy to devnet:

```bash
cd off-chain/transaction-builder

# Deploy to devnet (uses default testnet account #0)
npx ts-node deploy-contracts.ts

# Or specify custom deployer
DEPLOYER_PRIVATE_KEY=0x... npx ts-node deploy-contracts.ts
```

The script will:
1. Compile all contracts (campaign, campaign-lock, pledge, pledge-lock, receipt)
2. Deploy each to devnet
3. Save deployment config to `deployment/deployed-contracts-devnet.json`
4. Output environment variables needed for frontend and indexer

## Contract Integration

The campaign-lock contract is now integrated into:

- **TransactionBuilder** (`off-chain/transaction-builder/src/builder.ts`):
  - Added `campaignLockContract` field
  - Added `getCampaignLockContract()` accessor method
  - Constructor signature updated to accept campaignLockContract parameter

- **Deployment Config** (`deployment/deployed-contracts-devnet.json`):
  - Placeholder entry for campaignLock (code hash, tx hash, index)
  - Will be updated with actual values when deployed

- **Deploy Script** (`off-chain/transaction-builder/deploy-contracts.ts`):
  - Campaign-lock deployment step added
  - Outputs all required env vars for frontend and indexer

## What campaign-lock Does

The campaign-lock contract is a **lock script** that enforces:
- Pledges can only be spent **after deadline** (via `since` field)
- Before deadline: no spending allowed (ERROR_SINCE_BELOW_DEADLINE)
- After deadline: spending allowed, type scripts will validate state transitions

This enables **permissionless fund distribution**:
- Anyone (bot or user) can trigger release (on success) or refund (on failure)
- Lock script enforces deadline compliance
- Type scripts (pledge, receipt) validate routing logic

## Future Plans

After campaign-lock is deployed:
- Plan 05-03: Update transaction builder to use campaign-lock for campaigns
- Plan 05-04: Implement permissionless release/refund flows
- Plan 05-05: Update frontend to support trustless distribution
