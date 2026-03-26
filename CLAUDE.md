<!-- GSD:project-start source:PROJECT.md -->
## Project

**CKB Kickstarter v1.1 — Trustless Automatic Fund Distribution**

A decentralized all-or-nothing crowdfunding platform on Nervos CKB. v1.0 (testnet MVP) handles the full campaign lifecycle but requires backers to manually cooperate for fund release/refund. v1.1 replaces manual cooperation with on-chain enforced, permissionless fund distribution — making the platform truly trustless.

**Core Value:** Backers' funds are automatically routed to the correct destination (creator on success, backer on failure) without anyone's cooperation — enforced entirely by on-chain scripts.

### Constraints

- **Tech stack**: Rust + ckb-std for on-chain contracts, TypeScript + CCC SDK for off-chain. Must maintain consistency with v1.0.
- **CKB cell model**: Lock scripts control spending, type scripts validate state. Custom lock script must work within CKB's UTXO-like model.
- **Transaction size**: CKB has max transaction size limits. Pledge merging addresses this but adds complexity.
- **Backward compatibility**: v1.1 deploys new contracts. Existing v1.0 campaigns/pledges on testnet won't be migrated — clean deployment.
- **Budget**: Free tier infrastructure (Render indexer, Vercel frontend). No paid services.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages & Runtime
- **Rust** - Smart contracts (blockchain layer)
- **TypeScript** - Off-chain services and frontend
- **Node.js** - Runtime environment
## Frontend Stack
### Framework & Build
- **Next.js** - ^16.0.7
- **React** - 19.2.0
### Styling & CSS
- **Tailwind CSS** - ^4
- **Styled-JSX** - (transitive dependency via Next.js)
### Build Tools
- **TypeScript** - ^5
- **ESLint** - ^9
### Package Manager
- **npm** - (indicated by package-lock.json)
## Backend/Indexer Stack
### Runtime & Framework
- **Express** - ^5.2.1
- **Node.js** - Runtime
### Database
- **SQLite** - (via better-sqlite3)
### Development Tools
- **TypeScript** - ^5.9.3
- **ts-node** - ^10.9.2
- **Type Definitions**
### Package Manager
- npm (via package-lock.json)
## Transaction Builder Stack
### Framework
- **CCC Core** - ^1.12.2
### Development Tools
- **TypeScript** - ^5.9.3
- **ts-node** - ^10.9.2
- **Type Definitions**
### Build Tool
- **tsc** - TypeScript Compiler
### Package Manager
- npm (via package-lock.json)
## Smart Contract Stack
### Blockchain Framework
- **ckb-std** - 1.0
### Build System
- **Cargo** - Rust package manager
### Features
- `library` - Enables library compilation
- `native-simulator` - Enables native testing/simulation with ckb-std
### Contracts
- **Campaign Contract**
- **Pledge Contract**
## Blockchain Integration
### CKB Integration
- **@ckb-ccc/core** - ^1.12.2
- **@ckb-ccc/connector-react** - ^1.0.30
### Contract Deployment
- Network: testnet (current deployment)
- Campaign Contract:
- Pledge Contract:
## Configuration Files
### Frontend Configuration
- **Environment**: `off-chain/frontend/.env.example`
- **Next.js Config**: `off-chain/frontend/next.config.ts`
- **TypeScript Config**: `off-chain/frontend/tsconfig.json`
- **PostCSS Config**: `off-chain/frontend/postcss.config.mjs`
- **ESLint Config**: `off-chain/frontend/eslint.config.mjs`
### Indexer Configuration
- **Environment**: `off-chain/indexer/.env.example`
- **TypeScript Config**: `off-chain/indexer/tsconfig.json`
### Transaction Builder Configuration
- **TypeScript Config**: `off-chain/transaction-builder/tsconfig.json`
## Dependency Tree Summary
### Frontend Dependencies (production)
### Frontend DevDependencies
### Indexer Dependencies (production)
### Indexer DevDependencies
### Transaction Builder Dependencies (production)
### Transaction Builder DevDependencies
## Data Size Configuration
- Campaign cell data: 65 bytes (header) + metadata
- Pledge cell data: 72 bytes
- Metadata includes optional title and description stored in cell data
## Build & Run Commands
### Frontend
### Indexer
### Transaction Builder
### Smart Contracts
## Deployment Info
- **Testnet Deployment Date**: 2026-03-18T17:43:07.396Z
- **Deployment Configuration**: `/Users/ayoublesfer/Documents/Dev/decentralized-kickstarter/deployment/deployed-contracts-testnet.json`
- **Frontend Hosting**: Vercel (indicated by `.env.vercel` file)
- **Backend Hosting**: Render (indicated in project documentation)
## Notes
- All off-chain code uses strict TypeScript mode
- Devnet includes hardcoded test accounts with pre-funded CKB (42,000,000 CKB each)
- Network selection is environment-driven (env var `NEXT_PUBLIC_NETWORK`)
- SQLite is used for indexing persistence with background polling from CKB RPC
- CCC SDK provides wallet integration via ConnectorReact provider pattern
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Overview
## TypeScript/JavaScript Conventions
### TypeScript Configuration
- **Strict Mode**: Enabled across all TypeScript projects (`"strict": true`)
- **Target**: ES2020
- **Module System**:
- **Module Resolution**: Node for backend, bundler for frontend
- **Additional Settings**:
- `off-chain/frontend/tsconfig.json` (Next.js + JSX)
- `off-chain/indexer/tsconfig.json`
- `off-chain/transaction-builder/tsconfig.json`
### Import Organization
- `off-chain/frontend/src/components/CampaignCard.tsx`: Demonstrates import grouping with "use client" directive at top
- `off-chain/indexer/src/indexer.ts`: Organized external then internal imports
### Naming Conventions
#### Files
- **Components**: PascalCase (`CampaignCard.tsx`, `Header.tsx`, `Toast.tsx`)
- **Utilities**: camelCase (`utils.ts`, `types.ts`, `api.ts`, `serialization.ts`)
- **Pages**: PascalCase with Next.js conventions (`page.tsx`)
- **Test files**: Not present in current structure (see TESTING.md)
#### Variables & Functions
- **Functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE for module-level constants
- **Interfaces**: PascalCase, descriptive names
- **Enums**: PascalCase
#### Database Tables
- snake_case for all identifiers
- Example: `creator_lock_hash`, `total_pledged`, `output_index`
### Type Definitions
- Use `interface` for object structures (preferred over `type`)
- Use `enum` for status values and fixed sets of values
- Export types from dedicated `types.ts` files
- Document complex types with JSDoc comments
- `off-chain/frontend/src/lib/types.ts`: Campaign, Pledge, form types with JSDoc
- `off-chain/indexer/src/types.ts`: Database and parsing types
- `off-chain/transaction-builder/src/types.ts`: Contract and transaction types
### Component Patterns (React/Next.js)
#### Client Components
- Use `"use client"` directive for interactive components
- Example: `CampaignCard.tsx`, `Header.tsx` (uses hooks)
#### Functional Components
- All components are functional (no class components)
- Props passed via destructuring in function signature
- Example: `function CampaignCard({ campaign, currentBlock, backerCount }: CampaignCardProps)`
#### Hooks Usage
- Standard React hooks: `useState`, `useEffect`, `useCallback`
- Custom context hook: `useDevnet()` for network state
- CCC wallet integration: `ccc.useCcc()`, `ccc.useSigner()`
#### Props Pattern
- Define interface for each component's props
- Suffix with `Props` (e.g., `CampaignCardProps`)
### Error Handling
#### TypeScript Patterns
- Use try-catch for async operations
- Check response status before accessing data:
- Generic catch blocks (no explicit error type) as per Node.js best practices
- Example: `catch (error)` or `catch { ... }` (ignore error)
#### In Components
- Use try-catch in useEffect and event handlers
- Gracefully handle null/undefined states
- Example (Header.tsx):
### API & Utility Functions
#### Patterns
- Export named functions (no default exports in utility files)
- Add JSDoc comments for public functions
- Include error context in thrown errors
- Example (api.ts):
#### Documentation
- JSDoc comments for all exported functions and types
- Include parameters and return types
- Example comments in `off-chain/frontend/src/lib/api.ts`
### BigInt Usage
- Use `BigInt()` constructor for large numbers (CKB amounts)
- Convert strings to BigInt: `BigInt(campaignValue)`
- Use `bigint` type in TypeScript
- Examples:
## Rust Conventions
### Code Organization
- `contracts/campaign/src/main.rs` - Campaign contract entry point
- `contracts/campaign/src/lib.rs` - Campaign library exports
- `contracts/pledge/src/main.rs` - Pledge contract entry point
- `contracts/pledge/src/lib.rs` - Pledge library exports
### Attributes & Configuration
#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]
- Use conditional `extern crate alloc` for library/test mode
- Use `ckb_std::entry!(program_entry)` for main execution
- Default allocator: `ckb_std::default_alloc!(16384, 1258306, 64)`
### Data Structures
#### Enums
- Use `#[repr(u8)]` for serializable enums
- Include `Debug`, `Clone`, `Copy`, `PartialEq`, `Eq` derives
- Example:
#### Structs
- Use public fields for simple data containers
- Include `SIZE` constant for fixed-size structs
- Implement `from_bytes()` and `to_bytes()` methods
- Example (CampaignData):
### Byte Serialization
#### Patterns
- Little-endian byte order: `u64::from_le_bytes()`, `.to_le_bytes()`
- Fixed-size arrays for known-length fields: `[u8; 32]` for hashes
- Document byte layout in struct comments
- Example (from main.rs files):
### Error Handling
#### Return Types
- Use `Result<T, i8>` for operations that can fail
- Return error codes as `i8` (negative or specific integer)
- Document error codes as constants
#### Error Codes
- Define as module-level constants (UPPER_SNAKE_CASE with `ERROR_` prefix)
- Include descriptive comment
- Example:
#### Debug Output
- Use `debug!()` macro for logging
- Include context in debug messages
- Example:
### Function Signatures
#### Validation Methods
- Named `validate_*()` for validation functions
- Return `Result<(), i8>` for error codes
- Example:
#### Conversion Methods
- Named `from_bytes()` and `to_bytes()` for serialization
- `from_bytes()` returns `Result<Self, i8>`
- `to_bytes()` returns fixed-size array
### Comments & Documentation
#### Block Comments
- Use `///` for doc comments (public items)
- Use `//` for inline comments
- Document byte layouts above struct definitions
- Example:
## Cross-Language Type Mapping
| Entity | TypeScript | Rust |
|--------|-----------|------|
| Campaign | `Campaign` interface | `CampaignData` struct + `SIZE=65` |
| Pledge | `Pledge` interface | `PledgeData` struct + `SIZE=72` |
| Status | `CampaignStatus` enum | `CampaignStatus` enum with `#[repr(u8)]` |
## Configuration Files
### Package Management
- **Frontend**: `off-chain/frontend/package.json`
- **Indexer**: `off-chain/indexer/package.json`
- **Transaction Builder**: `off-chain/transaction-builder/package.json`
- **Contracts**: Cargo.toml files with ckb-std dependencies
### Environment Variables
- Frontend: Use `NEXT_PUBLIC_*` prefix for client-exposed variables
- Example: `NEXT_PUBLIC_API_URL` in `api.ts`
- Backend: Load from `.env` or process.env
## Special Patterns
### Database Column Names
- Standardized to snake_case
- Match Rust struct field naming for clarity
- Include NULL constraints where appropriate
- Text fields for hash storage (32+ byte values)
### CSS & Styling
- Tailwind CSS classes for styling
- Dynamic class names stored in constants (NETWORK_BADGE pattern)
- Dark mode support via `dark:` prefix
### Smart Contract Type Scripts
- Used as validation scripts (not lock scripts)
- Initialized with empty args (`"0x"`)
- Cell data contains serialized struct instances
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Design Pattern
### Architecture Layers
```
```
## Data Flow
### Write Path (User Action → CKB)
```
```
### Read Path (Frontend Query → Index → Blockchain)
```
```
### Background Polling (Indexer Sync)
```
```
## Key Abstractions & Module Boundaries
### Contract Layer (`/contracts`)
- **Entry point**: `program_entry()` validates cell lifecycle
- **Data struct**: `CampaignData` (65 bytes):
- **Validation logic**:
- **Entry point**: `program_entry()` validates pledge lifecycle
- **Data struct**: `PledgeData` (72 bytes):
- **Validation logic**:
### Transaction Builder Layer (`/off-chain/transaction-builder`)
- `builder.ts`: `TransactionBuilder` class
- `serializer.ts`: Serialization utilities
- `types.ts`: TypeScript interfaces for transaction parameters
- `ckbClient.ts`: CCC client factory
### Indexer Layer (`/off-chain/indexer`)
- `indexer.ts`: `CampaignIndexer` class
- `api.ts`: `IndexerAPI` class (Express REST server)
- `database.ts`: `Database` class (SQLite wrapper)
- `parser.ts`: Cell data parsing
- `types.ts`: TypeScript interfaces
### Frontend Layer (`/off-chain/frontend`)
- `page.tsx` — Home: lists all campaigns, hero section
- `campaigns/new/page.tsx` — Create campaign form
- `campaigns/[id]/page.tsx` — Campaign detail + actions (pledge, finalize, refund, release)
- `layout.tsx` — App root, providers setup
- `Providers.tsx` — CCC connector context setup
- `Header.tsx` — Navigation bar
- `CampaignCard.tsx` — Card UI for campaign preview
- `DevnetContext.tsx` — Devnet configuration provider
- `Skeleton.tsx` — Loading placeholder
- `Toast.tsx` — Notification system
- `api.ts` — HTTP client for indexer
- `types.ts` — Frontend TypeScript models
- `ckbClient.ts` — CCC client initialization
- `constants.ts` — Contract code hashes, API base URL
- `serialization.ts` — Campaign/pledge serialization (duplicate of tx-builder)
- `utils.ts` — Utility functions (formatting, validation)
## Core Abstractions
### Campaign Lifecycle State Machine
```
```
### Off-Chain Effective Status Computation
- If `status == Active` AND `current_block < deadline_block` → Active
- If `status == Active` AND `current_block >= deadline_block`:
- If `status == Success` or `status == Failed` → Use on-chain status
## Entry Points
### Contract Execution Entry Points
- **File**: `contracts/campaign/src/main.rs`
- **Entry point**: `program_entry()` (line 8)
- **Triggered by**: Transaction execution (CKB VM calls type script)
- **Parameters**: Implicit (loaded from CKB environment)
- **File**: `contracts/pledge/src/main.rs`
- **Entry point**: `program_entry()` (line 8)
- **Same mechanism as Campaign Contract**
### Transaction Builder Entry Points
- `test-create-campaign.ts` — Example: creates a single campaign
- `test-lifecycle.ts` — Example: full campaign + pledge + finalize flow
- `seed-frontend-test.ts` — Setup: creates 4 test campaigns for frontend
- `deploy-contracts.ts` — Deployment: publishes contracts to CKB
```typescript
```
### Indexer Entry Point
- **Function**: `main()`
- **Lifecycle**:
```bash
```
### Frontend Entry Point
- **Root component**: `RootLayout`
- **Renders**: Providers (CCC connector, Devnet context), Header, page content
- **Dev server**: `npm run dev` (Next.js)
## Data Format Specifications
### Campaign Cell Data (65 bytes, fixed)
```
```
- 0 = Active
- 1 = Success
- 2 = Failed
- Title string (length-prefixed)
- Description string (length-prefixed)
### Pledge Cell Data (72 bytes, fixed)
```
```
## Transaction Fees & Capacity Model
- **Capacity**: Total CKB in a cell
- **Required minimum**: 61 bytes (base cell) or more for data
- **Formula**: `capacity = dataSize + baseOverhead`
- **Fee calculation**: `fee = txSize * feeRate` (default 1000 shannons/KB)
## Testing & Validation
- Native RISC-V compilation: `cargo build --target riscv64imac-unknown-none-elf --release`
- Deployed to devnet via deployment script
- Validated via transaction builder test scripts
- `test-create-campaign.ts` — Single campaign creation
- `test-lifecycle.ts` — Full flow: create, pledge, finalize, claim/release
- `seed-frontend-test.ts` — Populate devnet with test data
- OffCKB devnet (local, 10-block test cycles)
- CKB testnet (Neon public testnet)
- CKB mainnet (production)
## Configuration & Environment
- `CKB_RPC_URL` — CKB node RPC endpoint (default: http://127.0.0.1:8114)
- `PORT` — Indexer API port (default: 3001)
- `DB_PATH` — SQLite database file path (default: ./data/indexer.db)
- `POLL_INTERVAL` — Indexer sync interval ms (default: 10000)
- `CAMPAIGN_CODE_HASH` — Deployed campaign contract code hash
- `PLEDGE_CODE_HASH` — Deployed pledge contract code hash
- Campaign: `0xb71c1c0bc80ddc5a16ef041f2adf1f9a9339b56ecd63c135607e7e5ebb6ea3fc`
- Pledge: `0x423442d38b9e1fdfe68d0e878c4003317fe85408e202fd7de776205d289bc924`
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
