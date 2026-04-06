# CKB Kickstarter v1.1 Implementation Notes

## BUG-01: Permissionless Finalization (v1.1 Limitation)

### Current Behavior (v1.1)

- Campaign cells are locked with the creator's lock script
- Only the creator can call `finalizeCampaign()`
- Non-creators attempting finalization will get a transaction rejection
- All other operations (release/refund) remain permissionless

### Root Cause

The campaign cell's lock script is hardcoded to the creator's lock hash when the campaign is created. CKB's UTXO model requires the cell's lock script to authorize all spending. Only the creator's signature can unlock the creator's lock script.

See `contracts/campaign/src/main.rs` finalization validation logic (lines 138-174) where the campaign cell is spent with the creator's lock controlling authorization.

### Why Not Fixed in v1.1

Permissionless finalization requires one of:

1. **New "campaign lock" contract** — Replaces creator lock with a custom lock script that allows anyone to spend after deadline (requires new contract code + redeployment)
2. **Type script-based validation** — Keeps creator lock but adds type script logic to allow finalization by any signer after deadline (requires type script redesign + redeployment)

Both approaches require:
- New contract code and compilation
- Testing and validation on devnet
- Redeployment to testnet (breaking change for existing campaigns)
- Integration test updates to exercise new code paths

This scope exceeds the "bug fix" classification of Phase 4. Deploying new contracts would force re-initialization of the entire test environment and existing campaigns.

### v1.2 Approach (Proposed)

Implement a custom "campaign lock" script:

- **Lock code:** New `campaign-lock` contract with `validate_campaign_finalization()` logic
- **Allow spending if:**
  - Signer = creator (backward compatible with v1.1) **OR**
  - Current block >= campaign deadline **AND** type script validates transition to Success/Failed
- **Benefits:**
  - Permissionless finalization after deadline
  - Creator still authorized (compatibility)
  - Cleaner separation of concerns (lock handles authorization, type script handles state validation)
- **Tradeoff:**
  - New contract code, redeployment, brief testnet downtime
  - All new campaigns created after v1.2 deployment will use new lock
  - Existing v1.1 campaigns on testnet will not be migrated (clean slate recommended)

**Alternative approach (v1.2):** Use type script for validation and put campaign under a generic permissionless lock (e.g., allow `always-success` pattern). Requires fewer signatures but shifts all authorization burden to type script.

### Workaround for v1.1

- **Creators can finalize their own campaigns** using the "Finalize Campaign" button (visible only to creator in UI)
- **Permissionless release/refund works** — D-02 and D-03 of BUG-03 are fully implemented
- **Finalization is the only operation requiring creator** — once finalized, distribution is truly permissionless
- **Non-creators cannot finalize** — UI clearly communicates this limitation

### Testing Plan for v1.2

After v1.2 implements permissionless finalization:

- [ ] Non-creator wallet can call finalizeCampaign on expired campaign
- [ ] Creator wallet still authorized (backward compatible)
- [ ] Finalization correctly transitions campaign status to Success/Failed based on goal
- [ ] Full lifecycle works with permissionless finalization (non-creator creates, pledges, finalizes, releases/refunds)
- [ ] Existing v1.1 campaigns (creator lock) still work on testnet (if not wiped)
- [ ] New v1.2 campaigns use new campaign-lock and are permissionlessly finalizable

### Implementation Checklist for v1.2

- [ ] Create `contracts/campaign-lock/` directory
- [ ] Implement campaign lock validation logic (allow creator OR after deadline)
- [ ] Update `finalizeCampaign()` in transaction builder to use new lock
- [ ] Deploy campaign lock to testnet
- [ ] Update CONTRACTS constant in frontend with new campaign-lock code hash
- [ ] Update campaign creation to use campaign-lock instead of creator lock
- [ ] Update frontend finalization button visibility (remove isCreator check or make permissionless)
- [ ] Integration tests for permissionless finalization
- [ ] E2E test: non-creator finalizes campaign after deadline
