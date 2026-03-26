# Technology Stack - Decentralized Kickstarter

## Languages & Runtime

- **Rust** - Smart contracts (blockchain layer)
  - Edition: 2021
  - Contracts in `/contracts/campaign` and `/contracts/pledge`

- **TypeScript** - Off-chain services and frontend
  - Version: ^5 (latest)
  - All off-chain services use TypeScript with strict mode enabled

- **Node.js** - Runtime environment
  - Minimum version: 18+ (implicit, based on package.json features)
  - Used for all JavaScript/TypeScript services

## Frontend Stack

### Framework & Build
- **Next.js** - ^16.0.7
  - App Router (from `src/app/` structure)
  - TypeScript support enabled
  - CSS modules and Tailwind CSS integration
  - Location: `off-chain/frontend/`

- **React** - 19.2.0
  - React DOM - 19.2.0
  - Server and Client components supported

### Styling & CSS
- **Tailwind CSS** - ^4
  - PostCSS integration
  - Configuration: `off-chain/frontend/postcss.config.mjs`

- **Styled-JSX** - (transitive dependency via Next.js)
  - Built-in Next.js styling

### Build Tools
- **TypeScript** - ^5
  - Configuration: `off-chain/frontend/tsconfig.json`
  - Strict mode enabled
  - Module resolution: bundler
  - Target: ES2020

- **ESLint** - ^9
  - Config extends `eslint-config-next` (core-web-vitals and TypeScript)
  - Configuration: `off-chain/frontend/eslint.config.mjs`

### Package Manager
- **npm** - (indicated by package-lock.json)
  - Lock file: `off-chain/frontend/package-lock.json`

## Backend/Indexer Stack

### Runtime & Framework
- **Express** - ^5.2.1
  - REST API server for campaign/pledge indexing
  - CORS enabled
  - JSON middleware
  - Location: `off-chain/indexer/src/api.ts`

- **Node.js** - Runtime
  - TypeScript support via ts-node and tsc compiler

### Database
- **SQLite** - (via better-sqlite3)
  - **better-sqlite3** - ^12.6.2 (synchronous SQLite wrapper)
  - Types: `@types/better-sqlite3` - ^7.6.13
  - Database file: `./data/indexer.db` (default path from env `DB_PATH`)
  - Schema: Two main tables (campaigns, pledges) + indexer_state table
  - WAL journal mode enabled
  - Location: `off-chain/indexer/src/database.ts`

### Development Tools
- **TypeScript** - ^5.9.3
  - Configuration: `off-chain/indexer/tsconfig.json`
  - Compiler target: ES2020
  - Module: commonjs
  - Strict mode enabled

- **ts-node** - ^10.9.2
  - Development execution of TypeScript files
  - Direct execution without build step

- **Type Definitions**
  - `@types/node` - ^24.10.1
  - `@types/express` - ^5.0.6
  - `@types/cors` - ^2.8.19

### Package Manager
- npm (via package-lock.json)
  - Lock file: `off-chain/indexer/package-lock.json`

## Transaction Builder Stack

### Framework
- **CCC Core** - ^1.12.2
  - CKB client and transaction building library
  - Core integration for all blockchain interaction

### Development Tools
- **TypeScript** - ^5.9.3
  - Configuration: `off-chain/transaction-builder/tsconfig.json`
  - Target: ES2020
  - Module: commonjs
  - Strict mode enabled

- **ts-node** - ^10.9.2
  - Development execution
  - Direct TypeScript running

- **Type Definitions**
  - `@types/node` - ^24.10.1

### Build Tool
- **tsc** - TypeScript Compiler
  - Output directory: `dist/`
  - Source directory: `src/`

### Package Manager
- npm (via package-lock.json)
  - Lock file: `off-chain/transaction-builder/package-lock.json`

## Smart Contract Stack

### Blockchain Framework
- **ckb-std** - 1.0
  - Nervos CKB standard library for Rust contracts
  - Used in both campaign and pledge contracts

### Build System
- **Cargo** - Rust package manager
  - Workspaces: `off-chain/campaign` and `off-chain/pledge`
  - Edition: 2021 (Rust 2021 edition)

### Features
- `library` - Enables library compilation
- `native-simulator` - Enables native testing/simulation with ckb-std

### Contracts
- **Campaign Contract**
  - Location: `contracts/campaign/`
  - Cargo.toml: `contracts/campaign/Cargo.toml`
  - Manages campaign creation and lifecycle

- **Pledge Contract**
  - Location: `contracts/pledge/`
  - Cargo.toml: `contracts/pledge/Cargo.toml`
  - Manages pledge tracking and redemption

## Blockchain Integration

### CKB Integration
- **@ckb-ccc/core** - ^1.12.2
  - Core CKB client library
  - Used in: frontend, indexer, transaction-builder
  - Supports multiple networks: devnet, testnet, mainnet
  - Default RPC URLs:
    - devnet: `http://127.0.0.1:8114`
    - testnet: `https://testnet.ckbapp.dev/`
    - mainnet: `https://mainnet.ckbapp.dev/`

- **@ckb-ccc/connector-react** - ^1.0.30
  - React integration for CKB wallet connection
  - Provider component in `off-chain/frontend/src/components/Providers.tsx`
  - Enables wallet interaction from frontend

### Contract Deployment
- Network: testnet (current deployment)
- Campaign Contract:
  - Code Hash: `0xb71c1c0bc80ddc5a16ef041f2adf1f9a9339b56ecd63c135607e7e5ebb6ea3fc`
  - Tx Hash: `0xc2a6c3cbe678c407c5a451b6171876b294a001f6ff02a2e5bd8a3fa76c02db57`
  - Index: 0

- Pledge Contract:
  - Code Hash: `0x423442d38b9e1fdfe68d0e878c4003317fe85408e202fd7de776205d289bc924`
  - Tx Hash: `0xeb91bd93b8d2e2118afdc94f4c784013937f1da1f9461382278d0d57fa8032b6`
  - Index: 0

## Configuration Files

### Frontend Configuration
- **Environment**: `off-chain/frontend/.env.example`
  - Network selection: `NEXT_PUBLIC_NETWORK` (devnet/testnet/mainnet)
  - CKB RPC URL: `NEXT_PUBLIC_CKB_RPC_URL`
  - Indexer API: `NEXT_PUBLIC_API_URL`
  - Contract overrides (optional)
  - Devnet account selection: `NEXT_PUBLIC_DEVNET_ACCOUNT`

- **Next.js Config**: `off-chain/frontend/next.config.ts`
  - Empty configuration (uses Next.js defaults)

- **TypeScript Config**: `off-chain/frontend/tsconfig.json`
  - Path alias: `@/*` -> `./src/*`
  - ES2020 target, React JSX transform

- **PostCSS Config**: `off-chain/frontend/postcss.config.mjs`
  - Tailwind CSS PostCSS plugin

- **ESLint Config**: `off-chain/frontend/eslint.config.mjs`
  - Extends Next.js core-web-vitals and TypeScript configs

### Indexer Configuration
- **Environment**: `off-chain/indexer/.env.example`
  - CKB RPC URL: `CKB_RPC_URL` (default: http://127.0.0.1:8114)
  - API Port: `PORT` (default: 3001)
  - Database path: `DB_PATH` (default: ./data/indexer.db)
  - Polling interval: `POLL_INTERVAL` (default: 10000ms)
  - Contract code hash overrides (optional)

- **TypeScript Config**: `off-chain/indexer/tsconfig.json`
  - CommonJS modules, ES2020 target
  - Output directory: `dist/`

### Transaction Builder Configuration
- **TypeScript Config**: `off-chain/transaction-builder/tsconfig.json`
  - CommonJS modules, ES2020 target
  - Output directory: `dist/`

## Dependency Tree Summary

### Frontend Dependencies (production)
```
next@16.0.7
├── react@19.2.0
├── react-dom@19.2.0
├── @ckb-ccc/connector-react@^1.0.30
└── @ckb-ccc/core@^1.12.2
```

### Frontend DevDependencies
```
@tailwindcss/postcss@^4
├── tailwindcss@^4
typescript@^5
eslint@^9
├── eslint-config-next@16.0.7
@types/* (react, react-dom, node)
```

### Indexer Dependencies (production)
```
@ckb-ccc/core@^1.12.2
express@^5.2.1
├── cors@^2.8.5
better-sqlite3@^12.6.2
```

### Indexer DevDependencies
```
typescript@^5.9.3
ts-node@^10.9.2
@types/* (node, express, cors, better-sqlite3)
```

### Transaction Builder Dependencies (production)
```
@ckb-ccc/core@^1.12.2
```

### Transaction Builder DevDependencies
```
typescript@^5.9.3
ts-node@^10.9.2
@types/node@^24.10.1
```

## Data Size Configuration

- Campaign cell data: 65 bytes (header) + metadata
- Pledge cell data: 72 bytes
- Metadata includes optional title and description stored in cell data

## Build & Run Commands

### Frontend
```bash
npm install
npm run dev          # Development server (Next.js dev)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint check
```

### Indexer
```bash
npm install
npm run build        # TypeScript compilation to dist/
npm run start        # Run compiled indexer
npm run dev          # Development with ts-node
```

### Transaction Builder
```bash
npm install
npm run build        # TypeScript compilation to dist/
npm run dev          # Development with ts-node
```

### Smart Contracts
```bash
cd contracts/campaign
cargo build
cd ../pledge
cargo build
```

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
