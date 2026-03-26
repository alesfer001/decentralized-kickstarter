# Technical Debt & Codebase Concerns

This document outlines technical debt, known issues, security concerns, performance bottlenecks, and fragile areas in the CKB Kickstarter codebase.

**Last updated:** 2026-03-26
**Status:** MVP on testnet with known limitations. v1.1 roadmap addresses critical gaps.

---

## CRITICAL: v1.1 Required for Production Trustlessness

### Custom Pledge Lock Script Design (v1.1 — Blocking Production)

**Severity:** CRITICAL
**Component:** Smart contracts, transaction flow
**Docs:** `docs/NervosTalkPost.md`, `docs/ProjectPlan.md`

**Current State:**
- Pledge cells use standard **secp256k1 lock scripts** (backer's private key)
- After campaign finalization, backers must manually sign and release/refund transactions
- If a backer disappears, creator cannot access funds — **defeats trustlessness**
- Requires cooperation between multiple parties post-finalization

**Impact:**
- Makes platform unsuitable for production use without this upgrade
- Grant reviewers will likely flag this as a critical gap
- Blocks scaling to large campaigns with many backers

**Planned Solution (v1.1):**
- **Custom Pledge Lock Script** replaces secp256k1 on new campaigns
- Lock script enforces fund routing:
  - On **success**: only release to creator's address (read from campaign cell via cell deps)
  - On **failure**: only refund to backer's address (stored in pledge data)
  - While **active**: cell is locked (before campaign finalization)
- Enables trustless automation: any user/bot can trigger release/refund, no private keys needed

**Design Questions Still Open:**
- Cell dependency loading for campaign status verification
- Optimal way to read creator address from campaign cell
- Backward compatibility: old pledges use secp256k1, new ones use custom lock
- Performance impact of reading campaign cell in lock script

**Recommendation:**
- Define and prototype the custom lock script before mainnet
- Test cell dep loading patterns and gas costs
- Document upgrade path for existing campaigns

**File References:**
- `docs/NervosTalkPost.md` lines 157-167
- `docs/ProjectPlan.md` lines 535-567, 798

---

## HIGH PRIORITY: Known Limitations

### Campaign Finalization Does Not Enforce Deadline On-Chain

**Severity:** MEDIUM
**Component:** `contracts/campaign/src/main.rs` lines 137-171 (finalization validation)
**Risk Category:** Timing/ordering

**Issue:**
- Campaign type script validates only that finalization is Active → Success/Failed transition
- Does NOT verify that current block height >= `deadline_block`
- Any creator can finalize campaign at any time, even before deadline
- Frontend enforces deadline check before showing "Finalize" button, but this is trust model violation

**Current Mitigation:**
- Creator has no incentive to finalize early (pledges are locked in cells they don't control)
- Frontend enforces deadline validation before UI action
- Security review accepted as trade-off (see `docs/SecurityReview.md` item #1)

**Suggested Solutions:**
1. Add `since` constraint to finalization transaction (requires tx builder update)
2. Move deadline check into lock script validation (requires lock script arg)
3. Accept current design for MVP, implement on-chain check in v1.1

**Recommendation:** Document clearly in v1.1 roadmap. For production mainnet, consider `since`-based enforcement.

**File References:**
- `contracts/campaign/src/main.rs` lines 137-171
- `docs/SecurityReview.md` lines 7-12
- `docs/PotentialIssuesAndSolutions.md` lines 183-202 (time-based attacks)

---

### No On-Chain Verification of Campaign ID References

**Severity:** LOW
**Component:** `contracts/pledge/src/main.rs` lines 76-96 (pledge validation)
**Risk Category:** Data validation

**Issue:**
- Pledge validation checks that `campaign_id` is non-zero but not that it references a real campaign
- Pledges can be created pointing to arbitrary, non-existent campaign hashes
- Orphaned pledges are ignored by indexer and UI, but clutter blockchain

**Current Mitigation:**
- Indexer only matches pledges to known campaign cells (exact hash match)
- UI displays only valid pledges
- No fund security impact

**Root Cause:**
- On-chain cross-cell references would require complex cell dependency logic
- MVP prioritized simplicity over data integrity validation

**Recommendation:**
- For large-scale operation, consider batch cleanup of orphaned pledges
- Document indexer's filtering behavior clearly
- Monitor orphaned pledge creation patterns on mainnet

**File References:**
- `contracts/pledge/src/main.rs` lines 76-96
- `docs/SecurityReview.md` lines 21-26

---

## TRANSACTION & OPERATION SCALABILITY CONCERNS

### Batch Claiming Limitation for Large Campaigns

**Severity:** MEDIUM (scales with campaign size)
**Component:** `off-chain/transaction-builder/src/builder.ts` (releasePledgeToCreator, refundPledge methods)
**Risk Category:** Performance/UX

**Issue:**
- Very popular campaign with 10,000+ pledges requires claiming each pledge cell individually
- Single transaction claiming 10,000 inputs exceeds CKB transaction size limits (~512 KB hypothetical)
- Would also hit cycle limits (equivalent to gas)
- Current implementation assumes one-at-a-time or small batch operations

**Symptoms:**
- Campaign with >100 pledges: multiple transactions needed
- Unclear fee responsibility: who pays for batch operations?
- Creator might need 100+ transactions to claim all funds from 10,000-backer campaign

**Current State:**
- No batch claiming implementation (MVP scope)
- Documentation mentions this as Issue #2 in `docs/PotentialIssuesAndSolutions.md`
- `releasePledgeToCreator()` and `refundPledge()` operate on single cells

**Planned Solutions (Future):**
1. **Batch claiming** (v1.1): claim 100 pledges per transaction, loop manually
2. **Pledge aggregation** (v2.0): merge pledge cells before claiming
3. **Two-step claiming** (v2.0): mark pledges as claimed, batch withdraw

**Immediate Recommendation:**
- Document batch claiming process clearly in API
- Implement loop helper in transaction builder for multi-step operations
- Add logging/progress tracking for batch operations
- Test with 500+ pledge campaigns before mainnet

**File References:**
- `docs/PotentialIssuesAndSolutions.md` lines 23-56
- `off-chain/transaction-builder/src/builder.ts` lines 206-254 (refundPledge), 256-299 (releasePledgeToCreator)

---

### Zero-Pledge Campaign Cleanup

**Severity:** MEDIUM (affects operational costs)
**Component:** Campaign lifecycle, on-chain capacity management
**Risk Category:** Resource efficiency

**Issue:**
- Campaign created but nobody pledges, deadline passes
- Campaign cell exists with ~200 CKB capacity locked
- Creator must reclaim this capacity manually (destroy transaction)
- Who pays transaction fee? No clear ownership of cleanup cost

**Scenario:**
- Spam risk: many low-effort campaigns with no pledges
- Blockchain bloat: empty campaign cells accumulate

**Current Design:**
- Campaign destruction is allowed (lock script guards access)
- Creator can reclaim capacity but must submit explicit transaction
- No automatic garbage collection

**Planned Solutions:**
- Accept as MVP limitation
- v1.1: explicit cleanup API with clear fee responsibility
- Future: consider automatic expiration + garbage collection service

**Recommendation:**
- Document cleanup responsibility in UI
- Monitor zero-pledge campaign creation on testnet
- For mainnet, consider minimum 10 CKB "campaign creation deposit" (non-refundable)

**File References:**
- `docs/PotentialIssuesAndSolutions.md` lines 3-20

---

## CAPACITY & FUND MANAGEMENT CONCERNS

### Pledge Cell Capacity Calculation Complexity

**Severity:** MEDIUM
**Component:** `off-chain/transaction-builder/src/builder.ts` lines 86-100 (createPledge)
**Risk Category:** UX friction

**Issue:**
- Backer wanting to pledge 100 CKB needs total capacity of ~250 CKB (100 pledge + 150 cell overhead)
- Minimum pledge realistically ~150 CKB + pledge_amount
- Users confused about capacity vs pledge amount
- No built-in validation that backer has sufficient capacity

**Current Implementation:**
```rust
// Line 96: totalCapacity = baseCapacity + params.amount
const totalCapacity = baseCapacity + params.amount; // Base + pledge amount
```

**UX Impact:**
- Frontend must educate users on this distinction
- Transactions fail silently if insufficient balance
- No helpful error message about "you need 250 CKB to pledge 100 CKB"

**Recommendation:**
- Add UI helper showing total capacity required
- Validate wallet balance before allowing pledge
- Document minimum pledge amount (suggest 1 CKB, but warn about capacity)
- Consider UI tooltip: "To pledge X CKB, you need X + 150 CKB in your wallet"

**File References:**
- `docs/PotentialIssuesAndSolutions.md` lines 236-260
- `off-chain/transaction-builder/src/builder.ts` lines 86-100
- `off-chain/frontend/src/lib/constants.ts` (no current validation)

---

### Dust & Fee Handling in Refunds

**Severity:** LOW
**Component:** Transaction fee calculation, refund flow
**Risk Category:** Financial accuracy

**Issue:**
- Refund transactions cost fees (transaction size × fee rate)
- If backer pledged 10 CKB, refund outputs 9.98 CKB (0.02 lost to fees)
- Unclear who pays: backer (deducted from pledge) or creator (compensated)?
- No documented policy

**Current Design:**
- Whoever submits refund/release transaction pays fees
- If backer submits, fees deducted from their pledge capacity
- If batch refund service runs, service operator bears cost

**Recommendation:**
- Document fee responsibility explicitly in contracts and frontend
- Consider future: creator pays all refund fees (fairest model)
- For MVP: clearly state in UI "Refund will cost ~X shannons in network fees"
- Monitor average fee costs before mainnet

**File References:**
- `docs/PotentialIssuesAndSolutions.md` lines 150-180

---

### Failed Campaign Cleanup

**Severity:** MEDIUM (scales with campaign lifespan)
**Component:** Campaign state management, refund flow
**Risk Category:** Operational UX

**Issue:**
- Campaign fails (goal not met), backers can claim refunds
- If some backers never claim, their pledge cells remain locked on-chain indefinitely
- Creator can't reclaim campaign capacity if pledges still exist
- No expiration mechanism or automatic refund service

**Current Design:**
- Refunds are manual: backer must submit transaction
- Campaign destruction fails if any pledges remain (would consume input with outstanding refs)
- No automated refund service

**Scenario:**
- 100-backer failed campaign: 90 backers claim refunds, 10 disappear
- Campaign cell + 10 pledge cells locked forever
- ~2000 CKB capacity inaccessible

**Planned Solutions:**
- MVP: Manual cleanup (document this process)
- v1.1: Implement refund expiration period (backers have X blocks to claim)
- Future: Automated refund service (indexer pays fees, sends funds)

**Recommendation:**
- Document cleanup process in user guide
- Implement refund expiration on mainnet (e.g., 365 days grace period)
- Monitor for abandoned refunds on testnet

**File References:**
- `docs/PotentialIssuesAndSolutions.md` lines 206-233
- `docs/UserGuide.md` (should include cleanup instructions)

---

## OFF-CHAIN INFRASTRUCTURE CONCERNS

### Indexer Trust Model

**Severity:** MEDIUM
**Component:** `off-chain/indexer/src/indexer.ts`, `off-chain/indexer/src/api.ts`
**Risk Category:** Trust/availability

**Issue:**
- Indexer is **fully trusted** to compute accurate campaign status, total pledged, and effective deadlines
- Indexer has no write access (good), but malicious/buggy indexer can:
  - Compute wrong campaign status (Active vs Success vs Failed)
  - Miscount total pledged (off-chain summation from pledge cells)
  - Return stale data if polling falls behind

**Current Design:**
- SQLite-backed with background polling every 10 seconds
- No validation that on-chain state matches indexed state
- No merkle proof or signature of index state
- Frontend trusts indexer 100%

**Risks:**
- Indexer crashes: no campaign data available
- Indexer lagging: stale progress on frontend
- Indexer bug: systematic miscounting of pledges

**Current Mitigations:**
- Simple SQLite schema (low attack surface)
- Regenerates full index on each poll (not incremental)
- Open source, reviewable code

**Recommendation:**
- Add health check endpoint: indexer returns latest indexed block height
- Frontend should warn if indexer is stale (>30 seconds behind)
- Document trust model explicitly
- For production: consider running multiple indexer instances with quorum consensus
- Add monitoring/alerting for indexer availability

**File References:**
- `off-chain/indexer/src/indexer.ts` lines 66-166 (indexAll method)
- `docs/SecurityReview.md` lines 44-50 (off-chain trust model)

---

### IPFS Metadata Availability

**Severity:** MEDIUM
**Component:** Campaign metadata storage, `docs/NervosTalkPost.md` line 63
**Risk Category:** Data availability

**Issue:**
- Campaign titles/descriptions up to limit stored in cell data (variable length)
- Beyond that, expected to be on IPFS (hash stored on-chain)
- IPFS content can disappear if:
  - No persistent pinning service
  - Pinata/Infura node goes down
  - Content hash becomes invalid

**Current Design:**
- MVP uses on-chain metadata only (no IPFS yet)
- Future versions may integrate IPFS for long-form descriptions
- No redundancy plan documented

**Recommendation:**
- For MVP: keep all metadata on-chain (simplest)
- Before adding IPFS: implement multi-pinning strategy
  - Pin to Pinata (commercial)
  - Pin to Web3.Storage (free, Filecoin-backed)
  - Run own IPFS node as backup
- Consider indexer caching metadata (store in SQLite for fallback)
- Document IPFS strategy before mainnet

**File References:**
- `docs/NervosTalkPost.md` lines 61-63
- `docs/PotentialIssuesAndSolutions.md` lines 59-84

---

### Indexer API Rate Limiting & Security

**Severity:** MEDIUM
**Component:** `off-chain/indexer/src/api.ts`
**Risk Category:** Security/availability

**Issue:**
- Express API has no rate limiting
- No authentication/authorization
- Public endpoint at `http://localhost:3001` (or deployed URL)
- No HTTPS enforcement documented
- Vulnerable to DDoS, abuse

**Current Design:**
- Simple REST API: GET campaigns, GET pledges, GET campaign details
- All endpoints public (by design — transparency)
- No token-based access control

**Recommendation:**
- Add rate limiting (e.g., 100 req/minute per IP)
- Consider CORS policy (restrict to frontend domains only)
- Enforce HTTPS in production (ngrok has this built-in)
- Document security considerations
- Monitor API logs for abuse patterns

**File References:**
- `off-chain/indexer/src/api.ts` (needs review for security headers)
- `docs/SecurityReview.md` line 78 ("Add rate limiting to the indexer API")

---

## SMART CONTRACT CONCERNS

### Reserved Bytes Not Validated

**Severity:** NEGLIGIBLE
**Component:** `contracts/campaign/src/main.rs` lines 44-48 (campaign data structure)
**Risk Category:** Data integrity

**Issue:**
- Campaign data has 8 reserved bytes (57-64) for future use
- Bytes are read but never validated to be zero
- Could be exploited for undocumented side channels or data leakage

**Current Impact:**
- Minimal: reserved bytes are ignored by all code paths
- No validation means future upgrades could accidentally use these bytes

**Recommendation:**
- Document that reserved bytes MUST be zero (add validation in future)
- For now, document this as a non-issue per security review

**File References:**
- `contracts/campaign/src/main.rs` lines 44-48
- `docs/SecurityReview.md` lines 35-40

---

### Multiple Campaign Cells in Single Transaction

**Severity:** LOW
**Component:** `contracts/campaign/src/main.rs` lines 202-219 (creation validation)
**Risk Category:** Design flexibility

**Issue:**
- Contract allows multiple campaign cells in same transaction (iterates all outputs)
- Each is individually validated but treated as separate campaigns
- Could be used to batch-create campaigns or for other edge cases

**Current Mitigation:**
- No fund security impact (each campaign independently valid)
- Indexer treats as separate campaigns (correct behavior)

**Recommendation:**
- This is acceptable design (enables efficiency)
- Document that multiple campaigns per tx are allowed
- No action needed

**File References:**
- `contracts/campaign/src/main.rs` lines 202-219
- `docs/SecurityReview.md` lines 28-33

---

## FRONTEND & UX CONCERNS

### Block Height to Time Conversion Confusion

**Severity:** MEDIUM
**Component:** Frontend deadline input, user education
**Risk Category:** UX/usability

**Issue:**
- CKB block time: ~8 seconds average
- 1000 blocks ≈ 2.2 hours (not days!)
- Users might set wrong deadlines (1000 blocks thinking it's 1000 days)
- No built-in conversion helper or warning

**Current Implementation:**
- Frontend likely accepts raw block height input
- No validation warning if deadline < 1 day or > 1 year

**Recommendation:**
- Add UI conversion helper: "Input: 30 days → Calculated: 324,000 blocks"
- Show estimated time: "Deadline: 2025-12-25 (324,000 blocks from now)"
- Add validation warnings:
  - Warn if deadline < 1 day
  - Warn if deadline > 1 year
- Update form label to show block time clearly

**File References:**
- `off-chain/frontend/src/app/campaigns/new/page.tsx` (needs deadline input validation)
- `docs/PotentialIssuesAndSolutions.md` lines 87-113

---

### Hardcoded Devnet Private Keys in Code

**Severity:** MEDIUM
**Component:** `off-chain/frontend/src/lib/constants.ts` lines 133-150
**Risk Category:** Secret management

**Issue:**
```typescript
export const DEVNET_ACCOUNTS = IS_DEVNET
  ? [
      {
        privkey: "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6", // DEVNET ONLY
        ...
      },
      ...
    ]
  : [];
```

- Private keys hardcoded in source code (marked DEVNET ONLY)
- While these are public OffCKB test keys with no real value, this is poor security practice
- Could accidentally be used on testnet/mainnet
- Sets bad precedent for real deployments

**Risk:**
- Developer might copy pattern to production code
- Keys exposed in git history permanently
- No secret rotation capability

**Recommendation:**
- Never hardcode private keys, even test ones
- Move to `.env` file (git-ignored) even for devnet
- Use environment variables in all cases
- Document this in security guidelines for contributors

**File References:**
- `off-chain/frontend/src/lib/constants.ts` lines 133-150
- `docs/SecurityReview.md` lines 52-55

---

### No Error Boundary or Exception Handling

**Severity:** MEDIUM
**Component:** `off-chain/frontend/src/components/`, transaction submission
**Risk Category:** Reliability/UX

**Issue:**
- Frontend lacks comprehensive error handling for:
  - Transaction failures (insufficient balance, script execution errors)
  - Network errors (indexer unavailable, RPC timeout)
  - Wallet disconnection during transaction signing
- Users see blank screens or generic "Error" toasts

**Current Implementation:**
- Basic try-catch in transaction functions
- Toast notifications for some errors
- No error boundary React component

**Recommendation:**
- Add React Error Boundary component
- Implement detailed error messages for common scenarios
- Handle wallet disconnection gracefully (prompt reconnect)
- Log errors to console for debugging
- Test error paths thoroughly before mainnet

**File References:**
- `off-chain/frontend/src/components/` (all transaction-related components)
- `off-chain/frontend/src/lib/api.ts` (API error handling)

---

## DEPLOYMENT & CONFIGURATION CONCERNS

### Testnet Contract Hashes Not Yet Deployed

**Severity:** MEDIUM (blocks testnet availability)
**Component:** `off-chain/frontend/src/lib/constants.ts` lines 60-76
**Risk Category:** Configuration/deployment

**Issue:**
```typescript
testnet: {
  campaign: {
    txHash: "0x0000000000000000000000000000000000000000000000000000000000000000", // Set after testnet deployment
    ...
  },
  ...
},
```

- Placeholder tx hashes for testnet (zeros)
- Must be updated after actual deployment
- If not updated, frontend cannot function on testnet

**Current Status:**
- Contracts were deployed to testnet per NervosTalkPost line 69
- Need to verify actual tx hashes and update constants

**Recommendation:**
- Document deployment tx hashes and update constants
- Add CI/CD step to verify deployed contracts before release
- Consider moving contract info to separate deployment config file

**File References:**
- `off-chain/frontend/src/lib/constants.ts` lines 60-76
- `docs/TestnetDeployment.md` lines 50-73

---

### Contract README Files Not Written

**Severity:** LOW
**Component:** Documentation
**Risk Category:** Developer experience

**Issue:**
- `contracts/campaign/README.md`: "TODO: Write this readme"
- `contracts/pledge/README.md`: "TODO: Write this readme"
- No documentation of contract interface, error codes, data structures

**Impact:**
- New developers can't quickly understand contract behavior
- Error codes from contracts are magic numbers (ERROR_INVALID_FINALIZATION = 10)
- No inline documentation of design decisions

**Recommendation:**
- Write comprehensive contract READMEs documenting:
  - Contract purpose and design
  - Data structure layout (with offsets)
  - Validation rules per scenario
  - Error codes with descriptions
  - Code hash and typical deployment

**File References:**
- `contracts/campaign/README.md`
- `contracts/pledge/README.md`

---

## TESTING & VALIDATION CONCERNS

### Limited Unit Test Coverage

**Severity:** MEDIUM
**Component:** Smart contracts, transaction builder
**Risk Category:** Reliability

**Issue:**
- No unit tests for contract validation logic
- E2E tests exist but focus on happy path
- Error scenarios not systematically tested
- No test for edge cases (0 funding goal, negative amounts, etc.)

**Current Testing:**
- E2E browser automation (5 scenarios in `e2e/` directory)
- Manual testing on testnet
- No automated contract unit tests

**Recommendation:**
- Add Rust unit tests to campaign and pledge contracts
- Test all error paths and edge cases
- Add transaction builder unit tests (serialization, validation)
- Create test matrix of campaign scenarios

**File References:**
- `contracts/campaign/src/main.rs` (no test module)
- `contracts/pledge/src/main.rs` (no test module)
- `e2e/` directory (browser-based E2E only)

---

### No Mainnet Testing Strategy

**Severity:** MEDIUM
**Component:** Deployment, operations
**Risk Category:** Risk management

**Issue:**
- Project hasn't defined testnet validation checklist before mainnet
- No documented criteria for "mainnet ready"
- No plan for monitoring once live

**Current Status:**
- MVP live on testnet
- Some external testing reported (CKB team member testing per NervosTalkPost)
- No public testnet validation report

**Recommendation:**
- Create mainnet readiness checklist:
  - X days stable operation on testnet
  - X transactions processed
  - No critical bugs found
  - Security review passed (already done)
  - Contract audits complete (if applicable)
- Plan for mainnet monitoring:
  - Alert if indexer falls behind
  - Monitor transaction success rate
  - Track unusual patterns (spam campaigns, etc.)

**File References:**
- `docs/ArchitectureValidationChecklist.md` (review for testnet criteria)

---

## ECOSYSTEM & INTEGRATION CONCERNS

### Dependency on External Services

**Severity:** MEDIUM
**Component:** Frontend deployment, wallet integration
**Risk Category:** Availability/reliability

**Issue:**
- Frontend hosted on Vercel (single point of failure)
- Indexer uses ngrok for temporary tunneling
- RPC depends on public CKB node URLs
- Wallet integration depends on JoyID/MetaMask availability

**Current Setup:**
- Frontend: Vercel (good, but centralized)
- Indexer: ngrok (temporary, not production-ready)
- RPC: hardcoded URLs (testnet.ckbapp.dev, mainnet.ckbapp.dev)

**Recommendation:**
- Document infrastructure dependencies
- Plan for indexer hosting (dedicated server, Docker, Kubernetes)
- Consider RPC redundancy (multiple providers, health checks)
- Add fallback mechanisms if services unavailable
- For production: self-host or use decentralized alternatives

**File References:**
- `off-chain/indexer/src/index.ts` (needs proper hosting docs)
- `docs/TestnetDeployment.md` (indexer deployment section)

---

## CODE QUALITY & MAINTENANCE

### No Type Safety in Serialization/Parsing

**Severity:** LOW
**Component:** `off-chain/transaction-builder/src/serializer.ts`, `off-chain/indexer/src/parser.ts`
**Risk Category:** Data integrity

**Issue:**
- Serialization/parsing is manual byte-level code (error-prone)
- No schema validation or runtime type checking
- If data layout changes, both sides must be updated in sync

**Current Implementation:**
- Campaign: 65 bytes header (fixed) + optional metadata (variable)
- Pledge: 72 bytes (fixed)
- Manual byte offset calculations prone to off-by-one errors

**Recommendation:**
- Consider schema library (e.g., Zod) for validation
- Add round-trip tests: serialize → parse → verify equality
- Document data layout clearly with diagrams
- Consider codec library if more data types added

**File References:**
- `off-chain/transaction-builder/src/serializer.ts`
- `off-chain/indexer/src/parser.ts`

---

## KNOWN LIMITATIONS (By Design)

### No Campaign Modifications After Launch

**Severity:** LOW (design choice)
**Component:** Campaign lifecycle
**Risk Category:** Feature gap

**Issue:**
- Creator cannot edit campaign title, description, or deadline after creation
- No cancellation mechanism (not even with refunds)
- By design: immutability ensures trust

**Context:**
- Planned for v1.1: cancellation before first pledge only

**Recommendation:**
- Document clearly in UI/UX
- Add confirmation warning: "Campaign cannot be edited after launch"
- Plan v1.1 cancellation feature

**File References:**
- `docs/ProjectPlan.md` line 711 (no modifications by design)
- `docs/PotentialIssuesAndSolutions.md` lines 116-147 (cancellation scenarios)

---

### No Backer Cooperation Requirements Documented

**Severity:** MEDIUM (UX/expectations)
**Component:** User documentation, onboarding
**Risk Category:** User understanding

**Issue:**
- MVP requires backer cooperation post-finalization (manual release/refund)
- Not obvious from UI that backers must actively claim refunds
- Could lead to frustration on failed campaigns with low refund rate

**Current Design:**
- This is acknowledged limitation of MVP
- Fixed in v1.1 with custom pledge lock script

**Recommendation:**
- Add prominent warning in failed campaign: "Backers must manually claim refunds within 365 days"
- Document backer cooperation requirement in user guide
- Show clear "Claim Refund" button with instructions
- Track refund claim rate as metric of UX clarity

**File References:**
- `docs/NervosTalkPost.md` lines 153-159
- `off-chain/frontend/src/app/campaigns/[id]/page.tsx` (failure state UI)

---

## SUMMARY OF PRIORITIES

### Before Mainnet (Must Have)
1. **Implement custom pledge lock script (v1.1)** — required for trustlessness
2. Testnet stability validation (30+ days without critical issues)
3. Complete contract READMEs with error code documentation
4. Document indexer trust model and operational requirements
5. Rate limiting on indexer API
6. HTTPS enforcement in production

### Before Public Launch (Should Have)
1. Batch claiming helpers for large campaigns
2. Block height → time conversion UI helper
3. Error boundary and comprehensive error handling
4. Mainnet readiness checklist and monitoring plan
5. Private key management best practices document

### For v1.1 (Planned)
1. Custom pledge lock script for automatic fund distribution
2. Campaign cancellation (before first pledge)
3. On-chain deadline enforcement (via `since` field)
4. Campaign cell identity via TypeID (optional but recommended)

### Future Enhancements (v2.0+)
1. Batch operations and pledge aggregation
2. Automatic refund service
3. sUDT/xUDT support
4. Milestone-based fund release with voting
5. NFT rewards via Spore protocol

---

## Appendix: File Inventory

**Smart Contracts:**
- `contracts/campaign/src/main.rs` — Campaign type script
- `contracts/pledge/src/main.rs` — Pledge type script

**Off-Chain Backend:**
- `off-chain/transaction-builder/src/builder.ts` — Transaction construction (6 operations)
- `off-chain/transaction-builder/src/serializer.ts` — Data serialization/deserialization
- `off-chain/indexer/src/indexer.ts` — Cell indexing and polling
- `off-chain/indexer/src/api.ts` — Express REST API

**Frontend:**
- `off-chain/frontend/src/app/campaigns/[id]/page.tsx` — Campaign detail page
- `off-chain/frontend/src/app/campaigns/new/page.tsx` — Campaign creation
- `off-chain/frontend/src/lib/constants.ts` — Network configuration and hardcoded keys
- `off-chain/frontend/src/lib/api.ts` — Frontend API client

**Documentation:**
- `docs/SecurityReview.md` — Security audit findings
- `docs/PotentialIssuesAndSolutions.md` — Known limitations and solutions
- `docs/NervosTalkPost.md` — Public launch announcement with technical details
- `docs/ProjectPlan.md` — Roadmap and detailed requirements
- `docs/TestnetDeployment.md` — Deployment instructions

---

**End of Document**
