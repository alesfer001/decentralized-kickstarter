---
phase: v1.2-pre-review
reviewed: 2026-06-01T00:00:00Z
revised: 2026-06-01T00:00:00Z
depth: deep
files_reviewed: 10
files_reviewed_list:
  - contracts/campaign/src/main.rs
  - contracts/campaign/src/lib.rs
  - contracts/campaign-lock/src/main.rs
  - contracts/pledge/src/main.rs
  - contracts/pledge-lock/src/main.rs
  - contracts/receipt/src/main.rs
findings_initial:
  critical: 2
  warning: 3
  info: 1
findings_after_verification:
  medium: 3
  defense_in_depth: 1
  false_positive: 1
  design_as_intended: 1
status: actionable_findings_identified
---

# v1.2 Pre-Review: Trust Boundary Vulnerability Audit

**Reviewed:** 2026-06-01
**Depth:** Deep (cross-contract analysis)
**Files Reviewed:** 5 contracts (10 files)
**Status:** Actionable findings identified, folded into v1.2 Phase 8 scope

---

## Methodology Note

Initial automated review (gsd-code-reviewer agent) flagged 6 issues with severity classifications: 2 CRITICAL, 3 WARNING, 1 INFO. This revised assessment is the result of code-level verification of each finding against actual contract behavior. Two findings were demoted on cross-script invariant analysis (one to "design-as-intended", one to "false positive"). The remaining three findings are real medium-severity issues that fold cleanly into the already-planned v1.2 Phase 8 trust-tightening work.

The class of vulnerability we were hunting for: **scripts that trust manipulable external state instead of verifying it on-chain** — same lane as Arthur's finalization-status gap and Officeyutong's earlier 6 findings.

## Verified Findings (Actionable)

### M-01: Campaign Destruction Does Not Verify Pledge Cells Are Consumed

**File:** `contracts/campaign/src/main.rs:311-369`
**Severity:** Medium (DoS, not theft)
**Originally classified:** CRITICAL (CR-02) — downgraded after analysis

**Issue:** The campaign destruction path allows both Failed campaigns (unconditionally, lines 324-328) and Success campaigns (after grace period, lines 335-367) to be destroyed without verifying that pledge cells referencing this campaign are also being consumed in the same transaction.

**Real impact:**
- Failed campaign destroyed before all backers refund → backers locked out for up to grace period (1.9M blocks ≈ 180 days) because pledge-lock requires either the campaign cell_dep (now destroyed) or grace-period since field
- Success campaign destruction can only happen post-grace-period, so backers can immediately use the grace-period fail-safe path — minor impact

**Why this isn't critical theft:** Funds aren't stolen, just temporarily unrecoverable. Grace period eventually unblocks them.

**Fix sketch:** In both destruction branches, scan transaction inputs for cells whose type script matches the pledge contract code_hash. Reject if any pledge cells reference this campaign's TypeID but aren't being destroyed in the same tx.

**Folds into:** v1.2 Phase 8 (campaign accumulator + trust-boundary fixes)

---

### M-02: Receipt Destruction Does Not Require Paired Pledge Consumption

**File:** `contracts/receipt/src/main.rs:171-212`
**Severity:** Medium (invariant violation, not direct theft)
**Originally classified:** WARNING (WR-01) — confirmed as real

**Issue:** Receipt destruction (`validate_receipt_destruction`) verifies that *some* output exists to the backer's lock_hash with sufficient capacity (line 195). It does not verify that the paired pledge cell is being consumed in the same transaction.

**Real impact:** An attacker willing to burn capital can destroy a receipt while leaving the pledge cell intact (paying the refund output from another input source). The pledge cell then has inconsistent accounting — a receipt that should account for some portion of its amount no longer exists, but the pledge still holds the full amount. Subsequent partial refunds against that pledge produce surplus capacity that ends up routed under the merged pledge's lock args.

**Why this isn't critical theft:** Economically irrational (attacker pays to break accounting), and the resulting surplus still routes to the lock args' backer — not the attacker. But it breaks a load-bearing invariant and would be a sore point in an external audit.

**Fix sketch:** In `validate_receipt_destruction`, scan `Source::Input` for a pledge cell with matching code_hash. Reject if not found.

**Folds into:** v1.2 Phase 8 (campaign accumulator + trust-boundary fixes)

---

### M-03: Campaign-Lock Since Validation Is Less Defensive Than Pledge-Lock

**File:** `contracts/campaign-lock/src/main.rs:62-77`
**Severity:** Medium (defense-in-depth; CKB consensus mitigates practical exploit)
**Originally classified:** WARNING (WR-03) — confirmed as defense-in-depth gap

**Issue:** Campaign-lock compares `since_raw < lock_args.deadline_block` directly without first validating that the since encoding is absolute and flags are valid. Pledge-lock does this properly at `main.rs:335-338`. CKB consensus validates since encoding before scripts run, so practical exploit is near-impossible, but the asymmetry between the two locks is poor hygiene.

**Real impact:** None in production (consensus catches malformed since). Defense-in-depth gap only.

**Fix sketch:** Mirror pledge-lock's pattern — call `Since::new(since_raw)`, check `is_absolute()` and `flags_is_valid()`, then `extract_lock_value()` and match on `BlockNumber`. Reject malformed encodings explicitly.

**Folds into:** v1.2 Phase 8 (cheap to batch with the other contract changes)

---

## Demoted Findings

### D-01: Grace Period Refund — Design as Intended, with Caveat for v1.2

**File:** `contracts/pledge-lock/src/main.rs:366-378`
**Originally classified:** CRITICAL (CR-01)
**Verified classification:** Design as intended; one real follow-on for v1.2

**Why this isn't a vulnerability:** The grace-period refund routes funds to `lock_args.backer_lock_hash`. This value is committed into the pledge cell's lock script args at pledge creation time. To submit a grace-period refund, a caller must spend the pledge cell, which requires satisfying the lock — they can only refund their *own* pledge. The "attacker" in the original analysis is just a backer reclaiming their own funds via the documented fail-safe after 180+ days of failed release.

This is Officeyutong's Issue 1 fix working as designed: backers don't lose money if the campaign succeeds but the creator never finalizes, the bot is down for 6 months, or release otherwise never completes.

**Real follow-on for v1.2 (NOT a security issue, a fee-policy question):** When v1.2 ships fee-on-success-release enforcement via pledge-lock, the grace-period path bypasses the fee check (no campaign cell_dep means no fee_bps lookup possible). Decision needed:
- Accept that grace-period refunds skip the fee (rationalizable: by the time grace period expires, the campaign has failed operationally and the fee was never collected anyway)
- Add minimum fee handling to the grace-period branch
- Require config cell as cell_dep on grace-period refunds, so fee_bps is still readable

This is a Phase 9 (fee enforcement) design item, not a security fix.

---

### D-02: Pledge Merge "Backer Mismatch" — False Positive

**File:** `contracts/pledge-lock/src/main.rs:211-305` and `contracts/pledge/src/main.rs:121-178`
**Originally classified:** WARNING (WR-02)
**Verified classification:** False positive

**Why this isn't an issue:** The agent's analysis missed a cross-script invariant. `backer_lock_hash` is part of the pledge-lock args (bytes 40-71 in the 72-byte args layout). The pledge-lock's `validate_merge` function (lines 254-265) explicitly requires all `Source::GroupInput` cells to share an identical lock hash. Identical lock hash means identical lock args (code_hash + hash_type + args are all hashed together), which means identical `backer_lock_hash`.

The pledge *data* field also contains a `backer_lock_hash`, which the pledge type script doesn't cross-check against the lock args. But that data field is informational — fund routing during release and refund uses the lock args (`lock_args.backer_lock_hash`), not the data field. So even if the data field disagreed with the args, the routing decision is unaffected.

**Net:** The lock script's lock-hash equality check already enforces the invariant the reviewer expected to find missing in the type script.

---

### D-03: Receipt Code Hash vs Type Hash — Documented Tradeoff

**File:** `contracts/receipt/src/main.rs:76-160`
**Originally classified:** INFO (IN-01)
**Verified classification:** Acknowledged design tradeoff, no action

**Why no action:** Per contract comments (lines 78-80), this is an intentional choice to avoid a circular type-script-hash dependency between receipt and pledge. Documented and accepted.

---

## Summary Table (After Verification)

| ID | Issue | Severity | Status | Folds Into |
|----|-------|----------|--------|------------|
| M-01 | Campaign destruction pledge leak | Medium | Actionable | v1.2 Phase 8 |
| M-02 | Receipt destruction pledge consumption | Medium | Actionable | v1.2 Phase 8 |
| M-03 | Campaign-lock since validation | Medium (DiD) | Actionable | v1.2 Phase 8 |
| D-01 | Grace-period refund | Design as intended | Fee-policy item | v1.2 Phase 9 |
| D-02 | Pledge merge backer mismatch | False positive | No action | — |
| D-03 | Receipt code_hash vs type_hash | Documented tradeoff | No action | — |

## Recommendations

1. **Fold M-01, M-02, M-03 fixes into v1.2 Phase 8.** All three are trust-boundary tightenings in the same lane as the campaign accumulator work — same contracts, same review surface for Scalebit.
2. **Resolve D-01's fee-policy question in v1.2 Phase 9 design.** Pick one of the three options before contract changes land.
3. **Include this REVIEW.md and the v1.2 fixes in the Scalebit audit scope.** Frames the engagement as "verify the trust-boundary tightenings + new fee/treasury code" rather than open-ended.
4. **Use the demoted findings (D-01, D-02) as positive grant narrative.** "Pre-review surfaced X potential issues; after cross-script invariant verification, 3 are real medium-severity items folded into v1.2 scope, 2 are design-as-intended documented in REVIEW.md, 1 is a false positive caught by manual verification."

---

_Initial review: gsd-code-reviewer agent (automated)_
_Verification + revision: Manual cross-script analysis (Claude main)_
_Reviewed: 2026-06-01_
