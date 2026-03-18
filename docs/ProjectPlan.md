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

### v1.1: Enhanced Features
- Campaign cancellation by creator (with refunds)
- Campaign editing (limited, before first pledge)
- Creator verification badges
- Campaign categories and tagging
- Advanced search and filtering

### v1.2: Multi-Token Support
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
- No custom lock scripts — standard secp256k1 locks are used (backer owns pledge cell → trustless refund)
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
- [ ] IPFS integration for off-chain metadata storage (images, rich text)
- [ ] Real wallet integration (JoyID/MetaMask via CCC connector)
- [ ] User dashboard (my campaigns, my pledges)
- [ ] Testnet/mainnet deployment
- [ ] Grant application

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

### Phase 14: Grant Application & Launch
- [ ] Deploy to CKB mainnet
- [ ] Prepare grant proposal for CKB Community Fund DAO
- [ ] Community building and marketing

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
