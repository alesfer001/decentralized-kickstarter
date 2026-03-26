# CKB Decentralized Kickstarter - Architecture Overview

## System Design Pattern

This is a **monorepo with on-chain smart contracts + off-chain services**, following a multi-layer architecture that separates blockchain logic from application logic and user interfaces.

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│ PRESENTATION LAYER (Frontend)                               │
│ Next.js + React TypeScript SPA                             │
│ - Campaign browsing, creation forms                         │
│ - User pledge submission & claim/refund UI                  │
│ - Wallet integration (CCC connector)                         │
└─────────────────────────────────────────────────────────────┘
                           ↑ HTTP/REST
┌─────────────────────────────────────────────────────────────┐
│ SERVICE LAYER (Off-Chain)                                   │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ INDEXER SERVICE (Node.js + Express + SQLite)          │  │
│ │ - Polls CKB node for new campaign/pledge cells        │  │
│ │ - Persists to SQLite database                         │  │
│ │ - Provides REST API for campaign queries              │  │
│ │ - Calculates aggregate state (status, total pledges) │  │
│ └────────────────────────────────────────────────────────┘  │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ TRANSACTION BUILDER (Node.js TypeScript)              │  │
│ │ - Constructs CKB transactions                         │  │
│ │ - Campaign creation, pledge submission                │  │
│ │ - Campaign finalization (Active → Success/Failed)     │  │
│ │ - Pledge refund/release operations                    │  │
│ │ - Cell serialization & capacity calculation           │  │
│ └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↓ RPC (CCC client)
┌─────────────────────────────────────────────────────────────┐
│ BLOCKCHAIN LAYER (CKB Network)                              │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ SMART CONTRACTS (Rust, compiled to RISC-V)           │  │
│ │                                                        │  │
│ │ Campaign Contract:                                     │  │
│ │ - Validates campaign cell lifecycle                   │  │
│ │ - Enforces state transitions (Active → Success/Failed)│  │
│ │ - Data: creator, funding_goal, deadline, status      │  │
│ │                                                        │  │
│ │ Pledge Contract:                                       │  │
│ │ - Validates pledge cell lifecycle                     │  │
│ │ - Guards pledge destruction (refund/release)         │  │
│ │ - Data: campaign_id, backer, amount                  │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ Cell state tracked via:                                      │
│ - Campaign cells: UTXO model with type script               │
│ - Pledge cells: UTXO model with type script                 │
│ - Grouped inputs/outputs detect lifecycle events           │
│ └─────────────────────────────────────────────────────────┘  │
```

## Data Flow

### Write Path (User Action → CKB)

```
User (Frontend)
    │
    ├─→ Submits form (create campaign, pledge, finalize)
    │
    ↓
Frontend App
    │
    ├─→ Calls ccc signer (wallet integration)
    │
    ↓
Transaction Builder
    │
    ├─→ Deserializes campaign/pledge data
    ├─→ Creates transaction with:
    │   - Inputs (to cover capacity + fee)
    │   - Outputs (new cell with serialized data + type script)
    │   - Cell deps (references to contract code)
    ├─→ Completes transaction (signs with wallet)
    │
    ↓
CKB RPC / CKB Node
    │
    ├─→ Validates transaction signature
    ├─→ Executes contract (type script validation)
    │   - Campaign: Validates state transitions
    │   - Pledge: Validates creation/destruction
    ├─→ Commits cell state to chain
    │
    ↓
Transaction confirmed (in block)
```

### Read Path (Frontend Query → Index → Blockchain)

```
Frontend App
    │
    ├─→ HTTP GET /campaigns (list all)
    ├─→ HTTP GET /campaigns/:id (campaign detail)
    ├─→ HTTP GET /pledges/backer/:lockHash (user's pledges)
    │
    ↓
Indexer Service (REST API)
    │
    ├─→ Reads SQLite database (persisted cell state)
    ├─→ Calculates derived state:
    │   - totalPledged = sum(pledge.amount) for campaign
    │   - effectiveStatus = Active|Success|Failed based on logic
    │
    ↓
SQLite Database
    │
    └─→ Maintains tables:
        - campaigns (id, creator, funding_goal, deadline, status)
        - pledges (id, campaign_id, backer, amount)
```

### Background Polling (Indexer Sync)

```
Indexer Service (interval-driven)
    │
    ├─→ Query CKB RPC:
    │   - GET /cells (search by script code hash)
    │   - Returns all campaign/pledge cells from chain
    │
    ↓
Parse Cell Data
    │
    ├─→ Campaign cells:
    │   Parse 65-byte header (creator, goal, deadline, status)
    │   Extract variable-length title/description
    │
    ├─→ Pledge cells:
    │   Parse 72-byte header (campaign_id, backer, amount)
    │
    ↓
SQLite Database (upsert)
    │
    └─→ Update campaigns / pledges tables
        (keeps local state in sync with chain)
```

## Key Abstractions & Module Boundaries

### Contract Layer (`/contracts`)

**Campaign Contract** (`contracts/campaign/src/main.rs`)
- **Entry point**: `program_entry()` validates cell lifecycle
- **Data struct**: `CampaignData` (65 bytes):
  - `creator_lock_hash`: [u8; 32] — who created campaign
  - `funding_goal`: u64 — CKB target amount
  - `deadline_block`: u64 — when campaign expires
  - `total_pledged`: u64 — amount pledged (on-chain tracking)
  - `status`: u8 — enum: 0=Active, 1=Success, 2=Failed
- **Validation logic**:
  - Creation: Always allowed (no lock script validation)
  - Finalization: Active → Success/Failed, immutable fields unchanged
  - Destruction: Allowed (enables cash withdrawal)

**Pledge Contract** (`contracts/pledge/src/main.rs`)
- **Entry point**: `program_entry()` validates pledge lifecycle
- **Data struct**: `PledgeData` (72 bytes):
  - `campaign_id`: [u8; 32] — which campaign this pledges to
  - `backer_lock_hash`: [u8; 32] — who made the pledge
  - `amount`: u64 — CKB pledged
- **Validation logic**:
  - Creation: Always allowed
  - Destruction: Allowed (refund or release to creator)
  - Modification: Rejected (immutable)

### Transaction Builder Layer (`/off-chain/transaction-builder`)

**Core modules**:
- `builder.ts`: `TransactionBuilder` class
  - `createCampaign(signer, params)` → TxHash
  - `createPledge(signer, params)` → TxHash
  - `finalizeCampaign(signer, params)` → TxHash
  - `refundPledge(signer, params)` → TxHash
  - `releasePledgeToCreator(signer, params)` → TxHash

- `serializer.ts`: Serialization utilities
  - `serializeCampaignData()` → hex string (65 bytes)
  - `serializePledgeData()` → hex string (72 bytes)
  - `calculateCellCapacity()` → bigint (CKB shannons)

- `types.ts`: TypeScript interfaces for transaction parameters
  - `CampaignParams`, `PledgeParams`
  - `FinalizeCampaignParams`, `RefundPledgeParams`, `ReleasePledgeParams`
  - `ContractInfo` (code hash, hash type, deployment location)

- `ckbClient.ts`: CCC client factory
  - Network configuration (devnet, testnet, mainnet)
  - System script definitions (Secp256k1Blake160, etc.)

### Indexer Layer (`/off-chain/indexer`)

**Core modules**:
- `indexer.ts`: `CampaignIndexer` class
  - `indexAll(campaignCodeHash, pledgeCodeHash)` → scan blockchain
  - `getCampaigns()` → Campaign[] (from database)
  - `getCampaign(id)` → Campaign (from database)
  - `getPledgesForBacker(lockHash)` → Pledge[] (filtered)
  - `calculateTotalPledged(campaign)` → bigint

- `api.ts`: `IndexerAPI` class (Express REST server)
  - `GET /health` — status check
  - `GET /campaigns` — list all campaigns with computed state
  - `GET /campaigns/:id` — single campaign detail
  - `GET /pledges/backer/:lockHash` — pledges by backer address

- `database.ts`: `Database` class (SQLite wrapper)
  - Schema: `campaigns` and `pledges` tables
  - Migration utilities
  - Query methods (insert, select, update)

- `parser.ts`: Cell data parsing
  - `parseCampaignData(cellData)` → Campaign object
  - `parsePledgeData(cellData)` → Pledge object

- `types.ts`: TypeScript interfaces
  - `Campaign`, `Pledge`, `CampaignStatus` enums

### Frontend Layer (`/off-chain/frontend`)

**Pages** (`src/app/`):
- `page.tsx` — Home: lists all campaigns, hero section
- `campaigns/new/page.tsx` — Create campaign form
- `campaigns/[id]/page.tsx` — Campaign detail + actions (pledge, finalize, refund, release)
- `layout.tsx` — App root, providers setup

**Components** (`src/components/`):
- `Providers.tsx` — CCC connector context setup
- `Header.tsx` — Navigation bar
- `CampaignCard.tsx` — Card UI for campaign preview
- `DevnetContext.tsx` — Devnet configuration provider
- `Skeleton.tsx` — Loading placeholder
- `Toast.tsx` — Notification system

**Libraries** (`src/lib/`):
- `api.ts` — HTTP client for indexer
  - `fetchCampaigns()`, `fetchCampaign(id)`, `fetchBackerPledges(lockHash)`
- `types.ts` — Frontend TypeScript models
  - `Campaign`, `Pledge`, `CreateCampaignForm`, `CreatePledgeForm`
- `ckbClient.ts` — CCC client initialization
- `constants.ts` — Contract code hashes, API base URL
- `serialization.ts` — Campaign/pledge serialization (duplicate of tx-builder)
- `utils.ts` — Utility functions (formatting, validation)

## Core Abstractions

### Campaign Lifecycle State Machine

```
     ┌──────────────────────────────────────────────────────────────┐
     │ Campaign States (on-chain)                                   │
     ├──────────────────────────────────────────────────────────────┤
     │                                                               │
     │  ACTIVE                                                       │
     │  ├─ Pledges accepted                                         │
     │  ├─ Expires at deadline_block                                │
     │  └─ Finalized by creator when:                               │
     │     • deadline_block reached, AND                            │
     │     • total_pledged >= funding_goal → SUCCESS                │
     │     OR                                                        │
     │     • deadline_block reached, AND                            │
     │     • total_pledged < funding_goal → FAILED                  │
     │                                                               │
     │  SUCCESS                                                      │
     │  ├─ Pledges locked, funds released to creator                │
     │  ├─ Backers can call "Release to Creator" tx                 │
     │  │  (sends their pledge amount to creator)                   │
     │  └─ Campaign cell can be destroyed                           │
     │                                                               │
     │  FAILED                                                       │
     │  ├─ Campaign did not reach goal                              │
     │  ├─ Backers can call "Claim Refund" tx                       │
     │  │  (gets their pledge amount back)                          │
     │  └─ Campaign cell can be destroyed                           │
     │                                                               │
     └──────────────────────────────────────────────────────────────┘
```

### Off-Chain Effective Status Computation

The indexer computes `effectiveStatus` for frontend display:
- If `status == Active` AND `current_block < deadline_block` → Active
- If `status == Active` AND `current_block >= deadline_block`:
  - If `total_pledged >= funding_goal` → Success (not yet finalized)
  - Else → Failed (not yet finalized)
- If `status == Success` or `status == Failed` → Use on-chain status

This allows the frontend to show realistic status even before on-chain finalization.

## Entry Points

### Contract Execution Entry Points

**Campaign Contract**:
- **File**: `contracts/campaign/src/main.rs`
- **Entry point**: `program_entry()` (line 8)
- **Triggered by**: Transaction execution (CKB VM calls type script)
- **Parameters**: Implicit (loaded from CKB environment)
  - Current transaction via `load_script()`
  - Input/output cells via CKB syscalls
  - Cell data via `load_cell_data()`

**Pledge Contract**:
- **File**: `contracts/pledge/src/main.rs`
- **Entry point**: `program_entry()` (line 8)
- **Same mechanism as Campaign Contract**

### Transaction Builder Entry Points

**CLI Script**:
- `test-create-campaign.ts` — Example: creates a single campaign
- `test-lifecycle.ts` — Example: full campaign + pledge + finalize flow
- `seed-frontend-test.ts` — Setup: creates 4 test campaigns for frontend
- `deploy-contracts.ts` — Deployment: publishes contracts to CKB

**Programmatic**:
```typescript
import { TransactionBuilder } from "./src/builder";
const builder = new TransactionBuilder(client, campaignContract, pledgeContract);
const txHash = await builder.createCampaign(signer, campaignParams);
```

### Indexer Entry Point

**File**: `off-chain/indexer/src/index.ts`
- **Function**: `main()`
- **Lifecycle**:
  1. Initialize SQLite database
  2. Create `CampaignIndexer` instance
  3. Test RPC connection
  4. Create `IndexerAPI` and start Express server
  5. Run `indexAll()` for initial sync
  6. Start polling timer (default 10s interval)

**Invocation**:
```bash
cd off-chain/indexer
npm run dev  # ts-node src/index.ts
```

### Frontend Entry Point

**File**: `off-chain/frontend/src/app/layout.tsx`
- **Root component**: `RootLayout`
- **Renders**: Providers (CCC connector, Devnet context), Header, page content
- **Dev server**: `npm run dev` (Next.js)

## Data Format Specifications

### Campaign Cell Data (65 bytes, fixed)

```
Offset  Type      Name              Bytes
──────────────────────────────────────────
0-31    [u8; 32]  creator_lock_hash  32
32-39   u64       funding_goal       8
40-47   u64       deadline_block     8
48-55   u64       total_pledged      8
56      u8        status             1
57-64   [u8; 8]   reserved          8
──────────────────────────────────────────
Total:                                65
```

**Status enum**:
- 0 = Active
- 1 = Success
- 2 = Failed

**Variable-length metadata** (after byte 64):
- Title string (length-prefixed)
- Description string (length-prefixed)

### Pledge Cell Data (72 bytes, fixed)

```
Offset  Type      Name            Bytes
────────────────────────────────────────
0-31    [u8; 32]  campaign_id      32
32-63   [u8; 32]  backer_lock_hash 32
64-71   u64       amount           8
────────────────────────────────────────
Total:                             72
```

No variable-length data.

## Transaction Fees & Capacity Model

All cells follow the CKB UTXO model:
- **Capacity**: Total CKB in a cell
- **Required minimum**: 61 bytes (base cell) or more for data
- **Formula**: `capacity = dataSize + baseOverhead`
- **Fee calculation**: `fee = txSize * feeRate` (default 1000 shannons/KB)

Campaign cells require at least 65 bytes for header + overhead + metadata.
Pledge cells require 72 bytes base + amount pledged in shannons.

## Testing & Validation

**Contract testing**:
- Native RISC-V compilation: `cargo build --target riscv64imac-unknown-none-elf --release`
- Deployed to devnet via deployment script
- Validated via transaction builder test scripts

**Integration testing** (`off-chain/transaction-builder/`):
- `test-create-campaign.ts` — Single campaign creation
- `test-lifecycle.ts` — Full flow: create, pledge, finalize, claim/release
- `seed-frontend-test.ts` — Populate devnet with test data

**Deployment targets**:
- OffCKB devnet (local, 10-block test cycles)
- CKB testnet (Neon public testnet)
- CKB mainnet (production)

## Configuration & Environment

**Key environment variables**:
- `CKB_RPC_URL` — CKB node RPC endpoint (default: http://127.0.0.1:8114)
- `PORT` — Indexer API port (default: 3001)
- `DB_PATH` — SQLite database file path (default: ./data/indexer.db)
- `POLL_INTERVAL` — Indexer sync interval ms (default: 10000)
- `CAMPAIGN_CODE_HASH` — Deployed campaign contract code hash
- `PLEDGE_CODE_HASH` — Deployed pledge contract code hash

**Contract code hashes** (devnet):
- Campaign: `0xb71c1c0bc80ddc5a16ef041f2adf1f9a9339b56ecd63c135607e7e5ebb6ea3fc`
- Pledge: `0x423442d38b9e1fdfe68d0e878c4003317fe85408e202fd7de776205d289bc924`

(Updated on new deployments; stored in `/deployment/deployed-contracts.json`)
