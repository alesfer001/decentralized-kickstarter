# External Integrations - Decentralized Kickstarter

## Blockchain - Nervos CKB Network

### CKB RPC Integration
**Library**: `@ckb-ccc/core` (^1.12.2)

**Connection Pattern**:
- Multi-network support via environment configuration
- Default RPC endpoints per network:
  - **devnet**: `http://127.0.0.1:8114` (local OffCKB)
  - **testnet**: `https://testnet.ckbapp.dev/`
  - **mainnet**: `https://mainnet.ckbapp.dev/`

**Configuration Locations**:
- Frontend: `off-chain/frontend/.env.example` - env var `NEXT_PUBLIC_CKB_RPC_URL`
- Indexer: `off-chain/indexer/.env.example` - env var `CKB_RPC_URL`
- Constants: `off-chain/frontend/src/lib/constants.ts` - hardcoded RPC_URLS by network

**Usage**:
- Frontend RPC Client: `off-chain/frontend/src/lib/ckbClient.ts`
  - `createCkbClient(network, rpcUrl?)` - Creates configured CCC Client
  - Supports devnet with custom script configs for OffCKB
  - Returns `ccc.ClientPublicTestnet` or `ccc.ClientPublicMainnet`

- Indexer RPC Client: `off-chain/indexer/src/indexer.ts`
  - `new ccc.ClientPublicTestnet({ url: rpcUrl })`
  - Used for polling and indexing campaign/pledge cells

- Transaction Builder RPC: `off-chain/transaction-builder/src/ckbClient.ts`
  - Same network abstraction as frontend
  - Used for transaction construction and submission

### CCC SDK (Connector)
**Library**: `@ckb-ccc/connector-react` (^1.0.30)

**Purpose**: Wallet connection and transaction signing

**Integration Points**:
1. **Frontend Provider** - `off-chain/frontend/src/components/Providers.tsx`
   ```typescript
   <ccc.Provider>
     <DevnetProvider>
       <ToastProvider>
   ```

2. **Wallet Connection** - `off-chain/frontend/src/components/DevnetContext.tsx`
   - On devnet: Uses `ccc.SignerCkbPrivateKey` with hardcoded test keys
   - On testnet/mainnet: Uses wallet provider from `ccc.Provider` (e.g., JoyID, CCC compatible wallets)
   - Returns signer instance for transaction signing

3. **Signer Usage** - Multiple locations:
   - Transaction builder receives signer for signing before broadcast
   - Gets recommended address and lock script from signer
   - Example: `off-chain/transaction-builder/src/builder.ts` line 40-41

### Devnet Configuration
**Location**: `off-chain/frontend/src/lib/ckbClient.ts`

**OffCKB Devnet Scripts** (hardcoded):
- Secp256k1Blake160 (standard addresses):
  - Code Hash: `0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8`
  - Cell Dep Group Tx: `0x75be96e1871693f030db27ddae47890a28ab180e88e36ebb3575d9f1377d3da7`

- Secp256k1Multisig:
  - Code Hash: `0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8`

- AnyoneCanPay:
  - Code Hash: `0xe09352af0066f3162287763ce4ddba9af6bfaeab198dc7ab37f8c71c9e68bb5b`

- NervosDao:
  - Code Hash: `0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e`

**Devnet Test Accounts** - `off-chain/frontend/src/lib/constants.ts`:
```typescript
Account 0:
  Address: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvwg2cen8extgq8s5puft8vf40px3f599cytcyd8
  Private Key: 0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6
  Lock Arg: 0x8e42b1999f265a0078503c4acec4d5e134534297

Account 1:
  Address: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt435c3epyrupszm7khk6weq5lrlyt52lg48ucew
  Private Key: 0x9f315d5a9618a39fdc487c7a67a8581d40b045bd7a42d83648ca80ef3b2cb4a1
  Lock Arg: 0x758d311c8483e0602dfad7b69d9053e3f917457d
```

**Devnet Funding**: Pre-funded with 42,000,000 CKB each (OffCKB initialization)

### Contract Deployment (Testnet)
**Location**: `off-chain/frontend/src/lib/constants.ts`

**Campaign Contract**:
- Code Hash: `0xb71c1c0bc80ddc5a16ef041f2adf1f9a9339b56ecd63c135607e7e5ebb6ea3fc` (deterministic)
- Tx Hash (testnet): `0xc2a6c3cbe678c407c5a451b6171876b294a001f6ff02a2e5bd8a3fa76c02db57`
- Output Index: 0
- Overrideable via: `NEXT_PUBLIC_CAMPAIGN_CODE_HASH`, `NEXT_PUBLIC_CAMPAIGN_TX_HASH`

**Pledge Contract**:
- Code Hash: `0x423442d38b9e1fdfe68d0e878c4003317fe85408e202fd7de776205d289bc924` (deterministic)
- Tx Hash (testnet): `0xeb91bd93b8d2e2118afdc94f4c784013937f1da1f9461382278d0d57fa8032b6`
- Output Index: 0
- Overrideable via: `NEXT_PUBLIC_PLEDGE_CODE_HASH`, `NEXT_PUBLIC_PLEDGE_TX_HASH`

**Deployment Record**: `/Users/ayoublesfer/Documents/Dev/decentralized-kickstarter/deployment/deployed-contracts-testnet.json`
```json
{
  "network": "testnet",
  "deployedAt": "2026-03-18T17:43:07.396Z",
  "campaign": {...},
  "pledge": {...}
}
```

## Database - SQLite

### Library Integration
**Library**: `better-sqlite3` (^12.6.2)

**Location**: `off-chain/indexer/src/database.ts`

**Class**: `Database` - Synchronous SQLite wrapper

**Initialization**:
```typescript
new Database(dbPath)  // default: "./data/indexer.db"
```

**Configuration**:
- Journal Mode: WAL (Write-Ahead Logging) - `pragma("journal_mode = WAL")`
- Automatic schema creation on initialization
- Auto migrations for backward compatibility

### Schema Design

**campaigns table**:
```sql
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  tx_hash TEXT NOT NULL,
  output_index INTEGER NOT NULL,
  creator_lock_hash TEXT NOT NULL,
  creator_lock_code_hash TEXT,
  creator_lock_hash_type TEXT,
  creator_lock_args TEXT,
  funding_goal TEXT NOT NULL,
  deadline_block TEXT NOT NULL,
  total_pledged TEXT NOT NULL,
  status INTEGER NOT NULL,
  title TEXT,
  description TEXT,
  created_at TEXT NOT NULL,
  original_tx_hash TEXT
)
```

**pledges table**:
```sql
CREATE TABLE pledges (
  id TEXT PRIMARY KEY,
  tx_hash TEXT NOT NULL,
  output_index INTEGER NOT NULL,
  campaign_id TEXT NOT NULL,
  backer_lock_hash TEXT NOT NULL,
  amount TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

**indexer_state table**:
```sql
CREATE TABLE indexer_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)
```

### Environment Configuration
**File**: `off-chain/indexer/.env.example`
- `DB_PATH=./data/indexer.db` - SQLite database file location

**Connection Pattern**:
- Direct file-based SQLite (no server)
- Synchronous reads/writes (blocking)
- Atomic transactions for multi-table operations

### Data Persistence Flow
1. Indexer polls CKB RPC for campaign/pledge cells
2. Parses cell data into Campaign/Pledge objects
3. Writes to SQLite via atomic transaction
4. API server reads from SQLite for HTTP responses

## API Services

### Indexer API Server
**Framework**: Express.js (^5.2.1)

**Location**: `off-chain/indexer/src/api.ts`

**Endpoints**:
- `GET /health` - Health check
- `GET /campaigns` - List all campaigns with effective status
- `GET /campaigns/:id` - Single campaign details
- `GET /campaigns/:campaignId/pledges` - Pledges for a campaign
- `GET /pledges` - All pledges
- `GET /pledges/backer/:lockHash` - Pledges by backer address
- `GET /tip` - Current block number for fee calculation

**Configuration**:
- CORS enabled (all origins)
- JSON request body parsing
- Port: 3001 (configurable via `PORT` env var)

**Data Source**: SQLite database (populated by indexer polling)

**Consumer**: Frontend at `off-chain/frontend/src/lib/api.ts`

### Frontend API Client
**Location**: `off-chain/frontend/src/lib/api.ts`

**Base URL**: Configurable via `NEXT_PUBLIC_API_URL` (default: `http://localhost:3001`)

**Functions**:
- `fetchCampaigns()` - GET /campaigns
- `fetchCampaign(id)` - GET /campaigns/{id}
- `fetchPledgesForCampaign(campaignId)` - GET /campaigns/{campaignId}/pledges
- `fetchPledges()` - GET /pledges
- `fetchBackerPledges(lockHash)` - GET /pledges/backer/{lockHash}
- `fetchBlockNumber()` - GET /tip
- `checkHealth()` - GET /health

**Error Handling**: HTTP status checks with descriptive errors

## Wallet Integration

### CCC Connector
**Library**: `@ckb-ccc/connector-react` (^1.0.30)

**Purpose**: Wallet provider for testnet/mainnet (not devnet)

**Supported Wallets**: Any CCC-compatible wallet provider
- Typically: JoyID, Okx Wallet, other Nervos ecosystem wallets

**Configuration**:
- `off-chain/frontend/src/components/Providers.tsx` - Wraps app in `<ccc.Provider>`
- No explicit wallet configuration (uses CCC default provider discovery)

### Devnet Private Key Signer
**Location**: `off-chain/frontend/src/components/DevnetContext.tsx`

**Signer Type**: `ccc.SignerCkbPrivateKey`

**Pattern**:
```typescript
const signer = new ccc.SignerCkbPrivateKey(
  ckbClient,
  DEVNET_ACCOUNTS[activeAccountIndex].privkey
)
```

**Account Switching**: Via `switchAccount(index)` - allows switching between 2 devnet accounts

**Address Derivation**: `signer.getRecommendedAddress()` returns CKB address

## Transaction Broadcasting

### Transaction Builder
**Location**: `off-chain/transaction-builder/src/builder.ts`

**Class**: `TransactionBuilder`

**Pattern**:
1. Constructor receives `ccc.Client` and contract info
2. Methods build transactions (createCampaign, pledgeCampaign, finalizeCampaign, etc.)
3. Returns transaction hash after broadcast
4. Uses signer for signing before submission

**Methods**:
- `createCampaign(signer, params)` - Campaign creation
- `pledgeCampaign(signer, params)` - New pledge
- `finalizeCampaign(signer, params)` - Finalize campaign
- `refundPledge(signer, params)` - Refund logic
- `releasePledge(signer, params)` - Release pledged funds

**Flow**:
1. Construct transaction object
2. Populate inputs (via signer's balance)
3. Add outputs (campaign/pledge cells)
4. Add type/data scripts
5. Sign with signer
6. Send to RPC via `client.sendTransaction()`

## Hosting & Deployment

### Frontend Hosting
**Platform**: Vercel (indicated by `.env.vercel` configuration file)

**Location**: `off-chain/frontend/.env.vercel`

**Build Command**: `npm run build` (Next.js build)

**Start Command**: `npm run start` (Next.js server)

**Environment Variables**:
- `NEXT_PUBLIC_NETWORK` - Network selection (devnet/testnet/mainnet)
- `NEXT_PUBLIC_CKB_RPC_URL` - CKB RPC endpoint
- `NEXT_PUBLIC_API_URL` - Indexer API endpoint
- Contract deployment hashes (optional overrides)

### Backend Hosting
**Platform**: Render (mentioned in project documentation)

**Services**:
- Indexer API server (Express.js, port 3001)
- Deployed with: `npm install && npm run build && npm run start`

**Environment Variables**:
- `CKB_RPC_URL` - CKB testnet/mainnet RPC
- `PORT` - Server port (3001)
- `DB_PATH` - SQLite database path
- `POLL_INTERVAL` - Indexing poll frequency (10000ms)

## Environment Configuration Summary

### Frontend Environment Variables
**File**: `off-chain/frontend/.env.example`

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_NETWORK` | devnet | Network selection |
| `NEXT_PUBLIC_CKB_RPC_URL` | (per network) | CKB RPC endpoint |
| `NEXT_PUBLIC_API_URL` | http://localhost:3001 | Indexer API |
| `NEXT_PUBLIC_CAMPAIGN_CODE_HASH` | (hardcoded) | Campaign contract override |
| `NEXT_PUBLIC_CAMPAIGN_TX_HASH` | (hardcoded) | Campaign deployment tx override |
| `NEXT_PUBLIC_PLEDGE_CODE_HASH` | (hardcoded) | Pledge contract override |
| `NEXT_PUBLIC_PLEDGE_TX_HASH` | (hardcoded) | Pledge deployment tx override |
| `NEXT_PUBLIC_DEVNET_ACCOUNT` | 0 | Devnet test account selector |

### Indexer Environment Variables
**File**: `off-chain/indexer/.env.example`

| Variable | Default | Purpose |
|----------|---------|---------|
| `CKB_RPC_URL` | http://127.0.0.1:8114 | CKB RPC endpoint |
| `PORT` | 3001 | API server port |
| `DB_PATH` | ./data/indexer.db | SQLite database location |
| `POLL_INTERVAL` | 10000 | Polling frequency (ms) |
| `CAMPAIGN_CODE_HASH` | (optional) | Contract override |
| `PLEDGE_CODE_HASH` | (optional) | Contract override |

## Cross-Service Communication

```
Frontend (Next.js)
├── CCC Connector → Wallet (JoyID/CCC-compatible)
├── CKB RPC Client → CKB Testnet/Mainnet
├── HTTP Fetch → Indexer API (Express)
└── Transaction Builder (via signer)

Indexer API (Express)
├── SQLite Database (local file)
└── CKB RPC Client → CKB Testnet/Mainnet
    (for polling campaign/pledge cells)

Transaction Builder
├── CCC Client → CKB RPC
└── Signer (from wallet or devnet private key)
```

## Data Flow

### Campaign Creation
1. User connects wallet via CCC Provider → selects account
2. Frontend constructs campaign parameters
3. Transaction Builder builds campaign creation transaction
4. Signer signs transaction
5. Transaction broadcast to CKB RPC
6. Cell created on blockchain
7. Indexer polls RPC, detects new campaign cell
8. Parses and stores in SQLite
9. API serves campaign data to frontend

### Campaign Discovery
1. Frontend requests `GET /campaigns` from Indexer API
2. API queries SQLite campaigns table
3. Calculates effective status (based on deadline, funding)
4. Returns JSON response
5. Frontend renders campaign list

## Security Considerations

### Devnet Only Features
- Hardcoded private keys for test accounts (NEVER use on mainnet)
- Unencrypted private key storage in code
- Pre-funded test accounts with 42M CKB each

### Testnet/Mainnet
- Uses external wallet providers (JoyID, etc.)
- Private keys never leave wallet extension
- Transactions signed in wallet UI

### Database
- SQLite file-based (no authentication)
- Should be protected at OS level in production
- WAL mode for concurrent access safety

### API
- No authentication implemented (public read-only API)
- CORS enabled for all origins
- Suitable for trustless data serving only
