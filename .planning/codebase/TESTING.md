# Testing Strategy & Framework

## Current Testing Status

**Overview**: The codebase has minimal formal unit/integration testing infrastructure. Testing is primarily manual and scenario-based. No Jest, Vitest, or Mocha configurations found.

## Test Directories

### End-to-End (E2E) Testing

**Location**: `e2e/` directory at project root

**Documentation Files** (scenario-based):
- `e2e/README.md` - E2E testing overview
- `e2e/scenario-1-successful-campaign.md` - Successful campaign lifecycle
- `e2e/scenario-2-failed-campaign-refund.md` - Failed campaign with refund
- `e2e/scenario-3-indexer-persistence.md` - Indexer data persistence
- `e2e/scenario-4-edge-cases.md` - Edge case handling
- `e2e/scenario-5-campaign-destruction.md` - Campaign cell destruction

**Purpose**: Manual testing scenarios that exercise the complete system, including:
- Campaign creation to completion flow
- Pledge mechanics and validation
- Indexer persistence across restarts
- Blockchain state transitions
- Edge cases and error conditions

**Type**: Markdown-based specifications, not automated tests

## Testing Approach

### Manual/Scenario-Based Testing

**Framework**: None (manual verification against documented scenarios)

**Process**:
1. Review scenario documentation in `e2e/` directory
2. Execute transactions using transaction-builder scripts
3. Verify indexer captures state correctly
4. Check UI displays accurate information
5. Validate error handling and edge cases

**Scope**:
- Full user workflows (create campaign, pledge, refund, finalization)
- State consistency between blockchain and indexer database
- Data serialization/deserialization accuracy
- Network-specific behavior (devnet, testnet, mainnet)

### Testing through Transaction Scripts

**Script Locations**:
- `off-chain/transaction-builder/test-create-campaign.ts`
- `off-chain/transaction-builder/test-transactions.ts`
- `off-chain/transaction-builder/test-lifecycle.ts`
- `off-chain/transaction-builder/seed-frontend-test.ts`

**Purpose**: Scripts that create test data and exercise contract functionality

**Execution Method**: `ts-node` (as defined in package.json)

**Example from package.json**:
```json
"scripts": {
  "dev": "ts-node src/index.ts",
  "test": "echo \"Error: no test specified\" && exit 1"
}
```

### Indexer Testing

**Validation Points**:
- Cell data parsing accuracy (campaign/pledge)
- Database schema consistency
- Block number tracking
- Original transaction hash lookup
- Lock script extraction

**Test Files** (scenario-based):
- `e2e/scenario-3-indexer-persistence.md`

### Contract Testing

**Approach**: Validation through on-chain execution

**Test Points**:
- Campaign creation validation (funding_goal > 0, status = Active)
- Pledge creation validation (campaign_id, backer_lock_hash, amount > 0)
- Finalization state transitions
- Immutable field enforcement (creator_lock_hash, funding_goal)

**Validated Via**:
- Transaction builder tests calling contracts
- E2E scenarios exercising contract logic
- Manual verification on devnet

## Build & CI Configuration

### No CI/CD Pipeline Found

**Status**: No `.github/workflows/`, `.gitlab-ci.yml`, or automated CI configuration

**Impact**: Builds and tests are local/manual only

### Build Scripts

**TypeScript Projects**:
```json
{
  "build": "tsc",
  "dev": "ts-node src/index.ts"
}
```

**Location**: Each off-chain project has its own build config
- `off-chain/frontend/package.json` (Next.js build)
- `off-chain/indexer/package.json` (TypeScript compile)
- `off-chain/transaction-builder/package.json` (TypeScript compile)

**Rust Contracts**:
```makefile
# Makefiles in contract directories
# contracts/campaign/Makefile
# contracts/pledge/Makefile
```

### Lint Configuration

**Frontend ESLint**:
- Configured in `off-chain/frontend/package.json`
- `eslint` and `eslint-config-next` as devDependencies
- Run via: `npm run lint`

**No centralized linting for**:
- Indexer
- Transaction builder
- Rust contracts

## Test Framework Dependencies

### Current Setup (Minimal)

**TypeScript Testing**:
```json
{
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  }
}
```

Status: Test framework explicitly not configured (same in both indexer and transaction-builder)

**Frontend**:
- No test dependencies listed
- ESLint only for linting

**Rust**:
- No test framework configured
- Compile-time validation only

## Missing Testing Infrastructure

### Not Implemented
- Unit test framework (Jest, Vitest, or Mocha)
- Component testing (React Testing Library)
- Integration test harness
- Contract unit tests (Rust)
- Test coverage reporting
- Automated E2E testing (Playwright, Cypress, Puppeteer)
- GitHub Actions or CI/CD pipeline

### Recommended Future Setup

If automated testing is needed:

**Frontend (React/Next.js)**:
- Framework: **Jest** + **React Testing Library**
- Config: `jest.config.js`, `jest.setup.js`
- Location: `off-chain/frontend/__tests__/` or `src/__tests__/`
- Pattern: `*.test.tsx` or `*.spec.tsx` files

**TypeScript Services** (Indexer, Transaction Builder):
- Framework: **Vitest** or **Jest**
- Config: `vitest.config.ts` or `jest.config.js`
- Location: `src/__tests__/` directories
- Pattern: `*.test.ts` or `*.spec.ts` files

**Rust Contracts**:
- Framework: Built-in Rust test module system
- Config: `#[cfg(test)]` modules in source files
- Pattern: `#[test]` attribute on test functions
- Execution: `cargo test`

**E2E Automation**:
- Framework: **Playwright** (recommended for browser automation)
- Location: `e2e/tests/` with `.ts` files
- Pattern: Automate existing scenario documentation
- Config: `playwright.config.ts`

## Data Types & Mocking Patterns

### Current Mocking

**No explicit mocking framework**, but patterns exist:

**API Mocking**:
- `off-chain/frontend/src/lib/api.ts` uses environment variables for API_BASE
- Can redirect to mock servers via `NEXT_PUBLIC_API_URL`

**Database Seeding**:
- `off-chain/transaction-builder/seed-frontend-test.ts` - Creates test data
- Manual database population for testing

**Devnet Integration**:
- `off-chain/frontend/src/components/DevnetContext.tsx` - Provides mock wallet for testing
- Allows local testing without real wallets

### Type Safety in Tests

**Patterns** (from source code):
- Strong typing with TypeScript interfaces
- Use same types from `off-chain/*/src/types.ts` for test data
- Example from types:
  ```typescript
  interface Campaign {
    campaignId: string;
    creator: string;
    fundingGoal: string;
    status: CampaignStatus;
  }
  ```

## Error Handling Coverage

### Contract-Level Validation

**Campaign Contract** (`contracts/campaign/src/main.rs`):
- ERROR_NO_SCRIPT (7)
- ERROR_LOAD_DATA (9)
- ERROR_INVALID_FINALIZATION (10)
- Validation of funding_goal, deadline_block, total_pledged, status

**Pledge Contract** (`contracts/pledge/src/main.rs`):
- ERROR_NO_SCRIPT (7)
- ERROR_LOAD_DATA (9)
- ERROR_MODIFICATION_NOT_ALLOWED (10)
- Validation of campaign_id, backer_lock_hash, amount

**Tested Via**: E2E scenarios and contract execution

### TypeScript Error Handling

**Patterns** (from codebase):
- Try-catch blocks in async functions
- HTTP status code checks before data access
- Graceful fallbacks for failures
- Example (api.ts):
  ```typescript
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.statusText}`);
  }
  ```

**Tested Via**: Manual testing and error scenario validation

## Test Environment Configuration

### Network Support

**Supported Networks** (in code):
- Devnet (local CKB development)
- Testnet (CKB public testnet)
- Mainnet (production)

**Configuration**:
- `off-chain/frontend/src/components/DevnetContext.tsx`
- Network switching via context provider
- Signer abstraction for different wallet types

### Database Testing

**SQLite Database**:
- Path: `off-chain/indexer/src/database.ts`
- Test database location: Configurable via constructor (`./data/indexer.db`)
- Schema validation: Table creation with `CREATE TABLE IF NOT EXISTS`
- Migration support: `migrate()` method for schema updates

## Documentation & Scripts

### Helper Scripts

**Transaction Builder Test Scripts**:
- `off-chain/transaction-builder/test-create-campaign.ts` - Create test campaigns
- `off-chain/transaction-builder/test-transactions.ts` - Execute test transactions
- `off-chain/transaction-builder/test-lifecycle.ts` - Full lifecycle testing
- `off-chain/transaction-builder/seed-frontend-test.ts` - Seed test data

**Execution**: Via ts-node (requires Node.js dev environment)

### E2E Documentation

**Scenario Files**:
- Format: Markdown with detailed steps
- Include: Preconditions, actions, expected results
- Coverage: 5 major scenarios covering happy path and edge cases
- Location: `e2e/scenario-*.md`

## Summary

| Aspect | Status | Details |
|--------|--------|---------|
| Unit Testing | Not Implemented | No Jest/Vitest config found |
| Integration Testing | Partial (Manual) | Transaction scripts available |
| E2E Testing | Manual/Documented | Scenario-based docs in `e2e/` |
| Component Testing | Not Implemented | No React Testing Library |
| Contract Testing | On-chain Validation | Through transaction execution |
| CI/CD | Not Implemented | No GitHub Actions or pipelines |
| Code Linting | Partial | ESLint for frontend only |
| Coverage Reporting | Not Implemented | No coverage tools |
| Mocking | Pattern-based | API redirection, devnet context |
| Test Data | Manual | Seeding scripts available |

## File Locations Summary

- Scenario documentation: `e2e/scenario-*.md`
- E2E README: `e2e/README.md`
- Test scripts: `off-chain/transaction-builder/test-*.ts`
- Data seeding: `off-chain/transaction-builder/seed-frontend-test.ts`
- Contract tests: Implicit (via on-chain validation)
- Frontend components: `off-chain/frontend/src/components/` and `off-chain/frontend/src/app/`
- Type definitions: `off-chain/*/src/types.ts`
- Testing configuration: Minimal (no formal test runners configured)
