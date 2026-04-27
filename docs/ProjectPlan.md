# Decentralized Kickstarter on CKB - Project Plan

## Project Overview

A decentralized crowdfunding platform on Nervos CKB blockchain, enabling trustless campaign creation, pledging, and automatic fund distribution based on campaign success/failure.

**Target:** MVP launch to qualify for CKB Community Fund DAO grant

---

## MVP Scope

### Core Features
1. Campaign creation with funding goal and block-height deadline
2. Pledge functionality with locked funds
3. Automatic state resolution (success/failure)
4. Fund claiming for successful campaigns (creators)
5. Refund claiming for failed campaigns (backers)
6. Campaign discovery and listing UI
7. Real-time campaign progress tracking

### Technical Stack
- **Blockchain:** Nervos CKB
- **On-chain Logic:** Type Scripts (Rust/C)
- **Off-chain:** TypeScript with Lumos framework
- **Frontend:** React/Next.js (recommended)
- **Token:** CKB native token only

### Funding Model
- All-or-nothing (Kickstarter style)
- Pledges locked until campaign resolution
- Block-height based deadlines
- No campaign modifications after launch

---

## Architecture Overview

### On-Chain Components

#### 1. Campaign Cell
```
Capacity: Variable (holds pledged funds)
Lock Script: Campaign Lock (controls fund release)
Type Script: Campaign Type (validates state transitions)
Data:
  - creator_lock_hash
  - funding_goal (amount in CKB)
  - deadline_block
  - total_pledged
  - status (active/successful/failed)
  - metadata_hash (links to off-chain description)
```

#### 2. Pledge Cell
```
Capacity: Pledge amount + storage
Lock Script: Pledge Lock (allows refund or transfer to creator)
Type Script: Pledge Type (links to campaign)
Data:
  - campaign_id (hash of campaign cell)
  - backer_lock_hash
  - amount
  - timestamp_block
```

#### 3. Campaign Type Script
**Validates:**
- Campaign creation (valid parameters, sufficient capacity)
- Pledge additions (campaign still active, valid amounts)
- Campaign finalization (deadline reached, goal met/not met)
- Fund claiming (only creator if successful, only backers if failed)

### Off-Chain Components

#### 1. Frontend Application
- Campaign creation form
- Campaign listing/browsing
- Campaign detail page with progress bar
- Pledge/contribution interface
- User dashboard (campaigns created, campaigns backed)
- Claim funds/refunds interface

#### 2. Indexer Service
- Monitors CKB blockchain for campaign/pledge cells
- Aggregates campaign statistics
- Provides API for frontend queries
- Caches IPFS metadata

#### 3. Metadata Storage
- IPFS for campaign descriptions, images, updates
- On-chain stores only IPFS hash for immutability

---

## Detailed Task Breakdown

### Phase 1: Project Setup & Research (Week 1)

#### Task 1.1: Development Environment Setup
- [ ] Install CKB node (testnet)
- [ ] Install CKB-CLI
- [ ] Set up Rust development environment
- [ ] Install Capsule (CKB script development framework)
- [ ] Set up TypeScript/Node.js environment
- [ ] Install Lumos SDK
- [ ] Create project repository structure
- [ ] Set up version control (Git)

#### Task 1.2: CKB Fundamentals Study
- [ ] Review CKB cell model documentation
- [ ] Study Lock Script vs Type Script differences
- [ ] Understand CKB transaction structure
- [ ] Review capacity calculation mechanisms
- [ ] Study existing CKB dApps as reference
- [ ] Learn Lumos transaction building

#### Task 1.3: Architecture Documentation
- [ ] Finalize cell structure design
- [ ] Document state machine (campaign lifecycle)
- [ ] Design transaction flow diagrams
- [ ] Define error handling strategy
- [ ] Create security considerations document

---

### Phase 2: Smart Contract Development (Weeks 2-4)

#### Task 2.1: Campaign Type Script Development
**Priority: HIGH**

- [ ] Set up Capsule project for Campaign Type Script
- [ ] Define campaign data structure (encoding/decoding)
- [ ] Implement campaign creation validation
  - [ ] Validate funding goal > 0
  - [ ] Validate deadline > current block
  - [ ] Validate creator lock hash
  - [ ] Validate initial capacity
- [ ] Implement pledge acceptance logic
  - [ ] Verify campaign is active
  - [ ] Verify deadline not passed
  - [ ] Update total_pledged counter
- [ ] Implement campaign finalization logic
  - [ ] Check deadline reached
  - [ ] Check if goal met
  - [ ] Update status accordingly
- [ ] Implement fund claiming validation
  - [ ] For successful campaigns: only creator can claim
  - [ ] For failed campaigns: only backers can claim refunds
  - [ ] Prevent double claiming
- [ ] Write unit tests for all validation logic
- [ ] Optimize for gas efficiency

#### Task 2.2: Pledge Type Script Development
**Priority: HIGH**

- [ ] Set up Capsule project for Pledge Type Script
- [ ] Define pledge data structure
- [ ] Link pledge to specific campaign (campaign_id)
- [ ] Validate pledge creation
  - [ ] Verify campaign exists and is active
  - [ ] Verify pledge amount > minimum
  - [ ] Record backer information
- [ ] Implement pledge claiming/refund logic
  - [ ] Verify campaign has ended
  - [ ] Verify backer identity
  - [ ] Calculate refund amount
- [ ] Write unit tests
- [ ] Test integration with Campaign Type Script

#### Task 2.3: Lock Scripts Development
**Priority: MEDIUM**

- [ ] Campaign Lock Script (controls when funds can be moved)
  - [ ] Allow creator withdrawal only if campaign successful
  - [ ] Allow backer refunds only if campaign failed
- [ ] Pledge Lock Script (simpler, delegates to Type Script)
- [ ] Test lock script logic
- [ ] Security audit of lock conditions

#### Task 2.4: Contract Testing & Deployment
**Priority: HIGH**

- [ ] Integration testing on CKB testnet
- [ ] Test full campaign lifecycle (create → pledge → success → claim)
- [ ] Test failure scenario (create → pledge → fail → refund)
- [ ] Test edge cases (zero pledges, exact goal, over-funding)
- [ ] Stress test with multiple concurrent campaigns
- [ ] Deploy to CKB testnet
- [ ] Document contract addresses and code hashes
- [ ] Prepare deployment scripts for mainnet

---

### Phase 3: Off-Chain Infrastructure (Weeks 4-6)

#### Task 3.1: Indexer Service Development
**Priority: HIGH**

- [ ] Set up Node.js/TypeScript project
- [ ] Integrate CKB indexer library
- [ ] Implement campaign cell indexing
  - [ ] Listen for new campaign cells
  - [ ] Parse campaign data
  - [ ] Store in database (PostgreSQL/MongoDB)
- [ ] Implement pledge cell indexing
  - [ ] Track pledges per campaign
  - [ ] Calculate running totals
  - [ ] Track backer information
- [ ] Implement campaign status monitoring
  - [ ] Check block height vs deadline
  - [ ] Update campaign status automatically
- [ ] Create REST API endpoints
  - [ ] GET /campaigns (list all, with filters)
  - [ ] GET /campaigns/:id (single campaign details)
  - [ ] GET /campaigns/:id/pledges (pledges for campaign)
  - [ ] GET /user/:address/campaigns (user's created campaigns)
  - [ ] GET /user/:address/pledges (user's pledges)
- [ ] Implement WebSocket for real-time updates
- [ ] Add caching layer (Redis)
- [ ] Write API documentation

#### Task 3.2: IPFS Integration
**Priority: MEDIUM**

- [ ] Set up IPFS node or use Pinata/Web3.Storage
- [ ] Create metadata schema for campaigns
  ```json
  {
    "title": "Campaign Title",
    "description": "Full description",
    "image": "ipfs://...",
    "category": "Technology",
    "risks": "Potential risks...",
    "timeline": "Project timeline..."
  }
  ```
- [ ] Implement upload functionality
- [ ] Implement retrieval and caching
- [ ] Handle IPFS gateway fallbacks

#### Task 3.3: Transaction Builder Service
**Priority: HIGH**

- [ ] Set up Lumos integration
- [ ] Implement campaign creation transaction builder
  - [ ] Collect inputs (creator's cells)
  - [ ] Build campaign cell with proper structure
  - [ ] Handle capacity calculations
  - [ ] Sign and submit transaction
- [ ] Implement pledge transaction builder
  - [ ] Collect backer's cells
  - [ ] Create pledge cell
  - [ ] Update campaign cell (increment total_pledged)
  - [ ] Handle capacity requirements
- [ ] Implement claim transaction builder (success case)
  - [ ] Verify campaign status
  - [ ] Transfer all pledged funds to creator
  - [ ] Clean up campaign cell
- [ ] Implement refund transaction builder (failure case)
  - [ ] Verify campaign status
  - [ ] Return funds to individual backer
  - [ ] Handle partial refunds if needed
- [ ] Add transaction status tracking
- [ ] Implement error handling and retry logic
- [ ] Write integration tests

---

### Phase 4: Frontend Development (Weeks 6-8)

#### Task 4.1: Project Setup
**Priority: HIGH**

- [ ] Initialize React/Next.js project
- [ ] Set up Tailwind CSS or UI framework
- [ ] Configure routing
- [ ] Set up state management (Context API or Zustand)
- [ ] Integrate wallet connection (CKB wallet)
- [ ] Set up API client (axios/fetch)

#### Task 4.2: Core Pages & Components

**4.2.1: Campaign Creation Page**
- [ ] Create campaign form component
  - [ ] Title input
  - [ ] Description editor (rich text)
  - [ ] Funding goal input (CKB amount)
  - [ ] Duration selector (blocks → show estimated days)
  - [ ] Category selector
  - [ ] Image upload
- [ ] Form validation
- [ ] IPFS upload integration
- [ ] Transaction building and signing
- [ ] Success/error handling
- [ ] Preview mode

**4.2.2: Campaign Listing Page**
- [ ] Campaign card component
  - [ ] Title, image, progress bar
  - [ ] Goal amount, raised amount
  - [ ] Time remaining (blocks → days/hours)
  - [ ] Status badge (active/successful/failed)
- [ ] Grid/list layout
- [ ] Filtering (by status, category)
- [ ] Sorting (newest, ending soon, most funded)
- [ ] Pagination or infinite scroll
- [ ] Search functionality

**4.2.3: Campaign Detail Page**
- [ ] Campaign header (title, image, creator)
- [ ] Progress visualization
  - [ ] Progress bar
  - [ ] Amount raised / goal
  - [ ] Number of backers
  - [ ] Time remaining countdown
- [ ] Full description display
- [ ] Pledge section
  - [ ] Amount input
  - [ ] Pledge button
  - [ ] Wallet connection prompt
- [ ] Backer list (optional, show top backers)
- [ ] Transaction history
- [ ] Share buttons

**4.2.4: User Dashboard**
- [ ] Wallet connection status
- [ ] "My Campaigns" section
  - [ ] List of created campaigns
  - [ ] Status indicators
  - [ ] Claim funds button (for successful campaigns)
- [ ] "My Pledges" section
  - [ ] List of backed campaigns
  - [ ] Status of each
  - [ ] Claim refund button (for failed campaigns)
- [ ] Transaction history
- [ ] Account balance (CKB)

**4.2.5: Claim/Refund Interface**
- [ ] For creators: Claim funds from successful campaigns
  - [ ] Show claimable amount
  - [ ] One-click claim transaction
  - [ ] Transaction status tracking
- [ ] For backers: Claim refunds from failed campaigns
  - [ ] Show refund amount
  - [ ] One-click refund transaction
  - [ ] Batch refund if backed multiple failed campaigns

#### Task 4.3: Wallet Integration
**Priority: HIGH**

- [ ] Integrate JoyID or Nexus wallet
- [ ] Implement wallet connection flow
- [ ] Handle account switching
- [ ] Display connected address
- [ ] Sign transactions through wallet
- [ ] Handle wallet errors gracefully

#### Task 4.4: UI/UX Polish
**Priority: MEDIUM**

- [ ] Loading states for all async operations
- [ ] Error messages (user-friendly)
- [ ] Success confirmations
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Accessibility (WCAG guidelines)
- [ ] Animation and transitions
- [ ] Empty states (no campaigns, no pledges)
- [ ] Tooltips for blockchain-specific terms

---

### Phase 5: Testing & Quality Assurance (Week 9)

#### Task 5.1: End-to-End Testing
**Priority: HIGH**

- [ ] Test full user flow: create campaign
- [ ] Test full user flow: make pledge
- [ ] Test full user flow: successful campaign → claim funds
- [ ] Test full user flow: failed campaign → claim refund
- [ ] Test wallet connection and signing
- [ ] Test with multiple users simultaneously
- [ ] Test edge cases
  - [ ] Campaign with zero pledges
  - [ ] Campaign that exactly meets goal
  - [ ] Campaign that exceeds goal
  - [ ] Multiple pledges from same user
  - [ ] Pledging to expired campaign (should fail)

#### Task 5.2: Security Audit
**Priority: CRITICAL**

- [ ] Review smart contract code for vulnerabilities
  - [ ] Reentrancy risks
  - [ ] Integer overflow/underflow
  - [ ] Access control issues
- [ ] Review transaction building logic
- [ ] Test for front-running scenarios
- [ ] Verify capacity calculations prevent cell exhaustion
- [ ] Check for potential griefing attacks
- [ ] Document security considerations

#### Task 5.3: Performance Testing
**Priority: MEDIUM**

- [ ] Load test indexer API
- [ ] Test with large number of campaigns (100+)
- [ ] Test with campaigns having many pledges (1000+)
- [ ] Optimize database queries
- [ ] Implement API rate limiting
- [ ] Test IPFS retrieval performance

#### Task 5.4: User Acceptance Testing
**Priority: HIGH**

- [ ] Recruit beta testers from CKB community
- [ ] Prepare test scenarios and instructions
- [ ] Deploy to testnet for public testing
- [ ] Collect feedback via forms/surveys
- [ ] Document bugs and feature requests
- [ ] Iterate based on feedback

---

### Phase 6: Documentation & Deployment (Week 10)

#### Task 6.1: User Documentation
**Priority: HIGH**

- [ ] Write "Getting Started" guide
- [ ] Create campaign creator guide
  - [ ] How to create a campaign
  - [ ] Best practices for success
  - [ ] How to claim funds
- [ ] Create backer guide
  - [ ] How to browse campaigns
  - [ ] How to make pledges
  - [ ] How to claim refunds
- [ ] FAQ section
- [ ] Video tutorials (optional but recommended)
- [ ] Troubleshooting guide

#### Task 6.2: Developer Documentation
**Priority: MEDIUM**

- [ ] Smart contract documentation
  - [ ] Cell structures
  - [ ] Validation rules
  - [ ] State machine diagram
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Architecture diagrams
- [ ] Setup and deployment guide
- [ ] Contributing guide (if open source)
- [ ] Code comments and inline documentation

#### Task 6.3: Mainnet Deployment
**Priority: CRITICAL**

- [ ] Final security review
- [ ] Deploy smart contracts to CKB mainnet
- [ ] Deploy indexer service to production server
- [ ] Deploy frontend to hosting (Vercel/Netlify)
- [ ] Configure production database
- [ ] Set up monitoring and alerts
  - [ ] Server uptime monitoring
  - [ ] Transaction monitoring
  - [ ] Error tracking (Sentry)
- [ ] Set up backup systems
- [ ] Configure CDN for frontend assets
- [ ] Set up domain and SSL certificate

#### Task 6.4: Launch Preparation
**Priority: HIGH**

- [ ] Create landing page with value proposition
- [ ] Prepare announcement posts
  - [ ] CKB Talk forum
  - [ ] Twitter/X
  - [ ] Discord/Telegram
- [ ] Create demo video
- [ ] Prepare press kit
- [ ] Reach out to CKB community leaders
- [ ] Plan launch event/AMA

---

### Phase 7: Grant Application & Post-Launch (Week 11+)

#### Task 7.1: Community Fund DAO Grant Application
**Priority: HIGH**

- [ ] Review grant application requirements
- [ ] Prepare grant proposal document
  - [ ] Project overview and vision
  - [ ] Technical architecture
  - [ ] MVP demonstration
  - [ ] Roadmap for future features
  - [ ] Budget breakdown
  - [ ] Team introduction
  - [ ] Community benefit analysis
- [ ] Prepare demo video/presentation
- [ ] Gather community testimonials
- [ ] Submit application
- [ ] Present to DAO if required

#### Task 7.2: Post-Launch Monitoring
**Priority: HIGH**

- [ ] Monitor for bugs and issues
- [ ] Track user metrics
  - [ ] Number of campaigns created
  - [ ] Total pledges made
  - [ ] Success rate of campaigns
  - [ ] User retention
- [ ] Collect user feedback
- [ ] Respond to support requests
- [ ] Fix critical bugs immediately
- [ ] Plan hotfixes and patches

#### Task 7.3: Community Building
**Priority: MEDIUM**

- [ ] Create social media accounts
- [ ] Set up Discord/Telegram community
- [ ] Regular updates and announcements
- [ ] Feature successful campaigns
- [ ] Engage with users and creators
- [ ] Build partnerships with other CKB projects

---

## Post-MVP Roadmap (For Grant Proposal)

### v1.1: Trustless Automatic Fund Distribution (Priority: Critical)

**Problem:** In the MVP, backers must manually release funds to the creator (on success) or claim refunds (on failure). This creates a critical dependency — a single unresponsive backer can block the creator from receiving funds, and an unresponsive creator can delay refunds by not finalizing.

**Solution:** Custom Pledge Lock Script that enforces fund distribution based on on-chain campaign status, removing the need for backer/creator cooperation.

#### Custom Pledge Lock Script (Rust, RISC-V)
- New lock script for pledge cells replaces standard secp256k1 lock
- On **campaign success**: anyone can spend the pledge cell, but the lock script validates that the output goes to the creator's lock script (stored in campaign cell data)
- On **campaign failure**: anyone can spend the pledge cell, but the lock script validates that the output goes back to the backer's lock script (stored in pledge cell data)
- While **campaign is active**: pledge cell is locked (no one can spend it)
- Lock script reads campaign cell status via cell deps to determine which path is valid

#### Automated Finalization
- Anyone can finalize an expired campaign (not just the creator) — removes creator as bottleneck
- Optionally: batch finalize + release/refund in a single transaction

#### Automation Service (Optional)
- Background bot that watches for finalized campaigns and submits release/refund transactions
- No private keys needed — the custom lock script controls where funds go, the bot just triggers the transactions
- Fallback: any user can trigger release/refund from the UI for any campaign (not just their own)

#### UI/UX Changes
- "Release to Creator" / "Claim Refund" buttons become "Trigger Release" / "Trigger Refund" — callable by anyone
- Pre-wallet confirmation step showing exact CKB amount before wallet popup
- Batch release/refund: one-click to process all pledges for a campaign

#### Migration Path
- New pledge lock script deployed alongside existing contracts
- New campaigns use the custom lock script; old campaigns continue with manual flow
- No changes to campaign type script or pledge type script

**Why this matters for the grant:** This is the single most important upgrade for making the platform trustless. Without it, the platform requires cooperation between parties, which defeats the purpose of a decentralized crowdfunding platform. Grant reviewers will likely ask about this — the answer is that the MVP validates the core flow, and v1.1 makes it fully trustless with a custom lock script.

### v1.2: Enhanced Features
- Campaign cancellation by creator (with refunds)
- Campaign editing (limited, before first pledge)
- Creator verification badges
- Campaign categories and tagging
- Advanced search and filtering
- Pre-wallet confirmation dialog showing exact CKB amounts
- Early finalization — allow creator to finalize before deadline (e.g., goal already met)

### v1.3: Multi-Token Support
- sUDT integration (stablecoins like USDT/USDC)
- Token selection during campaign creation
- Multi-currency display in UI

### v2.0: Advanced Functionality
- Milestone-based fund release
  - Creators set milestones
  - Backers vote to release funds per milestone
- Stretch goals
- NFT rewards via Spore protocol
- .bit integration for creator identity
- Creator reputation system

### v2.5: DeFi Integration
- Yield farming for pledged funds (before campaign ends)
- Liquidity mining rewards for active users
- Governance token for platform decisions

### v3.0: Cross-Chain
- Bitcoin RGB++ integration
- Ethereum bridge for cross-chain pledges
- Multi-chain campaign visibility

---

## Success Metrics

### MVP Launch
- [ ] 10+ campaigns created in first week
- [ ] 50+ pledges made in first month
- [ ] At least 3 campaigns successfully funded
- [ ] Zero critical security incidents
- [ ] 90%+ uptime

### Grant Qualification
- [ ] Working MVP deployed on mainnet
- [ ] Active user base (50+ unique users)
- [ ] Positive community feedback
- [ ] Clear roadmap for future development
- [ ] Open source code (recommended)

---

## Risk Management

### Technical Risks
- **Smart contract bugs:** Extensive testing, security audits, gradual rollout
- **CKB capacity exhaustion:** Careful capacity calculation, reserve funds
- **Indexer downtime:** Redundant infrastructure, backup systems
- **IPFS content unavailability:** Multiple gateway fallbacks, local caching

### Product Risks
- **Low user adoption:** Marketing, community engagement, creator incentives
- **Campaign fraud:** Verification systems, reputation scores, reporting
- **Regulatory concerns:** Clear ToS, compliance research, legal counsel

### Operational Risks
- **Key team member unavailable:** Documentation, code comments, knowledge sharing
- **Funding shortage:** Bootstrap with minimal infrastructure, apply for grants early
- **Competition:** Focus on unique CKB features, community engagement

---

## Resources & References

### CKB Documentation
- [CKB Docs](https://docs.nervos.org/)
- [Lumos Documentation](https://github.com/ckb-js/lumos)
- [Capsule Framework](https://github.com/nervosnetwork/capsule)

### Example Projects
- [CKB dApp Examples](https://github.com/nervosnetwork/docs.nervos.org/blob/develop/docs/essays/dapps.md)
- Look for existing CKB crowdfunding or governance projects

### Community
- [CKB Talk Forum](https://talk.nervos.org/)
- [Nervos Discord](https://discord.gg/nervos)
- [CKB Dev Telegram](https://t.me/nervosnetwork)

### Tools
- [CKB Explorer](https://explorer.nervos.org/)
- [Neuron Wallet](https://github.com/nervosnetwork/neuron)
- [JoyID Wallet](https://joy.id/)

---

## Next Steps

1. **Immediate (This Week):**
   - Set up development environment
   - Create project repository
   - Begin Phase 1 tasks

2. **Short-term (Next 2 Weeks):**
   - Complete CKB fundamentals study
   - Finalize architecture design
   - Start smart contract development

3. **Medium-term (Month 1-2):**
   - Complete on-chain logic
   - Deploy to testnet
   - Begin off-chain development

4. **Long-term (Month 3):**
   - Complete MVP
   - Deploy to mainnet
   - Apply for grant

---

## Implementation Progress

### Completed

#### Environment & Setup (Plan Phases 1)
- [x] OffCKB local devnet (instead of testnet — faster iteration)
- [x] Rust + riscv64 cross-compilation for on-chain contracts
- [x] TypeScript + CCC library (instead of Lumos — modern CKB SDK)
- [x] Next.js frontend with Tailwind CSS
- [x] Git repository with monorepo structure

#### Smart Contracts (Plan Phases 2)
- [x] **Campaign Type Script** (`contracts/campaign/src/main.rs`)
  - Creation validation (GroupInput=0, GroupOutput=1)
  - Finalization validation (Active → Success/Failed, immutable fields check)
  - Destruction allowed (lock script guards spending)
- [x] **Pledge Type Script** (`contracts/pledge/src/main.rs`)
  - Creation validation (data structure, campaign reference)
  - Destruction allowed (enables refund and release)
  - Modification rejected (pledges are immutable)
- [x] Contracts built for RISC-V, deployed to devnet

**Key design decisions:**
- No custom lock scripts — standard secp256k1 locks are used (backer owns pledge cell → trustless refund). Planned for v1.1: custom pledge lock script for automatic fund distribution (see Post-MVP Roadmap)
- `total_pledged` is always 0 on-chain; real total computed off-chain by indexer
- Finalization does NOT enforce total_pledged vs funding_goal on-chain (off-chain check only)
- Campaign lifecycle: Active → (finalize) → Success/Failed → (destroy) → consumed

#### Transaction Builder (Plan Phase 3.3)
- [x] `createCampaign()` — builds campaign cell with type script
- [x] `createPledge()` — builds pledge cell linked to campaign
- [x] `finalizeCampaign()` — consumes old campaign, creates finalized cell
- [x] `refundPledge()` — consumes pledge, returns CKB to backer
- [x] `releasePledgeToCreator()` — consumes pledge, sends CKB to creator
- [x] CLI lifecycle tests (`test-lifecycle.ts`, `seed-frontend-test.ts`)

#### Indexer (Plan Phase 3.1)
- [x] In-memory indexer using CCC `findCells` (no database yet)
- [x] Campaign + pledge cell indexing with live-cell tracking
- [x] REST API: `/campaigns`, `/campaigns/:id`, `/campaigns/:id/pledges`, `/pledges/backer/:lockHash`, `/tip`
- [x] `effectiveStatus` computation (active, expired_success, expired_failed, success, failed)
- [x] `originalTxHash` tracking for finalized campaigns (pledge linkage after cell outPoint changes)
- [x] Stale data cleanup (maps cleared before re-indexing)

#### Frontend (Plan Phase 4)
- [x] Campaign listing page with progress bars, status badges
- [x] Campaign detail page with funding stats
- [x] Pledge form (amount input, wallet signing)
- [x] Finalize Campaign button (creator, expired Active campaigns)
- [x] Claim Refund button (backer, Failed campaigns)
- [x] Release to Creator button (backer, Success campaigns)
- [x] Devnet mode with auto-connected test accounts
- [x] Polling-based redirect after finalization (replaces fragile timeout)

#### Testing (Plan Phase 5.1 — partial)
- [x] CLI lifecycle test: create → pledge → finalize (success + failure) → refund/release
- [x] Frontend UI test: all 4 flows manually verified on devnet
  - Submit pledge → progress bar updates, pledge appears
  - Finalize campaign → redirects to finalized page with "Funded" status
  - Claim refund → pledge consumed, CKB returned
  - Release to creator → pledge consumed, CKB sent to creator

#### Campaign Metadata (Phase 9)
- [x] Variable-length metadata (title + description) appended after 65-byte campaign cell header
- [x] No contract changes needed (contract only reads first 65 bytes)
- [x] Serializer: `serializeMetadata()` / `getMetadataSize()` for encoding (u16 LE length-prefixed UTF-8)
- [x] Indexer parser: backward-compatible metadata decoding
- [x] Frontend: title/description form fields, displayed on cards and detail pages
- [x] Metadata preserved during finalization (re-serialized into new cell)
- [x] Seed script: cleanup of existing devnet data + sample titles/descriptions

#### UI Polish & UX (Phase 10)
- [x] 6 new utility functions: `getEffectiveStatusLabel`, `getEffectiveStatusColor`, `blocksToTimeEstimate`, `blockToRelativeTime`, `getUniqueBackerCount`, `truncateText`
- [x] Toast notification system (`ToastProvider`, `useToast()` hook, 4 types, auto-dismiss)
- [x] Skeleton loading components (`SkeletonLine`, `SkeletonCard`, `SkeletonDetailPage`)
- [x] Campaign cards: 2-line description preview, effective status badges (5 states), time remaining, backer count
- [x] Home page: parallel fetch (campaigns + pledges + block), skeleton loading, 30s auto-refresh
- [x] Detail page: collapsible campaign ID with copy, backer count heading, relative times, sortable pledges (Recent/Amount), skeleton loading, 15s auto-refresh
- [x] Create form: required title with inline error, character counters (orange near limit), goal >= 100 CKB, deadline > current block, toast notifications
- [x] Polling loops replace all `setTimeout` calls (pledge, refund, release, campaign creation)
- [x] Transaction progress indicator (Submitted → Pending → Confirmed)
- [x] Responsive: mobile-first pledge form reorder, responsive header, touch targets (min-h-44px)
- [x] Devnet account switcher dropdown in header (no restart needed), balance display (15s refresh)
- [x] Wallet error detection ("rejected"/"disconnected" → friendly toast)

#### Production Readiness (Phase 11)
- [x] **Campaign Destruction Flow** (`off-chain/transaction-builder/src/builder.ts`, `types.ts`)
  - `destroyCampaign()` method — consumes finalized campaign cell, returns CKB to creator (no type script output)
  - `DestroyCampaignParams` interface added to types
  - Frontend: "Destroy Campaign & Reclaim CKB" button (visible when creator, campaign finalized, no pledges remain)
- [x] **SQLite-Backed Indexer** (`off-chain/indexer/src/database.ts`, `indexer.ts`, `api.ts`, `index.ts`)
  - `database.ts` — SQLite wrapper (better-sqlite3) with `campaigns`, `pledges`, `indexer_state` tables
  - Atomic `replaceLiveCells()` — deletes all + inserts new in single transaction
  - Background polling every 10s (`startBackgroundIndexing` / `stopBackgroundIndexing`)
  - API routes no longer call RPC per request — reads from DB
  - Graceful shutdown: stops polling + closes DB
  - Configurable via env vars: `DB_PATH`, `POLL_INTERVAL`
- [x] **Code Cleanup & Deduplication**
  - `off-chain/frontend/src/lib/serialization.ts` — shared `u64ToHexLE()`, `u16ToHexLE()`, `serializeMetadataHex()`
  - Removed duplicate definitions from `campaigns/[id]/page.tsx` and `campaigns/new/page.tsx`
  - Added `// DEVNET ONLY` warnings on hardcoded private keys in `constants.ts`
- [x] **Security Review** (`docs/SecurityReview.md`)
  - 5 findings documented with risk levels and resolutions
  - Contract validation summary table
  - Production recommendations
- [x] **Documentation** (`docs/UserGuide.md`, `docs/DeveloperGuide.md`)
  - User guide: all flows step-by-step, devnet testing tips
  - Developer guide: architecture, contract build/deploy, API reference, env vars

### Not Yet Implemented
- [x] **Custom Pledge Lock Script** for automatic fund distribution (v1.1) — completed in Phase 15
- [x] **Security hardening** — all 6 Officeyutong review issues fixed in Phase 16
- [ ] IPFS integration for off-chain metadata storage (images, rich text)
- [x] Real wallet integration (JoyID via CCC connector) — verified on testnet
- [ ] User dashboard (my campaigns, my pledges)
- [x] Testnet deployment — contracts, indexer (Render), frontend (Vercel)
- [x] Testnet redeployment with Phase 16 hardened contracts — deployed 2026-04-20
- [ ] Mainnet deployment
- [ ] Grant application
- [x] Automatic finalization bot (Phase 17) — completed 2026-04-24, devnet-tested 2026-04-27 (10 bugs fixed)
- [ ] Bot testnet deployment (Phase 17.6) — next step: tsc build, fund bot wallet, deploy to Render
- [ ] External security audit (~1100 lines Rust — recommended by Officeyutong)

---

## Next Steps

### Phase 9: Campaign Metadata ✓
Completed. Title and description stored on-chain as variable-length metadata appended after the 65-byte campaign cell header. No contract changes required.

### Phase 10: UI Polish & UX ✓
Completed. All 6 sub-phases implemented and browser-tested.

#### 10.1: Campaign Card Improvements ✓
- [x] Show truncated description preview (2 lines) on listing cards
- [x] Better status badges — 5 distinct states (Active/blue, Expired-Funded/yellow, Expired-Needs Finalization/orange, Funded/green, Failed/red)
- [x] Show time remaining estimate (blocks remaining → "~5m left", "~2h left", "~3 days left")
- [x] Show backer count on cards

#### 10.2: Campaign Detail Page Polish ✓
- [x] Show campaign ID below the title (collapsible/copy-to-clipboard)
- [x] Add backer count alongside pledge list heading ("Pledges (5) from 3 backers")
- [x] Show "Created at block #X (~2 hours ago)" as relative time
- [x] Improve pledge list — relative time per pledge, sortable by Recent/Amount

#### 10.3: Form Validation & Error Handling ✓
- [x] Require title on campaign creation (inline error on blur and submit)
- [x] Character counter for title (X/200) and description (X/2000), orange near limit
- [x] Validate funding goal >= 100 CKB with descriptive inline error
- [x] Validate deadline block > current block with live block display as helper text
- [x] Replace raw error messages with toast notifications

#### 10.4: Loading & Refresh UX ✓
- [x] Replace all `setTimeout` refreshes with polling loops (pledge, refund, release, create)
- [x] Add loading skeletons for campaign cards and detail page
- [x] Show transaction status progress (Submitted → Pending → Confirmed)
- [x] Auto-refresh: 30s on home page, 15s on detail page

#### 10.5: Responsive Design & Layout ✓
- [x] Mobile-friendly campaign cards (single column, tighter padding)
- [x] Responsive detail page (pledge form first on mobile via order-first/lg:order-last)
- [x] Touch-friendly buttons (min-h-[44px])
- [x] Responsive header (gap-3 sm:gap-8, smaller text, flex-wrap)

#### 10.6: Wallet Integration ✓
- [x] Devnet account switcher dropdown in header (no app restart needed)
- [x] Display connected account balance (refreshed every 15s)
- [x] Graceful handling of wallet disconnection/rejection ("Transaction was cancelled" toast)
- [ ] Real wallet connector (JoyID, MetaMask Snap) — already works via CCC connector, not separately tested

### Phase 11: Production Readiness ✓
Completed. All 4 sub-phases implemented.

#### 11.1: Campaign Destruction Flow ✓
- [x] `destroyCampaign()` in transaction builder (consumes campaign cell, plain CKB output to creator)
- [x] "Destroy Campaign & Reclaim CKB" button in frontend (visible when creator, finalized, no pledges)
- [x] Polls until campaign disappears, then redirects to home

#### 11.2: Database-Backed Indexer ✓
- [x] SQLite via `better-sqlite3` (zero infrastructure, single file DB)
- [x] Background polling every 10s (configurable via `POLL_INTERVAL` env var)
- [x] API reads from DB — no more blocking RPC calls per HTTP request
- [x] Data persists across restarts (serves stale data immediately while refreshing)
- [x] Graceful shutdown (stop polling + close DB)

#### 11.3: Security Review + Code Cleanup ✓
- [x] Shared `serialization.ts` module (deduplicated from 2 pages)
- [x] `// DEVNET ONLY` warnings on private keys
- [x] `docs/SecurityReview.md` — 5 findings, risk levels, accepted trade-offs

#### 11.4: User Documentation ✓
- [x] `docs/UserGuide.md` — prerequisites, starting services, all flows, devnet testing
- [x] `docs/DeveloperGuide.md` — architecture, contract build/deploy, API reference, env vars

### Phase 12: End-to-End Test Suite (Devnet) ✓
All scenarios tested via `claude --chrome` browser automation against local devnet. Test scenario files in `e2e/`.

#### Scenario 1: Successful Campaign (Full Lifecycle) ✓
- [x] Create campaign → pledge (2x) → finalize as Success → release both pledges → destroy campaign

#### Scenario 2: Failed Campaign — Refund Flow ✓
- [x] Create campaign with high goal → small pledge → finalize as Failed → claim refund → destroy campaign

#### Scenario 3: Indexer Persistence ✓
- [x] Data survives indexer restart immediately (no delay), API response ~25ms from SQLite

#### Scenario 4: Edge Cases ✓
- [x] Exact goal match (200/200 = 100.0%)
- [x] Zero pledges → finalize as Failed → immediate destroy
- [x] Form validation (required title, goal >= 100 CKB, deadline > current block)
- [x] Duplicate backer pledges (2 pledges, 300 CKB total, 150.0% shown correctly)

#### Scenario 5: Campaign Destruction ✓
- [x] Destroy button hidden while pledges exist
- [x] Destroy button appears after all pledges released
- [x] Campaign removed from listing and direct URL after destruction

**Bug fixed during testing:** Progress percentage was capped at 100% — now shows real value (e.g. 150%) while bar width caps at 100%.

### Phase 13: Testnet Deployment (In Progress)

#### 13.1: Multi-Network Configuration ✓
- [x] `NEXT_PUBLIC_NETWORK` env var controls network selection (`devnet` | `testnet` | `mainnet`, default: `devnet`)
- [x] Per-network contract configs with env var overrides for tx hashes
- [x] Per-network RPC URLs (devnet → localhost, testnet → `ckbapp.dev`, mainnet → `ckbapp.dev`)
- [x] `createCkbClient(network, rpcUrl?)` factory replaces `createDevnetClient()` in both frontend and transaction-builder
- [x] `DevnetContext` is network-aware: creates private-key signer only on devnet, delegates to CCC wallet connector on testnet/mainnet
- [x] Dynamic header badge: Devnet (orange), Testnet (blue), Mainnet (green)
- [x] `DEVNET_ACCOUNTS` only populated when `IS_DEVNET` is true (private keys never loaded on testnet/mainnet)

#### 13.2: Creator Lock Script Resolution ✓
- [x] Indexer extracts creator's full lock script from `cell.cellOutput.lock` during indexing
- [x] Database: new columns `creator_lock_code_hash`, `creator_lock_hash_type`, `creator_lock_args` with auto-migration
- [x] API: returns `creatorLockScript` in campaign responses
- [x] Frontend: `resolveCreatorLockScript()` uses API data first, falls back to devnet account matching

#### 13.3: Deploy Script ✓
- [x] `scripts/deploy-contracts.ts` supports `CKB_NETWORK` and `DEPLOYER_PRIVATE_KEY` env vars
- [x] Waits for tx confirmation on testnet/mainnet (up to 120s)
- [x] Saves deployment artifacts to `deployment/deployed-contracts-{network}.json`
- [x] Prints env var instructions after non-devnet deployment

#### 13.4: Environment & Documentation ✓
- [x] `.env.example` for frontend and indexer
- [x] `docs/TestnetDeployment.md` — step-by-step testnet deployment guide
- [x] Old `devnetClient.ts` files removed (replaced by `ckbClient.ts`)

#### 13.5: Testnet Deployment & Testing ✓
- [x] Obtain testnet CKB from faucet
- [x] Deploy contracts to CKB testnet (Pudge)
- [x] Run full lifecycle test against testnet
- [x] Verify wallet connector works with real wallets (JoyID)

### Phase 14: Community Engagement & Feedback

#### 14.1: CKBuilder Project Submission ✓
- [x] Created issue on [CKBuilder-projects](https://github.com/Nervos-Community-Catalyst/CKBuilder-projects/issues/6) for technical review from CKB core devs
- [x] Detailed project overview, architecture, security review, and deployment info
- [x] Specific feedback requests on: custom pledge lock script design, on-chain deadline enforcement, campaign cell identity (TypeID), indexer infrastructure, batch operations
- [ ] Receive and incorporate technical feedback from reviewers

#### 14.2: Nervos Talk Writeup ✓
- [x] Write project announcement/writeup for [Nervos Talk](https://talk.nervos.org/)
- [x] Posted to CKB Development & Technical Discussion category (tags: CKB, dapp)
- [x] Include: project overview, demo link, architecture summary, roadmap, feedback questions
- [x] Created new testnet campaign with pledge for live screenshots
- [ ] Engage with community feedback
- [ ] Add screenshots and links to post once trust level allows

#### 14.3: External Validation ✓
- [x] Neon (CKB team member) tested deployed app on testnet — funded a campaign and created his own
- [x] Confirmed core flows work end-to-end with real wallet (JoyID)
- [x] Feedback aligned with v1.1 roadmap (custom lock script for trustless escrow)

### Phase 15: v1.1 — Trustless Automatic Fund Distribution

#### 15.1: On-Chain Contracts ✓
- [x] **Pledge Lock Script** (NEW) — Rust lock script enforcing trustless fund routing (330 lines)
  - 72-byte args: campaign_type_script_hash + deadline + backer_lock_hash
  - Since-based deadline enforcement (absolute block number)
  - Campaign cell_dep lookup with type script hash verification
  - 4 spending paths: release (success), refund (failure), fail-safe refund (no cell_dep), merge
  - MAX_FEE = 1 CKB prevents pledge draining
- [x] **Receipt Type Script** (NEW) — Backer proof-of-pledge (208 lines)
  - 40-byte cell data: pledge_amount + backer_lock_hash
  - Creation validation alongside matching pledge cell
  - Destruction validation during refund (amount match)
- [x] **Campaign Type Script Update** — Added TypeID for unforgeable identity
  - `check_type_id(0, 32)` as first validation step
  - CAMP-02 destruction protection documented (off-chain + fail-safe)
- [x] **Pledge Type Script Update** — Allow merge and partial refund patterns (136 lines added)
  - Merge: N inputs → 1 output, same campaign, capacity preserved
  - Partial refund: 1 input → 1 reduced output
  - Checked arithmetic for overflow safety
- [x] **Build System** — Updated `build-contracts.sh` for all 4 contracts
- [x] All 4 contracts compile with `cargo check --features library`

#### 15.2: Off-Chain Integration ✓
- [x] **Transaction Builder** — 4 new operations in existing builder.ts
  - `createPledgeWithReceipt` — pledge cell + receipt cell atomically
  - `permissionlessRelease` — anyone triggers, lock routes to creator
  - `permissionlessRefund` — consumes pledge + receipt, refunds to backer
  - `mergeContributions` — N pledge cells into 1
- [x] **Indexer Updates**
  - New `receipts` SQLite table with indexes
  - Receipt cell polling via RECEIPT_CODE_HASH env var
  - New API endpoints: `/receipts`, `/receipts/backer/:lockHash`, `/receipts/campaign/:campaignId`
  - Campaign responses include `receiptCount`
- [x] **Deployment Script** — Extended for all 4 contracts (campaign, pledge, pledge-lock, receipt)
- [x] **Integration Test** — `test-v1.1-lifecycle.ts` with 3 scenarios (success release, failure refund, merge-then-release)

#### 15.3: Frontend & E2E Testing ✓
- [x] **Campaign Detail Page Overhaul** — Removed 264 lines of manual release/refund code
  - Status badges per pledge: Locked (gray), Releasing (amber), Released (green), Refunded (blue)
  - Receipt info inline with explorer links
  - Distribution status banner (aggregate)
  - No manual release/refund buttons
- [x] **New Types & API** — `PledgeDistributionStatus`, `Receipt` interface, receipt API functions
- [x] **Utilities** — Distribution status labels/colors, explorer URL helper
- [x] **E2E Scenarios** — Scenario 6 (trustless distribution UX) + Scenario 7 (receipt display)

#### 15.4: Testnet Deployment ✓ (Partial — bugs found)
- [x] Deploy v1.1 contracts to CKB testnet (Pudge) — all 4 contracts (campaign, pledge, pledge-lock, receipt)
  - Campaign: `0x6c766909289c2e199243648926d2f9ccfc8c925cb556e30a89499b023d621e39`
  - Pledge: `0x029f1e497444f52bb7e440c65b3712bf0f629880db60d9592568e9a31ce950ce`
  - Pledge-Lock: `0x3bb066cda4600d9709c195f28fb11eca22367d590a6139c5fc3791932df66066`
  - Receipt: `0x67ca84f10c9bf7ecbed480ebedb0f6e380cc6c11825f2f77683b72ffbcaa352f`
- [x] Update Render indexer env vars (5 vars: CAMPAIGN_CODE_HASH, PLEDGE_CODE_HASH, PLEDGE_LOCK_CODE_HASH, RECEIPT_CODE_HASH, CKB_RPC_URL)
- [x] Redeploy Vercel frontend with updated env vars (10 vars: 4 code hashes + 4 tx hashes + API_URL + NETWORK)
- [x] Testnet E2E testing with real JoyID wallets (2 accounts)
- [x] Run `test-v1.1-lifecycle.ts` on devnet — all 3 scenarios pass (success release, failure refund, merge-then-release). Fixed missing `campaignLockContract` param added in Phase 5.
- [ ] Update Nervos Talk thread with v1.1 progress
- [ ] External tester validates full v1.1 lifecycle

**Testnet E2E results (2026-04-03):**

Passed:
- [x] Campaign creation — title, description, goal, deadline all stored correctly
- [x] Pledge with receipt — 600 CKB pledge created receipt cell, indexer picked up both
- [x] Finalization (success path) — "Funded" green badge, distribution status section visible
- [x] Finalization (failure path) — "Failed" red badge, 100/10,000 CKB (1%)
- [x] Home page listing — both campaigns with correct badges, progress bars, stats
- [x] Trustless UI — no manual release/refund buttons, "Locked" badges on pledges
- [x] Receipt display — "Receipt: N CKB" inline with each pledge row, explorer links

Bugs found (must fix before v1.1 is usable):
- [ ] **BUG-1: Finalization not permissionless** — campaign cell uses standard secp256k1 lock (creator's), so only the creator can finalize. Backer gets lock script error code 4. Blocks Phase 16 auto-finalization bot. Fix: custom campaign lock script or alternative approach.
- [ ] **BUG-2: Campaign cell capacity leak** — finalizer receives ~474 CKB excess from campaign cell. Creator's CKB is routed as change to whoever signs the finalize tx instead of preserved.
- [ ] **BUG-3: No distribution trigger in UI** — after finalization, pledges stay "Locked" with "Distribution pending". No buttons to trigger `permissionlessRelease` / `permissionlessRefund`. Neither creator nor backer can receive CKB through the UI. Critical blocker.
- [ ] **BUG-4: Receipt cell cost not shown** — pledging 600 CKB costs ~900 CKB (pledge + ~300 CKB receipt cell). Users confused by wallet showing higher amount. Need cost breakdown in pledge form.
- [ ] **BUG-5: Backer count shows 0** on home page campaign cards (minor indexer issue).

### Phase 15.5: v1.1 Bug Fixes (Required before v1.1 is usable)

#### 15.5.1: Add Distribution Trigger Buttons (BUG-3 — Critical) ✓
- [x] Add "Trigger Release" button on funded campaigns (calls `permissionlessRelease`)
- [x] Add "Trigger Refund" button on failed campaigns (calls `permissionlessRefund`)
- [x] Buttons visible to everyone (not just creator/backer) — permissionless
- [x] Buttons hidden after all pledges distributed (checks live pledge count)
- [x] Fixed: frontend was using hardcoded base capacity instead of actual pledge cell capacity from chain — caused ERROR_INSUFFICIENT_OUTPUT (code 32)

#### 15.5.2: Fix Campaign Cell Capacity (BUG-2) ✓
- [x] `finalizeCampaign()` now fetches original campaign cell capacity from chain
- [x] Creates two outputs: finalized campaign cell (min capacity) + creator change cell (excess)
- [x] Uses `params.campaignData.creatorLockHash` to reconstruct creator lock script

#### 15.5.3: Receipt Cost UX (BUG-4) ✓
- [x] Show estimated total cost in pledge form (pledge amount + pledge cell + receipt cell + fee)
- [x] Live-updating breakdown below amount input, before wallet popup
- [x] Capacity formulas match builder.ts: `max(ceil((8+dataSize+65+65)*1.2), 61) * 1e8`

#### 15.5.4: Permissionless Finalization (BUG-1) ✓
- [x] Root cause documented: campaign cell locked with creator's lock script
- [x] Custom campaign-lock contract implemented (`contracts/campaign-lock/src/main.rs`)
- [x] Lock validates `since_raw >= deadline_block` (raw comparison, no absolute since flag — devnet rejects absolute since)
- [x] `createCampaign()` uses campaign-lock as lock script with 8-byte deadline args
- [x] `finalizeCampaign()` sets since field to raw deadline block number
- [x] Frontend "Finalize" button visible to all users (removed isCreator check)
- [x] All 3 devnet E2E tests pass: success lifecycle, failure lifecycle, non-creator permissionless finalization

#### 15.5.5: Backer Count Fix (BUG-5) ✓
- [x] `getUniqueBackerCount` now uses same linkage pattern as `getPledgesForCampaign` (pledge `campaign_id` is type script hash, not outpoint ID)
- [x] Counts unique backers from both pledges AND receipts tables
- [x] Funding progress preserved after distribution via receipt amount fallback

### Phase 17: Automatic Finalization Bot ✓
Completed. FinalizationBot class integrated into indexer polling loop. See details below.

---

## Notes & Updates

**2026-02-12:** Phase 8 (Claim/Refund Logic) implementation completed
- Contracts restructured for finalization and destruction
- Transaction builder expanded with finalize/refund/release
- Indexer enhanced with effectiveStatus and pledge linkage tracking
- Frontend actions section with role-based buttons

**2026-02-20:** Phase 8 bug fixes and UI testing
- Fixed finalization redirect bug (stale indexer data, broken pledge linkage, fragile timeout)
- Added `originalTxHash` tracking for finalized campaigns
- All 4 UI flows tested and passing on devnet
- Added `NEXT_PUBLIC_DEVNET_ACCOUNT` env var for account switching

**2026-02-20:** Phase 9 — Campaign Metadata
- Title and description stored on-chain after 65-byte header (no contract changes)
- Full-stack: serializer → builder → indexer parser → API → frontend
- Seed script now cleans up existing devnet data before seeding
- Metadata preserved through campaign finalization

**2026-02-25:** Phase 10 — UI Polish & UX
- 2 new components (Toast, Skeleton), 6 new utility functions, 8 files modified
- Effective status badges (5 states), description previews, time estimates, backer counts
- Toast notifications, skeleton loading, polling loops, transaction progress indicator
- Form validation (required title, char counters, goal/deadline validation)
- Devnet account switcher in header, balance display
- Responsive layout (mobile-first pledge form, touch targets, flex-wrap header)
- All features browser-tested and passing

**2026-03-04:** Phase 11 — Production Readiness
- Campaign destruction: `destroyCampaign()` builder method + frontend button (gray, post-finalization)
- SQLite indexer: `better-sqlite3`, background polling (10s), atomic replace, graceful shutdown
- Code cleanup: shared `serialization.ts`, removed duplicates from 2 pages, DEVNET ONLY warnings
- Security review: 5 contract findings documented with risk/resolution in `docs/SecurityReview.md`
- Documentation: `docs/UserGuide.md` and `docs/DeveloperGuide.md` covering all flows and architecture

**2026-03-05:** Phase 12 — E2E Test Suite
- 5 browser-automated test scenarios run via `claude --chrome` (files in `e2e/`)
- All scenarios passed: successful campaign, failed campaign refund, indexer persistence, edge cases, destruction
- Bug fix: progress percentage uncapped (shows real % like 150%, bar width still caps at 100%)

**2026-03-13:** Phase 13 — Testnet Deployment (code changes)
- Multi-network config: `NEXT_PUBLIC_NETWORK` env var (`devnet`/`testnet`/`mainnet`), per-network RPC URLs and contract configs
- `createCkbClient()` factory replaces `createDevnetClient()` — supports devnet (OFFCKB scripts), testnet (CCC built-in), mainnet
- DevnetContext network-aware: private-key signer on devnet only, CCC wallet connector on testnet/mainnet
- Header: dynamic network badge (Devnet/Testnet/Mainnet), account switcher hidden on non-devnet
- Creator lock script: indexer extracts from `cell.cellOutput.lock`, stored in DB, returned via API, used for release-to-creator on testnet
- Deploy script: supports `CKB_NETWORK` + `DEPLOYER_PRIVATE_KEY` env vars, saves artifacts, prints config instructions
- `.env.example` files for frontend and indexer, `docs/TestnetDeployment.md` guide
- 20 files changed, old `devnetClient.ts` removed, all 3 packages compile clean

**2026-03-18:** Phase 13.5 — Testnet Deployment & Testing
- Generated testnet deployer account, funded via Nervos Pudge Faucet (100,000 CKB)
- Deployed campaign + pledge contracts to CKB testnet (Pudge)
- Campaign code hash: `0xb71c1c...ea3fc`, Pledge code hash: `0x423442...bc924`
- Indexer running locally, exposed via ngrok (`castled-maureen-nonmedicative.ngrok-free.dev`)
- Frontend deployed to Vercel (`decentralized-kickstarter-kappa.vercel.app`)
- Fixed: Vercel env vars had trailing `\n` from `echo` piping — switched to `printf`
- Fixed: Tailwind purging dynamic badge classes — added safelist comment
- Added `ngrok-skip-browser-warning` header to centralized `apiFetch()` in `api.ts`
- JoyID wallet connector verified working on testnet
- Full lifecycle tested: create → pledge → finalize (success) → release → destroy
- Failure path tested: create → pledge → finalize (failed) → refund → destroy

**2026-03-25:** Phase 14 — Community Engagement & Feedback
- Created CKBuilder-projects issue (#6) for technical review from CKB core devs
- Feedback requests focus on: custom pledge lock script design, on-chain deadline enforcement, TypeID for campaign cells, batch operations
- Neon (CKB team member) validated deployed app on testnet — confirmed core flows work with JoyID wallet

**2026-03-26:** Phase 14.2 — Nervos Talk Writeup
- Published project announcement to Nervos Talk (CKB Development & Technical Discussion, tags: CKB, dapp)
- Full writeup: problem statement, lifecycle, architecture, tech stack, design decisions, v1.1 roadmap, feedback questions
- Created fresh testnet campaign (500 CKB goal) + 200 CKB pledge for live screenshots
- Saved draft at `docs/NervosTalkPost.md` for reference
- Note: Discourse new-user restrictions blocked links and screenshots — to be added after trust level upgrade

**2026-03-26:** Community Feedback & Infrastructure
- Received responses from Ophiuchus (community) and RetricSu (CKB core team) on Nervos Talk
- RetricSu pointed to joii2020/crowdfunding demo — analyzed for v1.1 lock script design patterns
- Migrated indexer from Cloudflare tunnel to Render free tier (ckb-kickstarter-indexer.onrender.com)
- Updated Vercel frontend NEXT_PUBLIC_API_URL to Render, removed ngrok-skip-browser-warning header

**2026-03-26 – 2026-03-27:** Phase 15 — v1.1 Trustless Automatic Fund Distribution
- Analyzed joii2020/crowdfunding: Contribution-as-Lock-Script pattern, Claim receipt cells, merge design
- Key design decisions: pledge-as-lock-script, separate receipt cells, fail-safe refund, TypeID, permissionless
- Phase 15.1 (On-Chain Contracts): 4 Rust contracts — pledge lock (330 lines), receipt type (208 lines), campaign TypeID update, pledge merge update (136 lines)
- Phase 15.2 (Off-Chain Integration): 4 tx builder operations, indexer receipt tracking, 3 new API endpoints, deployment script, integration test (456 lines)
- Phase 15.3 (Frontend): Campaign detail page overhaul (-264/+81 lines), status badges, receipt display, 2 E2E scenarios
- All 20 v1.1 requirements implemented, all contracts compile
- Remaining: testnet deployment, external validation, Nervos Talk update

**2026-03-31:** Phase 15 — v1.1 Devnet E2E Validation & Bug Fixes
- Ran full v1.1 lifecycle integration tests (`test-v1.1-lifecycle.ts`) on local devnet — all 3 scenarios pass
- **Contract fixes:**
  - `pledge-lock`: Rewrote `validate_merge` to use `Source::Output` with manual lock hash comparison (fixes `GroupOutput` matching issue with `data2` hash type)
  - `pledge-lock`: Prefixed unused `lock_args` params with `_`
  - `receipt`: Removed unused `load_script` import, suppressed `to_bytes` dead code warning
- **Transaction builder fixes:**
  - `createCampaign`: Added TypeID args computation per CKB RFC-0022 — `blake2b(molecule_serialized_first_input || output_index_u64_le)`
  - `finalizeCampaign`: Preserves TypeID args from original campaign cell (fetches from chain)
  - `permissionlessRelease`: Deducts fee from output capacity (within MAX_FEE), no extra signer inputs needed
  - `permissionlessRefund`: Same fee deduction pattern
  - `mergeContributions`: Adds separate fee cell from signer, restores exact capacity on merge output (contract requires exact match)
- **Deploy script fix:** Moved `scripts/deploy-contracts.ts` to `off-chain/transaction-builder/deploy-contracts.ts`, replaced duplicated broken devnet config with shared `createCkbClient`
- All 4 contracts rebuilt and redeployed to devnet with warning-free compilation

**2026-04-01:** Phase 15 — v1.1 Devnet E2E Testing (Scenario 6) & Infrastructure Fixes
- Ran Scenario 6 (v1.1 Trustless Distribution) via `claude --chrome` browser automation
- **Indexer bug fixes:**
  - Changed `scriptSearchMode` from `"exact"` to `"prefix"` for campaign/pledge/receipt cell searches — `"exact"` with empty args skipped cells with TypeID args
  - Added `import "dotenv/config"` to indexer entry point — `.env` file was never being loaded, indexer always used hardcoded v1.0 code hashes
  - Changed `INSERT INTO` to `INSERT OR REPLACE INTO` for campaigns/pledges/receipts — individual insert failures no longer roll back the entire batch
  - Wrapped `replaceLiveCells` call in try-catch for resilience
  - Installed `dotenv` dependency
- **Frontend fix:**
  - Cleaned up `.env.local` with correct v1.1 contract code hashes and tx hashes after fresh deploy — stale env vars from previous devnet runs caused `TransactionFailedToResolve` errors
- **Contract redeployment:**
  - Deployed all 4 v1.1 contracts to fresh devnet via `deploy-contracts.ts`
  - Updated both frontend `.env.local` and indexer `.env` with new deployment tx hashes
- **Scenario 6 results — all 5 steps passed:**
  - Step 1: Created "Quick Trustless Test" campaign (200 CKB goal, short deadline) ✓
  - Step 2: Pledged 250 CKB as Account #1 — "Locked" badge visible, no manual buttons ✓
  - Step 3: Finalized after deadline — status changed to "Funded" (green) ✓
  - Step 4: "Distribution Status" section visible with automatic/permissionless text ✓
  - Step 5: As backer (Account #1) — no "Claim Refund" or "Release to Creator" buttons ✓

**2026-04-03:** Phase 15 — v1.1 Full E2E Devnet Validation (All 7 Scenarios)
- Ran `test-v1.1-lifecycle.ts` on devnet — all 3 transaction-level scenarios pass (success release, failure refund, merge-then-release)
- Ran all 7 browser E2E scenarios via `claude --chrome` on devnet — **all pass**
- **Indexer bug fixes:**
  - `getCurrentBlockNumber`: Replaced `client.getTip()` with direct JSON-RPC call — CCC's `ClientPublicTestnet.getTip()` returns the testnet tip even when configured with a custom devnet URL
  - `getReceiptsForCampaign`: Added `originalTxHash` linkage (mirroring pledge lookup) — receipts were not found after finalization because the campaign outpoint changes
- **Browser E2E results:**
  - Scenario 1 (Successful Campaign Lifecycle): create → pledge 300 CKB → pledge 250 CKB → finalize as Success → verify no manual buttons ✓
  - Scenario 2 (Failed Campaign Refund): create → pledge 100 CKB (1% of 10,000 goal) → finalize as Failed → verify no manual refund buttons ✓
  - Scenario 3 (Indexer Persistence): campaign + pledge + receipt data survives indexer restart, available immediately ✓
  - Scenario 4 (Edge Cases): exact goal match (200/200 = 100.0%) ✓, zero pledges → finalize → destroy ✓, form validation (empty title, goal < 100, deadline in past) ✓
  - Scenario 5 (Campaign Destruction): destroy button appears after finalize with 0 pledges, campaign removed from listing and direct URL ✓
  - Scenario 6 (Trustless Distribution): "Locked" badges, "Distribution Status" section, no manual release/refund buttons ✓
  - Scenario 7 (Receipt Display): "Receipt: N CKB" inline with each pledge row, amounts match ✓
- **v1.1 core requirements validated:**
  - Receipt info appears inline with each pledge row
  - No manual "Release to Creator" or "Claim Refund" buttons exist
  - "Distribution Status" section appears after finalization
  - Fund distribution described as automatic/permissionless
  - "Locked" status badges on pledge rows

**2026-04-09:** Phase 5 — Permissionless Finalization (Campaign Lock Script)
- Created `contracts/campaign-lock/` — minimal lock script that validates `since_raw >= deadline_block` from 8-byte LE args
- **Key discovery:** CKB OffCKB devnet rejects absolute since values (bit 63 set) with `Immature` error regardless of tip block. Switched to raw deadline block number as since value (same pattern as pledge-lock). Lock script enforces deadline via `load_input_since()`.
- `createCampaign()` now uses campaign-lock as the cell's lock script (replaces creator's secp256k1 lock)
- `finalizeCampaign()` sets `since: BigInt(deadlineBlock)` on the campaign cell input
- Frontend: removed `isCreator` check from finalize button — visible to all users when campaign expired
- Added `campaignLock` to frontend `CONTRACTS` constants
- Test 3 (non-creator finalization): Account B finalizes after deadline, triggers permissionless release — funds routed to creator without creator participation
- All 3 devnet E2E tests pass: success lifecycle, failure lifecycle, non-creator permissionless finalization
- BUG-1 resolved — unblocks Phase 16 (auto-finalization bot)

**2026-04-13:** E2E Integration Testing — Frontend + Indexer campaign-lock fixes
- **Frontend campaign creation** (`campaigns/new/page.tsx`): now creates campaigns with campaign-lock (was using creator's secp256k1 lock, preventing non-creator finalization)
- **Frontend finalization** (`campaigns/[id]/page.tsx`): preserves campaign-lock on output, sets `since = deadline`, adds campaign-lock cell dep (was replacing lock with user's secp256k1 and missing since field)
- **Indexer creatorLockScript extraction** (`indexer.ts`): now resolves creator's lock from the original creation tx outputs (was reading the campaign cell's own lock, which is now campaign-lock instead of creator's secp256k1)
- **Test lifecycle** (`test-lifecycle.ts`): loads contract hashes from `deployed-contracts-devnet.json` instead of hardcoding; added Test 4 (v1.1 permissionless refund lifecycle)
- **Frontend `.env.local`**: added `NEXT_PUBLIC_CAMPAIGN_LOCK_CODE_HASH` and `NEXT_PUBLIC_CAMPAIGN_LOCK_TX_HASH`
- **CLI E2E results (4/4 pass):** success lifecycle, failure lifecycle, non-creator permissionless finalization, v1.1 permissionless refund
- **Browser E2E results (2/2 pass):**
  - Success path: create(Account #0) → pledge 250 CKB(Account #1) → non-creator finalize(Account #1) → trigger release(Account #1) → "All pledges released to creator"
  - Failure path: create(Account #0, 10K goal) → pledge 100 CKB(Account #1) → non-creator finalize(Account #1) → trigger refund(Account #1) → "No pledges" (funds returned to backer)

### Phase 16: Security Hardening — Officeyutong Review Fixes ✓

Addressed all 6 issues from CKB core developer Officeyutong's [CKBuilder Projects code review](https://github.com/Nervos-Community-Catalyst/CKBuilder-projects/issues/6). Two HIGH-severity mainnet blockers + four MEDIUM/SMALL hardening items.

#### Issue 1 — Fail-safe Refund Backdoor (HIGH) ✓
- [x] **Root cause:** Pledge-lock `None` branch defaulted to backer refund when campaign cell_dep missing — a backer could destroy the campaign cell and force-refund a successful campaign
- [x] **Fix (pledge-lock):** Replaced `None` fallback with grace period check. Campaign cell_dep mandatory within 1,944,000 blocks (~180 days). After grace period, fail-safe refund allowed for genuinely lost campaigns.
- [x] **Fix (campaign type):** Restricted destruction — Failed campaigns can be destroyed anytime, Success campaigns blocked until grace period expires, Active campaigns cannot be destroyed.
- [x] Constants: `GRACE_PERIOD_BLOCKS = 1_944_000`, `ERROR_CAMPAIGN_CELL_DEP_MISSING = 21`, `ERROR_DESTRUCTION_NOT_ALLOWED = 13`

#### Issue 2 — Receipt Check Too Loose + Refund Not Permissionless (HIGH) ✓
- [x] **Root cause:** Receipt creation only checked `pledge_amount > 0` and `backer_lock_hash != 0` — didn't verify against actual pledge cell. Refund required receipt as input (locked with backer's secp256k1), making it backer-only.
- [x] **Fix (receipt type):** Cross-checks sibling pledge cell via `load_cell_type` code_hash matching. Verifies `pledge_amount == receipt.pledge_amount` AND `pledge.backer_lock_hash == receipt.backer_lock_hash`. Receipt args store pledge contract code hash (32 bytes).
- [x] **Fix (builder):** `permissionlessRefund` no longer requires receipt as input. Refund validated entirely by pledge-lock. Any wallet can trigger.

#### Issue 3 — Partial Refund Doesn't Cross-Check Amount (MEDIUM) ✓
- [x] **Root cause:** `validate_partial_refund` only checked `output.amount < input.amount` — difference could be any value.
- [x] **Fix (pledge type):** Scans transaction inputs for destroyed receipt by code_hash. Asserts `input_amount - output_amount == receipt.pledge_amount`. Pledge type args store receipt contract code hash (32 bytes).
- [x] Constants: `ERROR_REFUND_AMOUNT_MISMATCH = 16`, `ERROR_NO_RECEIPT_IN_INPUTS = 17`

#### Issue 4 — Merge Deadline + Lock Args (MEDIUM) ✓
- [x] **Root cause:** Merge after deadline is wasteful (not harmful — output retains same lock). Lock args comparison is implicit via GroupInput but not explicit.
- [x] **Fix (pledge-lock):** Added explicit lock args verification loop on merge output (defense in depth). Documented CKB since floor constraint (merge timing limitation).

#### Issue 5 — Finalization Since Enforcement (MEDIUM) ✓
- [x] **Root cause:** Campaign type script finalization didn't check the since field — relied entirely on campaign-lock.
- [x] **Fix (campaign type):** Added `load_input_since` check in finalization path. Validates `since >= deadline_block` as defense-in-depth alongside campaign-lock. Also validates reserved bytes [57..65] and metadata tail unchanged during finalization (Issue 6b).

#### Issue 6 — Smaller Items (SMALL) ✓
- [x] **6a — Indexer network client:** Replaced hard-coded `ClientPublicTestnet` with `CKB_NETWORK` env var. Supports devnet (OffCKB overrides), testnet, mainnet.
- [x] **6b — Reserved bytes + metadata:** Finalization validates `old_data[57..65] == new_data[57..65]` and `old_data[65..] == new_data[65..]`.
- [x] **6c — Capacity buffer in UI:** Already fixed in Phase 15.5.3 (BUG-4).

#### Off-Chain Updates ✓
- [x] Transaction builder: `createPledgeWithReceipt` sets cross-referencing args (receipt args = pledge code hash, pledge args = receipt code hash)
- [x] Deploy script: handles all 5 contracts (campaign, pledge, pledge-lock, receipt, campaign-lock)
- [x] Test lifecycle script: updated for receipt-free refund

#### E2E Validation ✓
- [x] All 5 contracts rebuilt, stripped, deployed to devnet with new code hashes
- [x] **Lifecycle tests (3/3 pass):** Success → release, Failure → refund, Merge → release
- [x] **Security attack tests (3/3 rejected):**
  - Attack 1: Refund without campaign cell_dep on Success campaign → **REJECTED** (error code 21)
  - Attack 2: Destroy Success campaign within grace period → **REJECTED** (campaign-lock blocks)
  - Attack 3: Premature finalization before deadline → **REJECTED** (since Immature enforcement)

**Bug found during E2E testing:** Receipt and pledge contracts used `load_cell_type_hash` (returns hash of full type script including args) but compared against a code hash in args. Fixed by switching to `load_cell_type` with `code_hash()` field comparison.

**Code review findings (advisory):** 2 critical (non-null assertion in builder, silent indexer failure), 4 warnings (hardcoded lock script code hash, empty catch blocks, type safety). See `06-REVIEW.md`.

### Phase 17: Automatic Finalization Bot ✓

**Problem:** After the deadline passes, someone must manually click "Finalize Campaign" to transition the on-chain status. While this is permissionless (anyone can do it), it still requires a manual trigger. This creates friction — campaigns sit in "Expired - Needs Finalization" state until someone acts.

**Solution:** A lightweight background service that monitors for expired campaigns and automatically submits finalization transactions.

#### Scope
- [x] Background service that polls the indexer for campaigns with `status: Active` and `deadlineBlock < currentBlock`
- [x] Automatically builds and submits `finalizeCampaign` transactions
- [x] Dedicated CKB account funded with a small amount (~10 CKB) for transaction fees (~0.001 CKB per finalization)
- [x] Configurable poll interval and batch size
- [x] Logging and error handling for failed finalizations
- [x] Also triggers `permissionlessRelease` / `permissionlessRefund` after finalization

#### Implementation Details
- **`off-chain/indexer/src/bot.ts`** — `FinalizationBot` class (344 lines)
  - `processPendingFinalizations()` — scans for expired Active campaigns, submits finalization txs
  - `releaseSuccessfulPledges()` — triggers permissionless release for Success campaigns
  - `refundFailedPledges()` — triggers permissionless refund for Failed campaigns
  - `checkBotBalance()` — monitors wallet balance, warns if below configurable threshold (default: 50 CKB)
- **`off-chain/indexer/src/indexer.ts`** — Bot integrated into polling loop via `setBot()` dependency injection
- **`off-chain/indexer/src/index.ts`** — Bot initialized from `BOT_PRIVATE_KEY` env var, gracefully disabled if missing
- All three bot methods run each 10-second polling cycle after `indexAll()`
- Error handling: try-catch per operation, log and retry next cycle (no backoff)
- Bot is optional — indexer runs normally without `BOT_PRIVATE_KEY`

#### Code Review Fixes Applied
- Added missing `campaignCellDep` in refund params
- Replaced hardcoded secp256k1 lock scripts with database-stored backer lock scripts (schema migration included)
- Enhanced error logging with structured context (campaign/pledge IDs, stack traces)

#### Design Notes
- The bot needs no special permissions — finalization is permissionless on-chain
- Transaction fees are negligible (~0.001 CKB each)
- Runs inside the existing indexer process (not a separate service)
- Fail-safe: if the bot is down, users can still finalize manually from the UI

### Phase 18: Platform Business Model & Treasury

**Purpose:** Design a sustainable business model for the platform. Currently the platform operates at zero cost to users — no fees are collected. This phase explores revenue mechanisms and treasury management to fund ongoing development, infrastructure, and the finalization bot.

#### Discussion Topics
- [ ] **Fee structure:** percentage from each pledge (e.g., 1-3%) vs flat fee vs creator-side fee only
- [ ] **Fee collection mechanism:** on-chain (baked into pledge lock script) vs off-chain (indexer/API level)
- [ ] **Treasury contract:** on-chain treasury cell that accumulates fees, governed by multisig or DAO
- [ ] **Fee transparency:** display platform fee clearly in UI before pledge confirmation
- [ ] **Free tier vs premium:** should small campaigns be fee-free? Tiered pricing?
- [ ] **Infrastructure costs:** Render (indexer hosting), Vercel (frontend), CKB node, finalization bot
- [ ] **Grant sustainability:** how does fee revenue complement or replace grant funding?
- [ ] **Competitive analysis:** what do other crowdfunding platforms charge? (Kickstarter: 5%, GoFundMe: 0% + tips)

#### Implementation Considerations
- On-chain fee collection is most trustless but requires contract changes (pledge lock script modification)
- Off-chain fee collection is simpler but requires trust in the platform operator
- Treasury governance: who controls the treasury? Multisig? Future DAO token?
- Fee must not make the platform uncompetitive with alternatives

**2026-04-06:** Phase 15.5 — v1.1 Bug Fixes
- Fixed all 5 bugs from testnet E2E testing
- BUG-3 (Critical): Added "Trigger Release"/"Trigger Refund" buttons to campaign detail page — permissionless, any wallet can trigger
  - Fixed frontend capacity calculation: was using hardcoded base capacity instead of actual cell capacity from chain (ERROR_INSUFFICIENT_OUTPUT code 32)
  - Buttons hidden after all pledges distributed (checks live pledge count, not receipt count)
- BUG-2: `finalizeCampaign` now creates 2 outputs — excess capacity returned to creator via change cell
- BUG-4: Pledge form shows live cost breakdown (pledge + pledge cell + receipt cell + fee) before wallet popup
- BUG-1: Fixed — custom campaign-lock contract deployed, non-creator finalization working on devnet (3 E2E tests pass)
- BUG-5: `getUniqueBackerCount` fixed — was using SQL with wrong ID format (outpoint vs type script hash), now uses same linkage pattern as other pledge/receipt queries
- Additional fix: funding progress and backer count preserved after release/refund via receipt amount fallback (pledge cells consumed in UTXO model)

**2026-04-03:** Phase 15.4 — v1.1 Testnet Deployment & E2E Testing
- Generated new testnet deployer account, funded via Nervos Pudge Faucet (100,000 CKB)
- Deployed all 4 v1.1 contracts to CKB testnet (campaign, pledge, pledge-lock, receipt)
- Updated Render indexer env vars (5 vars) and Vercel frontend env vars (10 vars) via CLI
- Testnet E2E testing with 2 real JoyID wallets:
  - Campaign creation: "v1.1 Testnet E2E Test" (500 CKB goal) ✓
  - Pledge with receipt: 600 CKB pledge (120% funded), receipt cell created ✓
  - Finalization (success): status → "Funded" green badge, distribution status visible ✓
  - Failed campaign: "v1.1 Failed Campaign Test" (10,000 CKB goal, 100 CKB pledge → 1%) ✓
  - Finalization (failure): status → "Failed" red badge ✓
  - Home page listing: both campaigns with correct badges, progress, stats ✓
  - Trustless UI: no manual release/refund buttons, "Locked" badges, receipt display ✓
- 5 bugs found — see Phase 15.5 for details:
  - BUG-1: Finalization not permissionless (only creator can finalize)
  - BUG-2: Campaign cell capacity leaks to finalizer (~474 CKB)
  - BUG-3: No distribution trigger UI (funds stuck after finalization) — CRITICAL
  - BUG-4: Receipt cell cost not shown in pledge form (user confusion)
  - BUG-5: Backer count shows 0 on home page cards (minor)

**2026-04-20:** Phase 16 — Security Hardening (Officeyutong Review Fixes)
- Addressed all 6 issues from CKB core developer Officeyutong's code review (2 HIGH, 4 MEDIUM/SMALL)
- Issue 1 (HIGH): Closed fail-safe refund backdoor — grace period (1.9M blocks ≈ 180 days) + campaign destruction protection
- Issue 2 (HIGH): Hardened receipt creation (pledge cross-check by code_hash) + made refund fully permissionless (receipt no longer consumed)
- Issue 3: Partial refund amount cross-checked against destroyed receipt's pledge_amount
- Issue 4: Merge path lock args validation + timing documentation
- Issue 5: Campaign finalization enforces since >= deadline_block (defense in depth)
- Issue 6: Indexer network-aware client, reserved bytes + metadata validation during finalization
- Bug found during E2E: `load_cell_type_hash` vs `code_hash` mismatch in receipt/pledge cross-check — fixed with `load_cell_type` + `code_hash()` comparison
- All 5 contracts rebuilt, deployed to devnet — 3/3 lifecycle tests pass, 3/3 attack scenarios rejected
- Code review: 2 critical (advisory), 4 warnings — see 06-REVIEW.md
- Next: external audit

**2026-04-24:** Phase 17 — Automatic Finalization Bot
- Implemented `FinalizationBot` class in `off-chain/indexer/src/bot.ts` (344 lines)
- 4 core methods: `processPendingFinalizations`, `releaseSuccessfulPledges`, `refundFailedPledges`, `checkBotBalance`
- Integrated into indexer polling loop — bot runs automatically on each 10-second cycle after `indexAll()`
- Bot initialized from `BOT_PRIVATE_KEY` env var in `index.ts`; gracefully disabled if key missing
- TransactionBuilder adapted to 6-parameter constructor for bot usage
- Code review: 2 critical + 3 warnings found and fixed:
  - Added missing `campaignCellDep` in permissionless refund params
  - Replaced hardcoded secp256k1 lock scripts with database-stored backer lock scripts (DB schema migration)
  - Enhanced all error catch blocks with structured logging (campaign/pledge IDs, stack traces)
- Verification: 9/9 must-haves passed
- Remaining: deploy to Render with `BOT_PRIVATE_KEY` env var, fund bot wallet on testnet

**2026-04-27:** Phase 17.5 — Bot Local Devnet Testing & Bug Fixes
- Ran bot E2E on local devnet. Full lifecycle verified: create campaign → pledge → deadline passes → bot auto-finalizes as Success → bot auto-releases pledge funds to creator.
- **10 bugs found and fixed during testing:**
  1. **Stale `.js` files** in `transaction-builder/src/` — Node.js loaded old compiled JS instead of TS source. Deleted all `.js` from `src/`.
  2. **Wrong import paths** in `index.ts` — `../transaction-builder` should be `../../transaction-builder` (relative to `src/` directory).
  3. **Hardcoded `"testnet"` network** for bot client — now reads `CKB_NETWORK` env var (`createCkbClient(network, RPC_URL)`).
  4. **Wrong `hashType` values** — bot hardcoded `"type"` but devnet contracts use `"data2"`. Added `CONTRACT_HASH_TYPE` env var (default `"data2"`).
  5. **Fee too low on finalization** — `completeFeeBy(signer, 1000)` under-estimates because it doesn't account for the witness data `sendTransaction` adds later. Bumped to 2000 fee rate + added empty witness for campaign-lock input.
  6. **`totalPledged` always 0 for Success/Failed decision** — on-chain `total_pledged` is always 0 (tracked off-chain). Bot now computes from live pledge cells + receipt cells in DB.
  7. **`totalPledged` in finalize tx params** — must match on-chain value (0), not computed value. Contract rejects if `old.total_pledged != new.total_pledged`.
  8. **Race condition: finalize before pledges indexed** — bot finalized campaigns on the same cycle they became expired, before pledge cells were indexed. Added `seenExpired` cooldown set — campaigns must be seen as expired in 2 consecutive cycles before finalization.
  9. **`pledgeCapacity` vs pledge amount mismatch** — bot passed `pledge.amount` (data field, e.g., 250 CKB) but `permissionlessRelease`/`permissionlessRefund` needs actual cell capacity (e.g., 502 CKB including overhead). Bot now fetches cell capacity from chain via `client.getTransaction()`.
  10. **tsconfig changes** — updated `rootDir: "../"`, `include` for cross-package imports, added `ts-node.scopeDir` for transpilation scope.
- **Infrastructure changes:**
  - `off-chain/indexer/tsconfig.json` — `rootDir` changed to `../`, added `../transaction-builder/src/**/*` to include
  - `off-chain/indexer/.env` — added `BOT_PRIVATE_KEY` (devnet Account #2), `CKB_NETWORK`, contract tx hashes, `CONTRACT_HASH_TYPE`
  - `off-chain/indexer/src/index.ts` — fixed import paths, network-aware bot client, configurable hash types
  - `off-chain/indexer/src/bot.ts` — cooldown mechanism, pledge linkage fix, cell capacity fetch, totalPledged computation
  - `off-chain/transaction-builder/src/builder.ts` — finalizeCampaign fee fix (empty witness + 2000 rate)
  - `off-chain/transaction-builder/test-bot.ts` — new bot E2E test script
- **What works on devnet:**
  - [x] Bot auto-detects expired campaigns (with 1-cycle cooldown)
  - [x] Bot correctly computes Success/Failed from pledge+receipt cells
  - [x] Bot auto-finalizes campaign on-chain
  - [x] Bot auto-releases pledge funds to creator (Success path)
  - [x] Bot auto-refunds pledge funds to backer (Failed path — same code pattern, tested via old campaigns)
  - [x] Bot balance monitoring and low-balance warnings
  - [x] Bot gracefully disabled when `BOT_PRIVATE_KEY` not set
- **Phase 17.6 — Testnet Bot Deployment (completed 2026-04-27):**
  - [x] Verify `tsc` build works — fixed `package.json` start path to `dist/indexer/src/index.js` (rootDir nests output)
  - [x] Fixed `CKB_NETWORK` type cast for strict TypeScript compilation
  - [x] Generate dedicated bot wallet for testnet — `ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq0c7jfup93h8wld6za5jm9ksfj9e8u968q8zmd8m`
  - [x] Fund bot wallet — 100,000 CKB via Pudge Faucet
  - [x] Env vars already configured on Render: `BOT_PRIVATE_KEY`, `CKB_NETWORK=testnet`, `CONTRACT_HASH_TYPE=data1`, `CAMPAIGN_LOCK_HASH_TYPE=data`, all code hashes
  - [x] Fixed Render build: updated build command to `npm install && cd ../transaction-builder && npm install && cd ../indexer && npm run build` (tsc compiles cross-package sources that need `@ckb-ccc/core`)
  - [x] Deployed to Render — bot initialized successfully, connected to CKB testnet block 20906079
  - [x] Bot logs confirm: address matches, injected into indexer, polling every 10s
  - [ ] E2E testnet verification: create test campaigns (Success + Failed paths), confirm bot auto-finalizes and distributes
  - [ ] Post Nervos Talk update with bot deployment news

**2026-04-20:** Testnet Redeployment — Phase 16 Hardened Contracts
- Deployed all 5 hardened contracts to CKB testnet (Pudge):
  - Campaign: code hash `0x520ff6...a9c897`, tx `0x61f676...331ade`
  - Campaign-Lock: code hash `0x64397e...a52822`, tx `0x45df1c...e7edfd`
  - Pledge: code hash `0xe45d09...8eb024`, tx `0x8bc1ca...63a745`
  - Pledge-Lock: code hash `0xbdcd10...237c48`, tx `0xa7df0d...1b7f36`
  - Receipt: code hash `0xff20a9...694ed6`, tx `0x83cfe3...c4848f`
- Updated Vercel frontend env vars (12 vars: code hashes + tx hashes for all 5 contracts + network + API URL)
- Updated Render indexer env vars (7 vars: 5 code hashes + CKB_NETWORK + CKB_RPC_URL)
- Vercel production redeployed, Render rebuild triggered
- Deployer account: `ckt1qzda0...2kh5k2` (funded via Pudge Faucet)
