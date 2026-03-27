# Wave 3 Summary: Integration Test Script

**Completed:** 2026-03-26
**Plan:** 02-03-PLAN.md
**Status:** Task 02-03-01 implemented

## Tasks Completed

### Task 02-03-01: Create v1.1 lifecycle integration test script
- Created `off-chain/transaction-builder/test-v1.1-lifecycle.ts` with 3 end-to-end scenarios
- Follows the pattern established by `test-lifecycle.ts` but targets v1.1 trustless operations
- Uses 3 devnet accounts: creator, backer, and trigger (third-party)
- Loads contract info from `deployment/deployed-contracts-devnet.json` with error handling

### Scenario 1: Success Lifecycle with Permissionless Release
- Create campaign with 100 CKB goal and short deadline
- Backer pledges 150 CKB using `createPledgeWithReceipt` (atomic pledge + receipt)
- Wait for deadline, creator finalizes as `CampaignStatus.Success`
- Third party (trigger account) calls `permissionlessRelease` to route funds to creator
- Validates that anyone can trigger release after success finalization

### Scenario 2: Failure Lifecycle with Permissionless Refund
- Create campaign with 1000 CKB goal (unreachably high)
- Backer pledges 50 CKB with receipt (far below goal)
- Wait for deadline, creator finalizes as `CampaignStatus.Failed`
- Backer calls `permissionlessRefund` consuming both pledge and receipt cells
- Validates refund returns pledge + receipt capacity to backer

### Scenario 3: Merge Pledges Then Release
- Create campaign with 100 CKB goal and longer deadline (15 blocks)
- Backer makes 3 separate 50 CKB pledges with receipts
- Calls `mergeContributions` to combine 3 pledge cells into 1
- Uses `serializePledgeLockArgs` to construct proper lock args for merged cell
- Wait for deadline, creator finalizes as Success
- Third party calls `permissionlessRelease` from the merged cell
- Validates merge + release flow end-to-end

## Key Implementation Details

- **Helper: `getCampaignTypeScriptHash`** -- Fetches the campaign cell from chain and computes its full type script hash (including TypeID args). This is NOT the code hash; it is the unique identifier for the specific campaign cell's type script.
- **Contract loading** -- Try/catch loading from `deployed-contracts-devnet.json` with clear error message if file not found. Extracts `campaign`, `pledge`, `pledgeLock`, `receipt` entries.
- **TransactionBuilder constructor** -- Passes all 4 contract infos (campaign, pledge, pledgeLock, receipt) per the v1.1 extended constructor from wave 02.
- **Capacity from chain** -- Each scenario queries actual on-chain capacity via `client.getTransaction()` rather than computing it, avoiding mismatch issues.

## Files Created
1. `off-chain/transaction-builder/test-v1.1-lifecycle.ts` -- v1.1 integration test script

## Acceptance Criteria Verification
All 12 acceptance criteria from the plan are satisfied:
- File exists at correct path
- `testSuccessWithPermissionlessRelease` -- present (2 occurrences: definition + call)
- `testFailureWithPermissionlessRefund` -- present (2 occurrences)
- `testMergeThenRelease` -- present (2 occurrences)
- `triggerKey` -- present (3 occurrences: definition + 2 usages)
- `triggerSigner` -- present (4 occurrences: 2 definitions + 2 usages)
- `permissionlessRelease` -- present (2 occurrences: scenarios 1 and 3)
- `permissionlessRefund` -- present (1 occurrence: scenario 2)
- `mergeContributions` -- present (1 occurrence: scenario 3)
- `getCampaignTypeScriptHash` -- present (4 occurrences: definition + 3 calls)
- `deployed-contracts-devnet.json` -- present (2 occurrences: path + error message)
- `ALL v1.1 TESTS PASSED` -- present (1 occurrence: main success message)
