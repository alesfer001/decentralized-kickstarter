# Plan 04 Summary: Pledge Type Script Update (Merge + Partial Refund)

**Status:** Code complete, pending commit
**File modified:** `contracts/pledge/src/main.rs`

## Tasks Completed

### Task 04-01: Add new error codes
- Added 5 new error codes after `ERROR_MODIFICATION_NOT_ALLOWED` (10):
  - `ERROR_MERGE_DIFFERENT_CAMPAIGNS` = 11
  - `ERROR_MERGE_AMOUNT_MISMATCH` = 12
  - `ERROR_OVERFLOW` = 13
  - `ERROR_CAMPAIGN_MISMATCH` = 14
  - `ERROR_PARTIAL_REFUND_INVALID` = 15
- Existing error codes (7, 9, 10) preserved unchanged.

### Task 04-02: Add count_group_cells helper function
- Added `fn count_group_cells(source: Source) -> usize` before `program_entry`.
- Iterates `load_cell_data(i, source)` counting until `SysError::IndexOutOfBound`.

### Task 04-03: Implement validate_merge_pledge function
- Added `fn validate_merge_pledge() -> i8` implementing D-13.
- Loads first input's PledgeData for reference `campaign_id`.
- Iterates all GroupInput cells: verifies same `campaign_id`, sums `amount` with `checked_add`.
- Loads output PledgeData: verifies `campaign_id` matches and `amount == total_amount`.
- Returns appropriate error codes on failure, 0 on success.

### Task 04-04: Implement validate_partial_refund function
- Added `fn validate_partial_refund() -> i8` implementing D-14.
- Loads input and output PledgeData from GroupInput[0] and GroupOutput[0].
- Verifies `campaign_id` matches (ERROR_CAMPAIGN_MISMATCH on failure).
- Verifies `output_pledge.amount < input_pledge.amount` (ERROR_PARTIAL_REFUND_INVALID on failure).
- Receipt type script validates its own destruction separately.

### Task 04-05: Update (true, true) match arm
- Replaced unconditional `ERROR_MODIFICATION_NOT_ALLOWED` with routing logic:
  - `input_count >= 2 && output_count == 1` -> `validate_merge_pledge()` (merge N->1)
  - `input_count == 1 && output_count == 1` -> `validate_partial_refund()` (partial refund)
  - Otherwise -> `ERROR_MODIFICATION_NOT_ALLOWED` (invalid pattern rejected)
- Creation `(false, true)`, destruction `(true, false)`, and `(false, false)` cases unchanged.

## Verification Notes
- Code compiles: pending `cargo check` (sandbox restricted cargo execution)
- All new functions use existing ckb_std imports (load_cell_data, Source, SysError, debug)
- No new dependencies required
- Overflow protection via `checked_add` in merge summation
- File grew from 165 lines to 299 lines

## Commit Status
- Git write operations (add/commit) blocked by sandbox permissions
- All code changes applied to worktree at `contracts/pledge/src/main.rs`
- Changes visible in `git diff` (136 insertions, 3 deletions)
- Requires manual commit: `git add contracts/pledge/src/main.rs && git commit --no-verify -m "feat(pledge): add merge and partial refund support to pledge type script"`
