# Phase 6: Security Hardening — Technical Research

**Researched:** 2026-04-16
**Source:** Officeyutong's CKBuilder Projects code review + contract source analysis

## Issue 1 — Fail-safe refund backdoor

### Current Code (pledge-lock/main.rs:327-340)
```rust
match find_campaign_in_cell_deps(&lock_args.campaign_type_script_hash) {
    Some(campaign_data) => {
        match campaign_data.status {
            CampaignStatus::Success => validate_release(&lock_args, &campaign_data),
            CampaignStatus::Failed => validate_refund(&lock_args),
            CampaignStatus::Active => ERROR_CAMPAIGN_STILL_ACTIVE,
        }
    }
    None => {
        // D-06: Fail-safe refund — no campaign cell_dep means default to backer refund
        debug!("No campaign cell_dep found — fail-safe refund to backer");
        validate_refund(&lock_args)
    }
}
```

### Attack Flow
1. Campaign finalized as Success (creator should receive funds)
2. Creator destroys campaign cell (currently unrestricted — campaign/main.rs:261-264 allows destruction)
3. Backer builds refund tx WITHOUT campaign cell_dep
4. Pledge-lock hits `None` branch → validates refund to backer
5. Backer steals funds that should have gone to creator

### Fix Strategy

**Step A — Remove None fallback:**
Replace `None => validate_refund` with `None => ERROR_CAMPAIGN_CELL_DEP_MISSING` (new error code).

**Step B — Grace period fail-safe (optional but recommended):**
Add a secondary check: if `since >= deadline_block + GRACE_PERIOD` and no cell_dep found, allow refund. This protects backers if the campaign cell is genuinely lost (creator disappears, campaign cell consumed by bug, etc.).

```rust
None => {
    // No campaign cell_dep found
    // Grace period: allow refund only if well past deadline
    let grace_deadline = lock_args.deadline_block.saturating_add(GRACE_PERIOD_BLOCKS);
    if since_block >= grace_deadline {
        debug!("Grace period expired — fail-safe refund allowed");
        validate_refund(&lock_args)
    } else {
        debug!("Campaign cell_dep required within grace period");
        ERROR_CAMPAIGN_CELL_DEP_MISSING
    }
}
```

GRACE_PERIOD_BLOCKS = ~180 days = 1,944,000 blocks at 8s/block (conservative).

**Step C — Campaign destruction protection:**
In campaign type script destruction path (campaign/main.rs:261-264), verify no pledge cells reference this campaign. Options:

Option 1 (on-chain): Check if any pledge-type cells appear in transaction inputs alongside the campaign destruction. If the transaction is a pure campaign-destroy (no pledge cells consumed), reject it while the campaign was Success. This isn't perfect — it doesn't know about pledges in other transactions.

Option 2 (off-chain only): The builder checks the indexer for live pledges before allowing destruction. Simpler, but a raw transaction can bypass it.

Option 3 (counter): Add an unresolved_pledge_count field to campaign data. Requires data layout change — breaking.

**Recommendation:** Option 1 with off-chain backup. On-chain: reject destruction of Success campaigns entirely (they must remain available for pledge-lock to reference). Failed campaign cells can be destroyed since refund only needs backer_lock_hash from lock args. Or simpler: just reject all destruction of finalized campaigns that weren't preceded by pledges being consumed.

Actually the simplest on-chain fix: reject campaign destruction if status was Success. Only allow destruction if status is Failed (refunds don't need the campaign cell since pledge-lock can use grace period) or if pledges were consumed in the same transaction.

Wait — with the fail-safe backdoor removed (Step A), destroying a Success campaign means pledges become permanently locked (no cell_dep → error). So we MUST prevent Success campaign destruction.

**Simplest fix:** In campaign destruction path, load the input campaign data, check status. If Success → reject destruction. If Failed → allow (backers have refund path). If Active → reject (shouldn't be destroyed while active).

```rust
// Destruction: has input, no output
(true, false) => {
    let data = match load_cell_data(0, Source::GroupInput) {
        Ok(d) => d,
        Err(_) => return ERROR_LOAD_DATA,
    };
    let campaign = match CampaignData::from_bytes(&data) {
        Ok(c) => c,
        Err(code) => return code,
    };
    // Only allow destruction of Failed campaigns
    // Success campaigns must remain for pledge-lock release
    // Active campaigns shouldn't be destroyed
    if campaign.status != CampaignStatus::Failed {
        debug!("Campaign destruction blocked: status must be Failed");
        return ERROR_DESTRUCTION_NOT_ALLOWED;
    }
    0
}
```

But wait — what about after all pledges for a Success campaign are released? The creator needs to reclaim the campaign cell capacity eventually. The campaign cell is locked with campaign-lock (custom), so anyone can spend it after deadline. The creator can destroy it via a transaction that consumes the campaign cell (past deadline) with no type script output.

The issue is distinguishing "all pledges released, safe to destroy" vs "pledges still exist, unsafe to destroy". On-chain, the campaign contract can't know if pledges still exist.

**Better approach:** Allow destruction of Success campaigns only when done in a transaction that ALSO releases pledges. If the transaction has pledge-lock inputs being spent (release path), the campaign can be destroyed alongside them. If no pledge-lock cells are consumed, reject destruction.

But this is complex to implement on-chain. The type script would need to detect pledge-lock cells by their code hash.

**Pragmatic approach:** Allow destruction of both Success and Failed campaigns, but only after the grace period. The grace period ensures all normal operations complete. Before grace period, only Failed campaigns can be destroyed.

```rust
(true, false) => {
    let data = load_cell_data(0, Source::GroupInput)?;
    let campaign = CampaignData::from_bytes(&data)?;
    
    if campaign.status == CampaignStatus::Failed {
        // Failed campaigns can always be destroyed (backers refund via pledge-lock)
        return 0;
    }
    if campaign.status == CampaignStatus::Active {
        return ERROR_DESTRUCTION_NOT_ALLOWED;
    }
    // Success: only allow after grace period
    // Check since field
    let since_raw = load_input_since(0, Source::GroupInput)?;
    // ... parse since, check >= deadline + GRACE_PERIOD
}
```

Hmm, but campaign type script is a type script, not a lock script. Type scripts don't have direct access to `load_input_since` in the same way... Actually, `load_input_since` works for any input cell in the transaction, and CKB provides it via syscalls. The campaign type script can call `load_input_since(0, Source::GroupInput)` to read the since field on the campaign cell input. But the since enforcement is done by the lock script (campaign-lock), not the type script. The type script can read the value but CKB doesn't enforce it for type scripts.

Wait — CKB enforces `since` constraints at the transaction level. The `since` field on an input is checked by the CKB consensus layer against the lock script's requirements. The type script doesn't need to enforce since — it's already enforced. But the type script CAN read the since value to make decisions.

For campaign destruction: the campaign cell is locked with campaign-lock (enforces `since >= deadline`). So destruction already requires being past the deadline. The type script just needs to additionally check the status:
- Failed → allow destruction (anytime past deadline)
- Success → reject destruction (or allow only after grace period)
- Active → shouldn't happen (finalization changes status)

I think the cleanest approach is:
1. Campaign type script: reject destruction if `status == Success`
2. Grace period fail-safe in pledge-lock handles the edge case where campaign is genuinely lost
3. For Success campaigns, creator can destroy ONLY after ALL pledges are released (enforced off-chain by builder checking indexer)
4. Add a grace period exception: if since >= deadline + GRACE_PERIOD, allow destruction even for Success (escape hatch)

This is getting complex. Let me simplify for the plan:

**Final recommendation for Issue 1:**
- pledge-lock: Remove None → refund, replace with grace period check
- campaign type: Restrict destruction — Failed campaigns only (or Success after grace period)
- Both changes are self-consistent: removing the backdoor + preventing its trigger

## Issue 2 — Receipt check too loose + refund not permissionless

### Current Code (receipt/main.rs:96-122)
Receipt creation only checks:
1. `pledge_amount > 0`
2. `backer_lock_hash != 0`
3. An output has lock args >= 72 bytes with matching `backer_lock_hash` at [40..72]

Does NOT check:
- Pledge type script hash (could be any cell with 72+ byte lock args)
- `pledge_amount` matches the actual pledge cell's amount
- Campaign reference matches

### Current Code (builder.ts permissionlessRefund)
```typescript
// Requires receipt as input — locked with backer's secp256k1
// Only backer can sign → not permissionless
```

### Fix Strategy

**Receipt creation hardening:**
1. Find sibling pledge cell by type script hash (not just lock args length)
2. Read pledge cell data, parse PledgeData
3. Assert `pledge.amount == receipt.pledge_amount`
4. Assert `pledge.backer_lock_hash == receipt.backer_lock_hash`

This requires the receipt type script to know the pledge type script hash. Two options:
- Store pledge_type_hash in receipt args (adds 32 bytes to args)
- Pass pledge code hash as compile-time constant (hardcoded — not ideal for redeployment)
- Scan outputs and match by data structure (72-byte data that parses as valid PledgeData) — fragile

**Recommendation:** Store pledge_type_script_hash in receipt args (first 32 bytes). Receipt already has empty args — this is the right place.

**Permissionless refund:**
Drop receipt from refund transaction inputs. Pledge-lock already validates refund routing (capacity → backer_lock_hash). Receipt is not needed for the refund to be correct.

In `builder.ts permissionlessRefund()`: remove the code that finds and adds the receipt cell as an input. Only add the pledge cell as input. The pledge-lock validates the output destination.

This means receipts are never consumed during refund — they remain as proof-of-contribution. Backers can destroy their receipt cells separately to reclaim the ~300 CKB capacity.

## Issue 3 — validate_partial_refund doesn't cross-check

### Current Code (pledge/main.rs:181-217)
```rust
// Only checks: output.amount < input.amount
// Doesn't verify: difference == receipt.pledge_amount
```

### Fix Strategy
In `validate_partial_refund`:
1. Scan inputs for a receipt cell being destroyed (has receipt type hash in GroupInput... no, receipt is a different type script)
2. Actually, scan ALL transaction inputs for a cell with the receipt type script hash
3. Read receipt data, get `pledge_amount`
4. Assert `input_pledge.amount - output_pledge.amount == receipt.pledge_amount`

This requires the pledge type script to know the receipt type script hash. Same options as Issue 2. Store `receipt_type_script_hash` in pledge args? Pledge currently has empty args.

**Alternative:** Use a well-known receipt code hash (compile-time constant) or pass via cell_deps.

**Recommendation:** Store receipt_type_script_hash in pledge type script args (32 bytes). This makes the pledge type script aware of its companion receipt contract.

Wait — but then existing pledge cells (with empty args) won't have this. We're doing a clean deployment for v1.1, so new pledge cells will have the args.

Actually, in CKB, type script args are set when the cell is created. For pledge type scripts, the args are currently empty (`"0x"`). Adding 32 bytes of args to store the receipt type hash would work for new pledge cells.

But this is a design change that affects serialization, deployment, and the builder. Let me think of a simpler way.

**Simpler approach:** The pledge type script can scan all inputs for cells whose data matches receipt format (40 bytes) and whose type script is the same hash as one of the cell_deps. This is fragile though.

**Simplest approach:** Accept that the pledge type script can't easily cross-check the receipt without knowing the receipt type hash. Instead, rely on the overall transaction validity — the receipt type script validates its own destruction (checks amount matches), and the pledge type script validates the amount reduction. Together they enforce correctness.

But Officeyutong's point is that without cross-checking, someone could create a fake "receipt" with any amount and use it to justify an arbitrary partial refund.

**Practical approach:** Pass the receipt code hash via the pledge type script args. For the clean v1.1 deployment, set pledge type args = receipt_type_script_hash (32 bytes).

## Issue 4 — Merge deadline + lock args

### Current Code (pledge-lock/main.rs:301-324)
```rust
let is_after_deadline = if since_raw == 0 {
    false  // before deadline
} else { ... };

if !is_after_deadline {
    return validate_merge(&lock_args);
}
```

Problem: `since_raw == 0` doesn't prove we're before the deadline. It just means no since constraint was set. The actual block height could be past the deadline.

### Fix Strategy

**Option A — Check actual block height:** Use `load_header(0, Source::GroupInput)` to get current block number and compare to `lock_args.deadline_block`. Problem: `load_header` requires the header dep to be provided, which adds complexity.

**Option B — Require since != 0 for merge path too:** If since > 0 AND since < deadline → merge allowed. If since == 0, reject (can't prove timing). If since >= deadline → post-deadline path.

**Option C — Require `since < deadline` explicitly:** Set since = current_block in merge transactions. Lock validates `since < deadline_block`. CKB enforces that the actual block is >= since, so `since < deadline` proves we're before the deadline... no, it doesn't. since < deadline just means the constraint is less than deadline. The actual block could still be past deadline.

Actually, CKB's `since` field is a MINIMUM constraint, not an exact block. `since = 500` means "this transaction can only be included in block >= 500". So setting `since = current_block` when current_block = 450 and deadline = 500 means the transaction is valid at block 450+ (including 501, which is past deadline).

**The correct approach:** The merge path should require `since != 0` AND the parsed since value must be `< deadline_block`. But as noted, CKB's since is a floor, not a ceiling. A tx with since=450 can be included in block 501.

**Hmm.** On CKB, there's no way to enforce "this transaction must be included BEFORE block X" using the since field. The since field only enforces a lower bound.

**Pragmatic approach:** The merge path doesn't need since-based timing. Instead, the lock script can verify that the merge output cell still has the same lock script (same args = same deadline). This means the funds remain locked with the same deadline constraints. Post-deadline, the release/refund path handles them. The merge path is just an optimization before release/refund.

So the fix is simpler: ensure merge doesn't allow extracting funds. The current `validate_merge` already checks capacity preservation and single output. The risk Officeyutong identified is that merging after deadline is pointless (should use release/refund instead). But it's not actually harmful — the output is still locked with the same pledge-lock, so funds can't be stolen.

**Revised fix for Issue 4:**
1. Assert all group inputs share identical lock args (not just lock hash). This is technically redundant since identical lock hash implies identical lock args (lock hash = hash(code_hash + hash_type + args)), but adds defense in depth.
2. Skip the deadline check for merge — it's not a security issue, just a wasted transaction. Or add it as a soft check (reject merge after deadline to save gas).

Actually, reading Officeyutong's comment again: "Also `validate_merge` doesn't assert all group inputs share identical lock args." — The lock hash comparison already covers this. But let me add the explicit check anyway for clarity.

## Issue 5 — Finalization since >= deadline_block

### Current Code (campaign/main.rs:139-174)
Finalization validates state transition but never checks the since field.

### Fix Strategy
Add to `validate_finalization()`:
```rust
let since_raw = load_input_since(0, Source::GroupInput)
    .map_err(|_| ERROR_LOAD_SINCE)?;
// Parse since, extract block number, check >= old.deadline_block
```

This is straightforward — follows the same since-parsing pattern from pledge-lock and campaign-lock.

Note: the campaign-lock (lock script) already enforces `since >= deadline_block`. This addition makes the type script also enforce it, providing defense in depth. Even if the lock script is somehow bypassed or replaced, the type script still gates finalization on the deadline.

## Issue 6 — Smaller items

### 6a — Indexer network client
The indexer currently has a hard-coded `ClientPublicTestnet` in some code path. Need to verify current state and fix.

### 6b — Reserved bytes + metadata check
In `validate_finalization`: add `old_data[57..65] == new_data[57..65]` check for reserved bytes. For metadata, check `old_data[65..] == new_data[65..]` (metadata tail preserved).

### 6c — Capacity buffer in UI
Already fixed in Phase 15.5.3 (BUG-4). Verify it's still working correctly.

---

*Phase: 06-security-hardening-officeyutong-review*
*Research completed: 2026-04-16*
