# CKB Decentralized Kickstarter - Directory Structure

## Repository Layout

```
decentralized-kickstarter/
├── README.md                              # Minimal project intro
├── PHASE8-STATUS.md                       # Latest phase completion summary
├── .gitignore                             # Git ignore rules
├── .secrets                               # Secrets config (dev only)
├── .planning/                             # Planning & documentation
│   └── codebase/
│       ├── ARCHITECTURE.md               # This file's counterpart
│       └── STRUCTURE.md                  # This file
├── contracts/                             # On-chain Rust contracts
│   ├── campaign/                          # Campaign contract (RISC-V)
│   │   ├── Cargo.toml                    # Rust package definition
│   │   ├── src/
│   │   │   ├── main.rs                   # Campaign contract entry point
│   │   │   └── lib.rs                    # Library exports
│   │   ├── target/                       # Build artifacts (riscv64imac)
│   │   └── README.md                     # Contract documentation
│   └── pledge/                            # Pledge contract (RISC-V)
│       ├── Cargo.toml                    # Rust package definition
│       ├── src/
│       │   ├── main.rs                   # Pledge contract entry point
│       │   └── lib.rs                    # Library exports
│       └── target/                       # Build artifacts (riscv64imac)
├── off-chain/                             # Off-chain services
│   ├── transaction-builder/              # CKB transaction construction
│   │   ├── package.json                  # Node.js dependencies
│   │   ├── tsconfig.json                 # TypeScript config
│   │   ├── src/
│   │   │   ├── index.ts                  # Exports: TransactionBuilder
│   │   │   ├── builder.ts                # TransactionBuilder class
│   │   │   │                             #   - createCampaign()
│   │   │   │                             #   - createPledge()
│   │   │   │                             #   - finalizeCampaign()
│   │   │   │                             #   - refundPledge()
│   │   │   │                             #   - releasePledgeToCreator()
│   │   │   ├── serializer.ts             # Data serialization
│   │   │   │                             #   - serializeCampaignData()
│   │   │   │                             #   - serializePledgeData()
│   │   │   │                             #   - calculateCellCapacity()
│   │   │   ├── types.ts                  # TypeScript interfaces
│   │   │   │                             #   - CampaignParams
│   │   │   │                             #   - PledgeParams
│   │   │   │                             #   - FinalizeCampaignParams
│   │   │   │                             #   - RefundPledgeParams
│   │   │   │                             #   - ReleasePledgeParams
│   │   │   └── ckbClient.ts              # CCC client factory
│   │   │                                 # NetworkType config
│   │   │
│   │   ├── test-create-campaign.ts       # Example: create single campaign
│   │   ├── test-transactions.ts          # Example: test tx creation
│   │   ├── test-lifecycle.ts             # Example: full campaign lifecycle
│   │   ├── seed-frontend-test.ts         # Setup: populate devnet for frontend
│   │   ├── deploy-contracts.ts           # Deployment: publish contracts to CKB
│   │   └── dist/                         # Compiled JavaScript output
│   │
│   ├── indexer/                          # Blockchain indexer service
│   │   ├── package.json                  # Node.js dependencies
│   │   ├── tsconfig.json                 # TypeScript config
│   │   ├── src/
│   │   │   ├── index.ts                  # Main entry point
│   │   │   │                             #   - main() initializes all
│   │   │   ├── indexer.ts                # CampaignIndexer class
│   │   │   │                             #   - indexAll() blockchain scan
│   │   │   │                             #   - getCampaigns()
│   │   │   │                             #   - getCampaign(id)
│   │   │   │                             #   - getPledgesForBacker()
│   │   │   │                             #   - calculateTotalPledged()
│   │   │   ├── api.ts                    # IndexerAPI class (Express server)
│   │   │   │                             #   - GET /campaigns
│   │   │   │                             #   - GET /campaigns/:id
│   │   │   │                             #   - GET /pledges/backer/:lockHash
│   │   │   ├── database.ts               # Database class (SQLite wrapper)
│   │   │   │                             #   - DBCampaign interface
│   │   │   │                             #   - DBPledge interface
│   │   │   │                             #   - Schema creation & migration
│   │   │   ├── parser.ts                 # Cell data parsing
│   │   │   │                             #   - parseCampaignData()
│   │   │   │                             #   - parsePledgeData()
│   │   │   ├── types.ts                  # TypeScript interfaces
│   │   │   │                             #   - Campaign
│   │   │   │                             #   - Pledge
│   │   │   │                             #   - CampaignStatus enum
│   │   │   └── index.ts                  # Main export
│   │   │
│   │   └── dist/                         # Compiled JavaScript output
│   │
│   └── frontend/                         # Next.js React frontend
│       ├── package.json                  # Node.js dependencies
│       ├── tsconfig.json                 # TypeScript config
│       ├── next.config.ts                # Next.js configuration
│       ├── tailwind.config.ts            # Tailwind CSS config
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx            # Root layout (providers)
│       │   │   ├── page.tsx              # Home: campaign list
│       │   │   └── campaigns/
│       │   │       ├── [id]/page.tsx     # Campaign detail + actions
│       │   │       │                     #   - pledge form
│       │   │       │                     #   - finalize button (creator)
│       │   │       │                     #   - refund button (backer, failed)
│       │   │       │                     #   - release button (backer, success)
│       │   │       └── new/page.tsx      # Create campaign form
│       │   │
│       │   ├── components/
│       │   │   ├── Providers.tsx         # CCC connector context setup
│       │   │   ├── Header.tsx            # Navigation & wallet connection
│       │   │   ├── CampaignCard.tsx      # Campaign preview card
│       │   │   ├── DevnetContext.tsx     # Devnet configuration
│       │   │   ├── Skeleton.tsx          # Loading placeholder
│       │   │   └── Toast.tsx             # Notification/alert component
│       │   │
│       │   └── lib/
│       │       ├── api.ts                # HTTP client for indexer
│       │       │                         #   - fetchCampaigns()
│       │       │                         #   - fetchCampaign(id)
│       │       │                         #   - fetchBackerPledges(lockHash)
│       │       ├── types.ts              # Frontend TypeScript models
│       │       │                         #   - Campaign interface
│       │       │                         #   - Pledge interface
│       │       │                         #   - Form types
│       │       ├── ckbClient.ts          # CCC client initialization
│       │       ├── constants.ts          # Contract code hashes, API URL
│       │       ├── serialization.ts      # Serialize campaign/pledge data
│       │       └── utils.ts              # Helpers (format, validate)
│       │
│       ├── public/                       # Static assets
│       ├── .next/                        # Next.js build output
│       └── node_modules/                 # npm dependencies
│
├── deployment/                           # Deployment configs
│   ├── deployed-contracts.json           # Devnet contract addresses
│   ├── deployed-contracts-testnet.json   # Testnet contract addresses
│   └── devnet/                           # OffCKB devnet configuration
│
├── e2e/                                  # End-to-end test scenarios
│   ├── README.md                         # Test guide
│   ├── scenario-1-successful-campaign.md # Test: campaign meets goal
│   ├── scenario-2-failed-campaign-refund.md
│   ├── scenario-3-indexer-persistence.md
│   ├── scenario-4-edge-cases.md
│   └── scenario-5-campaign-destruction.md
│
├── docs/                                 # Project documentation
│   ├── ProjectPlan.md                    # Current roadmap & status
│   ├── DeveloperGuide.md                 # Development setup & workflow
│   ├── CellArchitecture.md               # Cell data structure details
│   ├── CampaignStateMachineVisualReference.md
│   ├── SecurityReview.md                 # Security analysis
│   ├── TestnetDeployment.md              # Testnet deployment guide
│   ├── Deployment.md                     # General deployment docs
│   ├── DevelopmentSetup.md               # Local devnet setup
│   ├── QuickStartGuide.md                # Quick reference
│   ├── ContractBuilding.md               # Contract build process
│   ├── NervosTalkPost.md                 # Community forum post
│   ├── MVP_Progress.md                   # MVP completion tracking
│   ├── SessionSummary_*.md               # Session notes
│   └── ArchitectureValidationChecklist.md
│
├── scripts/                              # Standalone utilities
│   └── deploy-contracts.ts               # Alternative deployment script
│
└── .claude/                              # Claude conversation memory
    └── projects/
        └── -Users-ayoublesfer-Documents-Dev-decentralized-kickstarter/
            └── memory/
                └── MEMORY.md             # Persistent conversation context
```

## Key File Locations

### Smart Contracts

| File | Purpose | Lines |
|------|---------|-------|
| `contracts/campaign/src/main.rs` | Campaign contract logic | ~150 |
| `contracts/campaign/src/lib.rs` | Campaign library (shared code) | ~50 |
| `contracts/pledge/src/main.rs` | Pledge contract logic | ~100 |
| `contracts/pledge/src/lib.rs` | Pledge library (shared code) | ~30 |

### Transaction Building

| File | Purpose | Key Exports |
|------|---------|-------------|
| `off-chain/transaction-builder/src/builder.ts` | Transaction construction | `TransactionBuilder` class |
| `off-chain/transaction-builder/src/serializer.ts` | Data serialization | `serializeCampaignData()`, `serializePledgeData()` |
| `off-chain/transaction-builder/src/types.ts` | Type definitions | `CampaignParams`, `PledgeParams`, etc. |
| `off-chain/transaction-builder/src/index.ts` | Public API | Exports all builders/types |

### Indexer Service

| File | Purpose | Key Exports |
|------|---------|-------------|
| `off-chain/indexer/src/indexer.ts` | Blockchain scanner | `CampaignIndexer` class |
| `off-chain/indexer/src/api.ts` | REST API | `IndexerAPI` class |
| `off-chain/indexer/src/database.ts` | Data persistence | `Database` class, `DBCampaign`, `DBPledge` |
| `off-chain/indexer/src/parser.ts` | Cell parsing | `parseCampaignData()`, `parsePledgeData()` |
| `off-chain/indexer/src/types.ts` | Type definitions | `Campaign`, `Pledge` interfaces |

### Frontend

| File | Purpose |
|------|---------|
| `off-chain/frontend/src/app/layout.tsx` | Root layout & providers |
| `off-chain/frontend/src/app/page.tsx` | Home page (campaign listing) |
| `off-chain/frontend/src/app/campaigns/new/page.tsx` | Create campaign form |
| `off-chain/frontend/src/app/campaigns/[id]/page.tsx` | Campaign detail & actions |
| `off-chain/frontend/src/lib/api.ts` | Indexer HTTP client |
| `off-chain/frontend/src/lib/types.ts` | Frontend type definitions |
| `off-chain/frontend/src/components/CampaignCard.tsx` | Campaign preview component |

## Naming Conventions

### Files

- **Rust contracts**: `main.rs` (entry), `lib.rs` (shared)
- **TypeScript**: camelCase filenames (`builder.ts`, `serializer.ts`, `api.ts`)
- **React components**: PascalCase filenames (`CampaignCard.tsx`, `Header.tsx`)
- **Test/script files**: kebab-case filenames (`test-lifecycle.ts`, `seed-frontend-test.ts`)

### Variables & Functions

- **Rust**: `snake_case` for variables, `PascalCase` for types/structs
- **TypeScript/JavaScript**: `camelCase` for variables/functions, `PascalCase` for classes/types
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `ERROR_CODE_NOT_FOUND`)

### Database Tables

- **SQLite**: `snake_case` (e.g., `campaigns`, `pledges`, `tx_hash`, `backer_lock_hash`)

### API Endpoints

- **REST**: Lowercase hyphen-separated paths
  - `GET /campaigns` — List
  - `GET /campaigns/:id` — Detail
  - `GET /pledges/backer/:lockHash` — Filter by backer

### Contract Data Structures

- **Campaign cell**: Fixed 65 bytes (header) + variable metadata
  - Serialized: hex string with `0x` prefix
  - Parsed: `CampaignData` struct (Rust) or `Campaign` interface (TS)

- **Pledge cell**: Fixed 72 bytes
  - Serialized: hex string with `0x` prefix
  - Parsed: `PledgeData` struct (Rust) or `Pledge` interface (TS)

## Module Dependencies

### Frontend Dependencies

```
off-chain/frontend/
├─ @ckb-ccc/connector-react (wallet)
├─ @ckb-ccc/core (CKB client)
├─ next (framework)
├─ react + react-dom
└─ tailwindcss (styling)
```

### Indexer Dependencies

```
off-chain/indexer/
├─ @ckb-ccc/core (CKB RPC client)
├─ express (HTTP server)
├─ cors (CORS middleware)
├─ better-sqlite3 (database)
└─ TypeScript
```

### Transaction Builder Dependencies

```
off-chain/transaction-builder/
├─ @ckb-ccc/core (CKB client, transaction signing)
└─ TypeScript
```

### Contract Dependencies

```
contracts/campaign/ & contracts/pledge/
├─ ckb-std (CKB system calls)
└─ Rust std (with no_std for RISC-V)
```

## Build Artifacts

### Contracts

- **Output**: `target/riscv64imac-unknown-none-elf/release/`
  - `campaign` — Binary compiled for RISC-V
  - `pledge` — Binary compiled for RISC-V
- **Stripped**: `riscv64-elf-objcopy` removes debug symbols
- **Deployed**: Sent to CKB node via transaction builder

### Indexer

- **Output**: `dist/` (JavaScript)
- **Run**: `npm start` or `npm run dev` (ts-node for development)

### Frontend

- **Output**: `.next/` (Next.js build)
- **Run**: `npm run dev` or `npm run start` (production)

### Transaction Builder

- **Output**: `dist/` (JavaScript)
- **Scripts**: `test-*.ts` run via `ts-node` during development
- **Distribution**: Imported as library in frontend

## Configuration Files

### TypeScript

- `contracts/campaign/Cargo.toml` — Rust contract definition
- `contracts/pledge/Cargo.toml` — Rust contract definition
- `off-chain/*/tsconfig.json` — TypeScript compilation
- `off-chain/frontend/next.config.ts` — Next.js config
- `off-chain/frontend/tailwind.config.ts` — Tailwind CSS config

### Package Management

- `off-chain/transaction-builder/package.json` — npm dependencies
- `off-chain/indexer/package.json` — npm dependencies
- `off-chain/frontend/package.json` — npm dependencies

### Deployment

- `deployment/deployed-contracts.json` — Contract code hashes (devnet)
- `deployment/deployed-contracts-testnet.json` — Contract code hashes (testnet)
- `.secrets` — Local secrets (not committed)

## Environment Variables

Parsed at runtime, no `.env` files in committed code:

### Indexer (off-chain/indexer)

```bash
CKB_RPC_URL=http://127.0.0.1:8114      # CKB node RPC
PORT=3001                               # Express server port
DB_PATH=./data/indexer.db              # SQLite database file
POLL_INTERVAL=10000                    # Sync interval (ms)
CAMPAIGN_CODE_HASH=0x...               # Contract address
PLEDGE_CODE_HASH=0x...                 # Contract address
```

### Frontend (off-chain/frontend)

```bash
NEXT_PUBLIC_INDEXER_API=http://localhost:3001  # Indexer API base URL
NEXT_PUBLIC_CKB_RPC_URL=http://127.0.0.1:8114  # CKB node RPC
NEXT_PUBLIC_CAMPAIGN_CODE_HASH=0x...           # Contract address
NEXT_PUBLIC_PLEDGE_CODE_HASH=0x...             # Contract address
```

### Transaction Builder (off-chain/transaction-builder)

```bash
CKB_RPC_URL=http://127.0.0.1:8114      # CKB node RPC
CAMPAIGN_CODE_HASH=0x...               # Contract address
PLEDGE_CODE_HASH=0x...                 # Contract address
```

## Testing & Validation Locations

- **Contract tests**: Embedded in contract source (Rust #[cfg(test)])
- **Integration tests**: `off-chain/transaction-builder/test-*.ts`
- **E2E scenarios**: `e2e/*.md` (manual test documentation)
- **Fixtures**: `off-chain/transaction-builder/seed-frontend-test.ts` (populates test data)

## Documentation Map

| Document | Purpose |
|----------|---------|
| `README.md` | Minimal intro |
| `docs/DeveloperGuide.md` | Setup & workflow |
| `docs/QuickStartGuide.md` | Quick reference |
| `docs/CellArchitecture.md` | Data structure details |
| `docs/CampaignStateMachineVisualReference.md` | State machine diagrams |
| `docs/ProjectPlan.md` | Roadmap & current status |
| `docs/SecurityReview.md` | Security analysis |
| `docs/TestnetDeployment.md` | Testnet deployment steps |
| `.planning/codebase/ARCHITECTURE.md` | System architecture |
| `.planning/codebase/STRUCTURE.md` | This file — directory layout |
| `e2e/*.md` | Manual test scenarios |
| `PHASE8-STATUS.md` | Latest completion summary |

## Git Ignore Rules

Commonly excluded (see `.gitignore`):

```
target/                  # Rust build
node_modules/           # npm dependencies
dist/                   # Compiled JS
.next/                  # Next.js build
data/                   # SQLite database
*.db                    # Database files
.DS_Store               # macOS files
.env                    # Local secrets (if committed by accident)
```

## Quick Navigation

To find specific functionality:

1. **Campaign contract logic** → `contracts/campaign/src/main.rs`
2. **Pledge contract logic** → `contracts/pledge/src/main.rs`
3. **Transaction building** → `off-chain/transaction-builder/src/builder.ts`
4. **Indexer/database** → `off-chain/indexer/src/`
5. **Frontend pages** → `off-chain/frontend/src/app/`
6. **API client** → `off-chain/frontend/src/lib/api.ts`
7. **Type definitions** → Search files named `types.ts` in each module
8. **Test scripts** → `off-chain/transaction-builder/test-*.ts`
9. **Deployment** → `off-chain/transaction-builder/deploy-contracts.ts`
10. **Configuration** → `deployment/deployed-contracts*.json`
