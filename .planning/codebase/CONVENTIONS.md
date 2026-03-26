# Codebase Conventions

## Overview

This document outlines coding conventions and patterns used throughout the decentralized-kickstarter project, which spans TypeScript/React frontend and off-chain services, plus Rust smart contracts on CKB.

## TypeScript/JavaScript Conventions

### TypeScript Configuration

- **Strict Mode**: Enabled across all TypeScript projects (`"strict": true`)
- **Target**: ES2020
- **Module System**:
  - Frontend (Next.js): ESNext with bundler resolution
  - Backend services: CommonJS
- **Module Resolution**: Node for backend, bundler for frontend
- **Additional Settings**:
  - `esModuleInterop`: true (allows CommonJS/ES6 interop)
  - `forceConsistentCasingInFileNames`: true
  - `resolveJsonModule`: true
  - `isolatedModules`: true (frontend)

**Files**:
- `off-chain/frontend/tsconfig.json` (Next.js + JSX)
- `off-chain/indexer/tsconfig.json`
- `off-chain/transaction-builder/tsconfig.json`

### Import Organization

Imports are organized in groups separated by blank lines:

1. External libraries (`@ckb-ccc/core`, `next`, `react`)
2. Internal type imports (e.g., `./types`, `@/lib/types`)
3. Internal utility imports (e.g., `./utils`, `./serializer`)
4. Component or module imports

**Examples**:
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
  - API functions: descriptive verbs (`fetchCampaigns`, `checkHealth`, `parseCampaignData`)
  - Utilities: descriptive names (`shannonsToCKB`, `getEffectiveStatusColor`, `formatHash`)
- **Constants**: UPPER_SNAKE_CASE for module-level constants
  - Example: `const API_BASE = process.env.NEXT_PUBLIC_API_URL`
  - Error codes: `const ERROR_NO_SCRIPT: i8 = 7` (in Rust)
- **Interfaces**: PascalCase, descriptive names
  - Example: `CampaignCardProps`, `CreateCampaignForm`, `CreatorLockScript`
- **Enums**: PascalCase
  - Example: `CampaignStatus`, `NetworkType`

#### Database Tables
- snake_case for all identifiers
- Example: `creator_lock_hash`, `total_pledged`, `output_index`

### Type Definitions

**Patterns**:
- Use `interface` for object structures (preferred over `type`)
- Use `enum` for status values and fixed sets of values
- Export types from dedicated `types.ts` files
- Document complex types with JSDoc comments

**Examples**:
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
  ```typescript
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.statusText}`);
  }
  ```
- Generic catch blocks (no explicit error type) as per Node.js best practices
- Example: `catch (error)` or `catch { ... }` (ignore error)

#### In Components
- Use try-catch in useEffect and event handlers
- Gracefully handle null/undefined states
- Example (Header.tsx):
  ```typescript
  try {
    const addr = await walletSigner.getRecommendedAddress();
    setAddress(addr);
  } catch {
    setAddress(null);
  }
  ```

### API & Utility Functions

#### Patterns
- Export named functions (no default exports in utility files)
- Add JSDoc comments for public functions
- Include error context in thrown errors
- Example (api.ts):
  ```typescript
  /**
   * Fetch all campaigns from the indexer
   */
  export async function fetchCampaigns(): Promise<Campaign[]> { ... }
  ```

#### Documentation
- JSDoc comments for all exported functions and types
- Include parameters and return types
- Example comments in `off-chain/frontend/src/lib/api.ts`

### BigInt Usage

- Use `BigInt()` constructor for large numbers (CKB amounts)
- Convert strings to BigInt: `BigInt(campaignValue)`
- Use `bigint` type in TypeScript
- Examples:
  - `off-chain/frontend/src/lib/api.ts`: `return BigInt(data.blockNumber)`
  - `off-chain/frontend/src/components/CampaignCard.tsx`: `BigInt(campaign.deadlineBlock) < currentBlock`

## Rust Conventions

### Code Organization

**Project Structure**:
- `contracts/campaign/src/main.rs` - Campaign contract entry point
- `contracts/campaign/src/lib.rs` - Campaign library exports
- `contracts/pledge/src/main.rs` - Pledge contract entry point
- `contracts/pledge/src/lib.rs` - Pledge library exports

### Attributes & Configuration

**Crate-level**:
```rust
#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]
```

**Standard Library**:
- Use conditional `extern crate alloc` for library/test mode
- Use `ckb_std::entry!(program_entry)` for main execution
- Default allocator: `ckb_std::default_alloc!(16384, 1258306, 64)`

### Data Structures

#### Enums
- Use `#[repr(u8)]` for serializable enums
- Include `Debug`, `Clone`, `Copy`, `PartialEq`, `Eq` derives
- Example:
  ```rust
  #[repr(u8)]
  #[derive(Debug, Clone, Copy, PartialEq, Eq)]
  pub enum CampaignStatus {
      Active = 0,
      Success = 1,
      Failed = 2,
  }
  ```

#### Structs
- Use public fields for simple data containers
- Include `SIZE` constant for fixed-size structs
- Implement `from_bytes()` and `to_bytes()` methods
- Example (CampaignData):
  ```rust
  pub struct CampaignData {
      pub creator_lock_hash: [u8; 32],
      pub funding_goal: u64,
      pub deadline_block: u64,
      pub total_pledged: u64,
      pub status: CampaignStatus,
  }

  impl CampaignData {
      pub const SIZE: usize = 65;
      pub fn from_bytes(data: &[u8]) -> Result<Self, i8> { ... }
      pub fn to_bytes(&self) -> [u8; Self::SIZE] { ... }
  }
  ```

### Byte Serialization

#### Patterns
- Little-endian byte order: `u64::from_le_bytes()`, `.to_le_bytes()`
- Fixed-size arrays for known-length fields: `[u8; 32]` for hashes
- Document byte layout in struct comments
- Example (from main.rs files):
  ```rust
  let funding_goal = u64::from_le_bytes(data[32..40].try_into().unwrap());
  bytes[32..40].copy_from_slice(&self.funding_goal.to_le_bytes());
  ```

### Error Handling

#### Return Types
- Use `Result<T, i8>` for operations that can fail
- Return error codes as `i8` (negative or specific integer)
- Document error codes as constants

#### Error Codes
- Define as module-level constants (UPPER_SNAKE_CASE with `ERROR_` prefix)
- Include descriptive comment
- Example:
  ```rust
  const ERROR_NO_SCRIPT: i8 = 7;
  const ERROR_LOAD_DATA: i8 = 9;
  const ERROR_INVALID_FINALIZATION: i8 = 10;
  ```

#### Debug Output
- Use `debug!()` macro for logging
- Include context in debug messages
- Example:
  ```rust
  debug!("Campaign data too short: {} bytes", data.len());
  debug!("Invalid campaign status: {}", data[56]);
  ```

### Function Signatures

#### Validation Methods
- Named `validate_*()` for validation functions
- Return `Result<(), i8>` for error codes
- Example:
  ```rust
  pub fn validate_creation(&self) -> Result<(), i8> { ... }
  fn validate_finalization(old: &CampaignData, new: &CampaignData) -> Result<(), i8> { ... }
  ```

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
  ```rust
  /// Campaign data structure (stored in cell data)
  /// Layout (total: 65 bytes):
  /// - creator_lock_hash: [u8; 32]  (bytes 0-31)
  /// - funding_goal: u64            (bytes 32-39)
  ```

## Cross-Language Type Mapping

TypeScript interfaces and Rust structs are kept synchronized:

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
