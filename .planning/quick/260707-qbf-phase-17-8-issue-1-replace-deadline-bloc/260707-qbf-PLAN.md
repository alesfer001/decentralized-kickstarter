---
task: Phase 17.8 Issue 1 — Replace Deadline Block-Number Input with Datetime Picker
mode: quick
created: 2026-07-07
autonomous: true
---

## Objective

Replace the raw `deadline_block` number input in the create-campaign form with an HTML5 `datetime-local` picker. Converts user's chosen datetime to block number using CKB's ~10s/block rate. Shows helper text with current block and estimated deadline block so users trust the conversion.

**Why:** Blockchain jargon (raw block numbers) is not user-friendly. DateTime picker is more intuitive for creators setting a deadline.

**What:** Single-file changes to form + utility functions for datetime↔block conversion.

## Context

@/Users/ayoublesfer/Documents/Dev/decentralized-kickstarter/.planning/STATE.md
@/Users/ayoublesfer/Documents/Dev/decentralized-kickstarter/CLAUDE.md

**Key constraints:**
- CKB block time ≈ 10 seconds (estimate; actual deadline is still the block number on-chain)
- Use browser's local timezone (datetime-local is naive)
- Min deadline: 1 hour in future (360 blocks) so campaigns can't expire instantly
- Reuse existing block↔time helpers from utils.ts
- Frontend build must pass
- DO NOT change campaign detail page (already uses humanly-readable utils)

**Implementation pattern:**
1. Add helper functions to `utils.ts`: `datetimeToBlockNumber()` and `blockNumberToDatetime()`
2. Refactor form state: `deadlineBlocks` → `deadlineDateTime`
3. Update input: `<input type="number">` → `<input type="datetime-local">`
4. Update validation: Check that datetime is ≥1 hour in future
5. Show helper: "Current block: #21,518,094. Estimated deadline block: #21,519,000."

---

## Tasks

### Task 1: Add datetime↔block conversion functions to utils.ts

**Files:** `off-chain/frontend/src/lib/utils.ts`

**Action:**
Add two helper functions at the end of utils.ts (after `formatCost()`):

1. `datetimeToBlockNumber(datetimeString: string, currentBlockNumber: bigint, currentBlockTimestampSeconds?: number): bigint`
   - Parameters: 
     - `datetimeString`: value from `<input type="datetime-local">` (ISO 8601 format, no TZ)
     - `currentBlockNumber`: current tip block (e.g., 21518094n)
     - `currentBlockTimestampSeconds`: optional current Unix timestamp in seconds; if omitted, use `Date.now() / 1000`
   - Logic:
     ```
     const targetDate = new Date(datetimeString + 'Z');  // Append 'Z' to treat as UTC if needed, or use browser local
     const targetSeconds = targetDate.getTime() / 1000;
     const blocksSinceNow = (targetSeconds - (currentBlockTimestampSeconds ?? Date.now() / 1000)) / 10;
     return currentBlockNumber + BigInt(Math.ceil(blocksSinceNow));
     ```
   - Return early with `currentBlockNumber + 360n` (1 hour) if result is too close (handles browser TZ edge case)
   - JSDoc: "Convert datetime-local picker value to estimated block number using ~10s/block rate. Returns ceiling (round up blocks)."

2. `blockNumberToDatetime(blockNumber: bigint, currentBlockNumber: bigint, currentBlockTimestampSeconds?: number): string`
   - Parameters:
     - `blockNumber`: target block number
     - `currentBlockNumber`: current tip block
     - `currentBlockTimestampSeconds`: optional current Unix timestamp; if omitted, use `Date.now() / 1000`
   - Logic:
     ```
     const blocksDiff = Number(blockNumber - currentBlockNumber);
     const secondsDiff = blocksDiff * 10;
     const targetSeconds = (currentBlockTimestampSeconds ?? Date.now() / 1000) + secondsDiff;
     const date = new Date(targetSeconds * 1000);
     return date.toISOString().slice(0, 16);  // Format: YYYY-MM-DDTHH:mm
     ```
   - JSDoc: "Convert block number to datetime-local format string (YYYY-MM-DDTHH:mm)."

**Verify:** Functions exist and export cleanly. No syntax errors. `npm run build` passes in frontend directory.

**Done:** 
- Two helper functions added to utils.ts
- Both exported and ready for import
- JSDoc comments included
- Functions handle edge cases (min 1 hour, ceiling blocks)

---

### Task 2: Refactor create-campaign form to use datetime picker

**Files:** `off-chain/frontend/src/app/campaigns/new/page.tsx`

**Action:**
Replace the `deadlineBlocks` number input with a `datetime-local` picker.

**Changes:**
1. Import new helpers: `import { datetimeToBlockNumber, blockNumberToDatetime } from "@/lib/utils";`

2. Replace state variable (line 25):
   - OLD: `const [deadlineBlocks, setDeadlineBlocks] = useState("");`
   - NEW: `const [deadlineDateTime, setDeadlineDateTime] = useState("");`

3. Update `validateDeadline()` function (line 64-76):
   - OLD logic: Parse as integer, check if > 0 and > currentBlock
   - NEW logic:
     ```typescript
     function validateDeadline(): boolean {
       if (!deadlineDateTime.trim()) {
         setDeadlineError("Please select a deadline date and time");
         return false;
       }
       if (currentBlock === null) {
         setDeadlineError("Unable to determine current block — please refresh");
         return false;
       }
       
       const targetDate = new Date(deadlineDateTime + 'Z');
       if (isNaN(targetDate.getTime())) {
         setDeadlineError("Invalid date/time format");
         return false;
       }
       
       const minDateTime = new Date(Date.now() + 3600 * 1000); // 1 hour from now
       if (targetDate < minDateTime) {
         setDeadlineError("Deadline must be at least 1 hour in the future");
         return false;
       }
       
       setDeadlineError(null);
       return true;
     }
     ```

4. Update `handleSubmit()` (line 78-209):
   - Change line 93-94 from:
     ```typescript
     const goal = parseFloat(fundingGoal);
     const deadline = parseInt(deadlineBlocks);
     ```
     To:
     ```typescript
     const goal = parseFloat(fundingGoal);
     const deadline = datetimeToBlockNumber(deadlineDateTime, currentBlock!);
     ```
   - Rest of the function stays the same (deadline is already a BigInt from the helper)

5. Replace the deadline input field (line 347-385):
   - OLD: `<input type="number" id="deadlineBlocks" ...`
   - NEW: 
     ```jsx
     <div>
       <label htmlFor="deadlineDateTime" className="block text-sm font-medium mb-2">
         Campaign Deadline <span className="text-red-500">*</span>
       </label>
       <input
         type="datetime-local"
         id="deadlineDateTime"
         value={deadlineDateTime}
         onChange={(e) => {
           setDeadlineDateTime(e.target.value);
           if (deadlineError) setDeadlineError(null);
         }}
         onBlur={validateDeadline}
         className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
           deadlineError
             ? "border-red-400 dark:border-red-600"
             : "border-zinc-300 dark:border-zinc-700"
         }`}
         disabled={loading}
       />
       <div className="mt-1">
         {deadlineError ? (
           <p className="text-sm text-red-600 dark:text-red-400">{deadlineError}</p>
         ) : (
           <div className="text-sm text-zinc-500 space-y-1">
             <p>Select when the campaign ends</p>
             {currentBlock !== null && deadlineDateTime && (
               <p className="text-xs text-zinc-400">
                 Current block: #{currentBlock.toLocaleString()}. 
                 Estimated deadline block: #{datetimeToBlockNumber(deadlineDateTime, currentBlock).toLocaleString()}.
               </p>
             )}
           </div>
         )}
       </div>
     </div>
     ```

6. Update form validation call (line 87-90):
   - Change `deadlineValid` to use the new validation logic (already updated in step 3)

**Verify:** 
- Form renders without errors
- DateTime picker input appears (type="datetime-local")
- Helper text shows current block and estimated deadline block
- Validation enforces ≥1 hour minimum
- Create campaign flow still works end-to-end (can submit and reach indexer polling)

**Done:**
- Form state updated to use `deadlineDateTime`
- Validation enforces 1-hour minimum and valid datetime
- Input is datetime-local, not number
- Helper text shows block estimate
- Form can be submitted and campaign created successfully

---

## Validation Checklist

- [ ] `npm run build` succeeds in `off-chain/frontend/`
- [ ] Dev server starts: `npm run dev`
- [ ] Create campaign form loads with datetime picker (no block number input)
- [ ] Helper text shows "Current block: #X. Estimated deadline block: #Y."
- [ ] Can select a datetime at least 1 hour in future
- [ ] Validation rejects datetimes less than 1 hour away
- [ ] Form submission converts datetime to block number and creates campaign
- [ ] Campaign appears in indexer after a few seconds

## Effort & Time

~2 hours estimated:
- 30 min: Add conversion functions + verify
- 1 hr: Refactor form component (state, validation, JSX)
- 30 min: Test end-to-end (dev server, form submission, indexer sync)

## Notes

- Datetime-local is browser-local timezone (no explicit TZ selector) — acceptable per spec
- Conversion uses ~10s/block as estimate; on-chain deadline is still the block number
- No backend/contract changes needed; client-side only
- Existing campaign detail page already shows humanly-readable block times via `blocksToTimeEstimate()` — no changes there
- No "advanced" toggle for raw block input — remove blockchain jargon entirely per yfeng's feedback
