#!/bin/bash

# Build script for CKB contracts
# This builds both campaign and pledge contracts for RISC-V target

set -e

echo "Building CKB contracts..."

# Set the compiler for RISC-V target
export CC_riscv64imac_unknown_none_elf=riscv64-elf-gcc

# Build Campaign contract
echo "Building Campaign contract..."
cd contracts/campaign
cargo build --release --target riscv64imac-unknown-none-elf
echo "✓ Campaign contract built successfully"

# Build Pledge contract
echo "Building Pledge contract..."
cd ../pledge
cargo build --release --target riscv64imac-unknown-none-elf
echo "✓ Pledge contract built successfully"

cd ../..

echo ""
echo "Build complete!"
echo "Campaign binary: contracts/campaign/target/riscv64imac-unknown-none-elf/release/campaign-contract"
echo "Pledge binary: contracts/pledge/target/riscv64imac-unknown-none-elf/release/pledge"
