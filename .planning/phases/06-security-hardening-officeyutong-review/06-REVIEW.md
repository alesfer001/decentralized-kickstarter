---
phase: 06-security-hardening-officeyutong-review
reviewed: 2026-04-16T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - contracts/campaign/src/main.rs
  - contracts/pledge-lock/src/main.rs
  - contracts/pledge/src/main.rs
  - contracts/receipt/src/main.rs
  - off-chain/indexer/src/indexer.ts
  - off-chain/transaction-builder/src/builder.ts
  - off-chain/transaction-builder/src/types.ts
  - off-chain/transaction-builder/test-v1.1-lifecycle.ts
  - off-chain/transaction-builder/test-v1.1-security.ts
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 06: Security Hardening Review Report

**Reviewed:** 2026-04-16
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

This review examines security fixes addressing Officeyutong's CKB core developer code review. The codebase implements hardening measures for:
- Fail-safe refund backdoor (pledge-lock grace period + campaign destruction protection)
- Receipt creation cross-checks + permissionless refund
- Partial refund amount cross-checks
- Merge path hardening
- Deadline enforcement in finalization
- Indexer network client and metadata validation

The implementation demonstrates strong security fundamentals with proper error handling and overflow protection. However, 2 critical issues and 4 warnings were identified related to null/undefined safety, type casting risks, and catch-block error handling.

## Critical Issues

### CR-01: Missing Null/Undefined Check in finalizeCampaign

**File:** `off-chain/transaction-builder/src/builder.ts:201-204`

**Issue:** The `finalizeCampaign` method uses the non-null assertion operator (`!`) on `campaignTx` without checking if the transaction fetch succeeded. If the RPC call returns `undefined` or the transaction doesn't exist, this will throw an unhandled error rather than failing gracefully.

**Lines affected:** 201-204

```typescript
const campaignTx = await this.client.getTransaction(params.campaignOutPoint.txHash);
const originalOutput = campaignTx!.transaction!.outputs[params.campaignOutPoint.index];
const typeIdArgs = originalOutput.type!.args;
const originalCapacity = BigInt(originalOutput.capacity);
```

**Fix:**

```typescript
const campaignTx = await this.client.getTransaction(params.campaignOutPoint.txHash);
if (!campaignTx || !campaignTx.transaction) {
  throw new Error(`Failed to fetch campaign transaction: ${params.campaignOutPoint.txHash}`);
}
const originalOutput = campaignTx.transaction.outputs[params.campaignOutPoint.index];
if (!originalOutput || !originalOutput.type) {
  throw new Error("Campaign output missing or has no type script");
}
const typeIdArgs = originalOutput.type.args;
const originalCapacity = BigInt(originalOutput.capacity);
```

**Severity:** Critical — This is a runtime crash vulnerability in a production transaction path.

---

### CR-02: Missing Null/Undefined Check in Indexer getTxData

**File:** `off-chain/indexer/src/indexer.ts:246-247`

**Issue:** In the `indexAll` method, the code attempts to access transaction outputs without fully validating the response structure. While there is a guard `if (txData?.transaction)`, the code still uses optional chaining and assumes the transaction structure is correct. If `cell.outPoint.txHash` points to an invalid or malformed transaction, the parsing could silently fail and store incomplete data.

**Lines affected:** 244-261

```typescript
const lookupTxHash = originalTxHash || cell.outPoint.txHash;
try {
  const txData = await this.client.getTransaction(lookupTxHash);
  if (txData?.transaction) {
    for (const output of txData.transaction.outputs) {
      const script = ccc.Script.from(output.lock);
      const lockHash = script.hash();
      if (lockHash === data.creatorLockHash) {
        creatorLock = {
          codeHash: script.codeHash,
          hashType: script.hashType,
          args: script.args,
        };
        break;
      }
    }
  }
} catch {}
```

**Fix:**

```typescript
const lookupTxHash = originalTxHash || cell.outPoint.txHash;
try {
  const txData = await this.client.getTransaction(lookupTxHash);
  if (txData?.transaction && txData.transaction.outputs && txData.transaction.outputs.length > 0) {
    for (const output of txData.transaction.outputs) {
      if (!output.lock) continue; // Skip outputs with missing lock script
      try {
        const script = ccc.Script.from(output.lock);
        const lockHash = script.hash();
        if (lockHash === data.creatorLockHash) {
          creatorLock = {
            codeHash: script.codeHash,
            hashType: script.hashType,
            args: script.args,
          };
          break;
        }
      } catch (scriptError) {
        console.warn(`Failed to parse lock script in transaction ${lookupTxHash}:`, scriptError);
        continue;
      }
    }
  }
} catch (error) {
  console.warn(`Failed to fetch or parse transaction ${lookupTxHash}:`, error);
}
```

**Severity:** Critical — Silent data corruption in indexer could lead to incorrect campaign state tracking on the frontend.

---

## Warnings

### WR-01: Empty Catch Block with Silent Failure

**File:** `off-chain/indexer/src/indexer.ts:261`

**Issue:** The catch block at line 261 silently swallows all errors without logging or handling them. This makes debugging difficult and hides potential issues with creator lock script lookup. The catch block should at minimum log warnings.

**Lines affected:** 261

```typescript
} catch {}
```

**Fix:**

```typescript
} catch (error) {
  console.warn(`Failed to extract creator lock script for campaign ${cell.outPoint.txHash}:`, error);
}
```

**Severity:** Warning — Silent failures reduce observability and make troubleshooting harder in production.

---

### WR-02: Type Assertion `as any` in Transaction Builder

**File:** `off-chain/transaction-builder/src/builder.ts:222`

**Issue:** Using `any[]` type for the `outputs` array loses type safety. This could allow incorrect output structures to be added without compile-time detection.

**Lines affected:** 222

```typescript
const outputs: any[] = [
```

**Fix:**

```typescript
interface CellOutput {
  capacity: bigint;
  lock: { codeHash: string; hashType: string; args: string };
  type?: { codeHash: string; hashType: string; args: string };
}

const outputs: CellOutput[] = [
```

**Severity:** Warning — Type safety issue that could allow runtime errors if output structure changes.

---

### WR-03: Unsafe Array Access Without Index Check

**File:** `off-chain/transaction-builder/src/builder.ts:202`

**Issue:** Even with the null check on `campaignTx`, the code accesses `outputs[params.campaignOutPoint.index]` without verifying the index is within bounds.

**Lines affected:** 202

```typescript
const originalOutput = campaignTx!.transaction!.outputs[params.campaignOutPoint.index];
```

**Fix:**

```typescript
const outputs = campaignTx.transaction.outputs;
if (params.campaignOutPoint.index >= outputs.length) {
  throw new Error(`Output index ${params.campaignOutPoint.index} out of bounds (transaction has ${outputs.length} outputs)`);
}
const originalOutput = outputs[params.campaignOutPoint.index];
```

**Severity:** Warning — Index out of bounds could cause runtime crash if output_index is invalid.

---

### WR-04: Hardcoded Lock Script Code Hash

**File:** `off-chain/transaction-builder/src/builder.ts:249`

**Issue:** The SECP256K1 lock script code hash is hardcoded when creating the change output in `finalizeCampaign`. This assumes the creator uses the standard SECP256K1 lock, but if they use a different lock script type (multisig, JoyID, etc.), the change output will go to the wrong lock.

**Lines affected:** 248-251

```typescript
outputs.push({
  capacity: excessCapacity,
  lock: {
    codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
    hashType: "type",
    args: params.campaignData.creatorLockHash,
  },
});
```

**Issue:** The code extracts `creatorLockHash` (which is only the args, not the full lock script), but hardcodes the code hash. This will only work if the creator's actual lock script hash matches the hardcoded SECP256K1 hash. This is a **logic error**, not just a code smell.

**Fix:**

Pass the full creator lock script info (code hash, hash type, args) in the `FinalizeCampaignParams` instead of just the lock hash:

```typescript
export interface FinalizeCampaignParams {
  campaignOutPoint: { txHash: string; index: number };
  campaignData: { /* ... */ };
  newStatus: CampaignStatus.Success | CampaignStatus.Failed;
  creatorLockScript: { codeHash: string; hashType: string; args: string }; // Add this
}
```

Then use it:

```typescript
outputs.push({
  capacity: excessCapacity,
  lock: params.creatorLockScript,
});
```

**Severity:** Warning — Change output routing fails if creator uses non-standard lock script, causing funds to be locked permanently.

---

## Info

### IN-01: Empty Catch Block Without Error Context

**File:** `off-chain/transaction-builder/test-v1.1-lifecycle.ts:78`

**Issue:** Empty catch block `} catch {}` at line 78 in the transaction wait helper swallows errors silently.

**Lines affected:** 78

```typescript
async function waitForTx(client: ccc.Client, txHash: string, timeout = 60000): Promise<void> {
  // ...
  while (Date.now() - start < timeout) {
    try {
      const tx = await client.getTransaction(txHash);
      if (tx && tx.status === "committed") {
        console.log("  Confirmed!");
        return;
      }
    } catch {}  // <-- Should log
    await sleep(3000);
  }
}
```

**Fix:**

```typescript
} catch (error) {
  // Transaction not found yet or RPC error — this is expected during polling
  // Continue waiting
}
```

**Severity:** Info — Test-only code, but good practice for debugging failed test runs.

---

### IN-02: Missing Validation of Receipt Type Script Args

**File:** `off-chain/transaction-builder/src/builder.ts:492-493`

**Issue:** The receipt and pledge type script args are constructed by slicing the code hash without validation:

```typescript
const pledgeTypeScriptArgs = ccc.hexFrom(this.receiptContract.codeHash.slice(2));
const receiptTypeScriptArgs = ccc.hexFrom(this.pledgeContract.codeHash.slice(2));
```

This assumes the code hashes are valid hex strings with the `0x` prefix. If `codeHash` is malformed, `slice(2)` could produce invalid args.

**Lines affected:** 492-493

**Fix:**

```typescript
if (!this.receiptContract.codeHash.startsWith("0x") || this.receiptContract.codeHash.length !== 66) {
  throw new Error(`Invalid receipt contract code hash: ${this.receiptContract.codeHash}`);
}
const pledgeTypeScriptArgs = ccc.hexFrom(this.receiptContract.codeHash.slice(2));

if (!this.pledgeContract.codeHash.startsWith("0x") || this.pledgeContract.codeHash.length !== 66) {
  throw new Error(`Invalid pledge contract code hash: ${this.pledgeContract.codeHash}`);
}
const receiptTypeScriptArgs = ccc.hexFrom(this.pledgeContract.codeHash.slice(2));
```

**Severity:** Info — Low risk because code hashes come from deployment artifacts, but improves robustness.

---

### IN-03: Inconsistent Error Handling Pattern in Parser

**File:** `off-chain/indexer/src/parser.ts:81`

**Issue:** The parser silently catches metadata parsing errors (line 81) without distinguishing between different error types. If metadata parsing fails due to malformed data vs. RPC error, the behavior should differ.

**Lines affected:** 81

```typescript
} catch {
  // Metadata parsing failed — ignore and return without metadata
}
```

**Rationale:** This is intentional for metadata robustness (continue without metadata if parsing fails), but the comment clarifies intent.

**Suggestion:** Keep as-is since this is defensive parsing. The comment is sufficient.

**Severity:** Info — Current implementation is acceptable for metadata resilience.

---

## Recommendations Summary

**Immediate Actions (Critical):**
1. Fix null/undefined checks in `finalizeCampaign` (CR-01)
2. Add proper transaction validation in indexer `getTxData` (CR-02)

**High Priority (Warnings):**
1. Remove empty catch blocks and add logging (WR-01)
2. Replace `any[]` with proper types (WR-02)
3. Add array bounds checking (WR-03)
4. Fix creator lock script hardcoding issue (WR-04) — This is a real bug that breaks non-SECP256K1 creators

**Medium Priority (Info):**
1. Add validation for code hash inputs (IN-02)
2. Improve test error logging (IN-01)

---

_Reviewed: 2026-04-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
