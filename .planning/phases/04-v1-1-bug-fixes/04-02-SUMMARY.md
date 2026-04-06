---
phase: 04-v1-1-bug-fixes
plan: 02
status: complete
completed_date: 2026-04-06
duration: "~15 minutes"
tasks_completed: 5
files_created: 0
files_modified: 6
key_commits:
  - hash: "250d8d0"
    message: "feat(04-05): clarify creator-only finalization to non-creators"
  - hash: "f5c4528"
    message: "fix(04-02): update campaign detail page to use API backerCount"
---

# Phase 04 Plan 02: Accurate Backer Count Summary

**BUG-05 Fixed:** Campaign listing and detail pages now display accurate backer count that includes both live pledges and receipt cells.

## Objective

Fix backer count display on campaign listing and detail pages. Previously, campaign cards only counted live pledges from the pledges table, ignoring receipt cells. Since v1.1 introduces receipt cells as proof of pledges (created after fund distribution), both sources must be counted to show the true number of unique backers.

## What Was Built

### 1. Database Layer: Unique Backer Count Calculation

**File:** `off-chain/indexer/src/database.ts`

Added `getUniqueBackerCount(campaignId: string)` method to the Database class:

- Queries `pledges` table for unique backer lock hashes filtered by campaign ID
- Queries `receipts` table for unique backer lock hashes filtered by campaign ID
- Normalizes all lock hashes to lowercase for consistent comparison
- Merges both sets to get unique backers across both tables
- Returns count of unique backer lock hashes
- Handles empty results gracefully (returns 0)

**Implementation pattern:**
```typescript
// Get unique from pledges
const pledgeBackers = new Set(
  db.prepare("SELECT DISTINCT backer_lock_hash FROM pledges WHERE campaign_id = ?")
    .all(normalizedId)
    .map(row => row.backer_lock_hash.toLowerCase())
);

// Get unique from receipts
const receiptBackers = new Set(...similar query...);

// Merge and return count
const uniqueBackers = new Set([...pledgeBackers, ...receiptBackers]);
return uniqueBackers.size;
```

### 2. Indexer Layer: Delegate Method

**File:** `off-chain/indexer/src/indexer.ts`

Added `getUniqueBackerCount(campaignId: string)` method to the CampaignIndexer class:

- Delegates directly to `this.db.getUniqueBackerCount(campaignId)`
- Provides consistent interface matching other getter methods
- No transformation needed (returns numeric count)

### 3. API Layer: Response Enhancement

**File:** `off-chain/indexer/src/api.ts`

Updated both campaign endpoints to include `backerCount` field:

**GET /campaigns endpoint:**
- Maps over campaign list
- Calls `this.indexer.getUniqueBackerCount(c.id)` for each campaign
- Includes `backerCount: <number>` in response object alongside `receiptCount`

**GET /campaigns/:id endpoint:**
- Fetches single campaign
- Calls `this.indexer.getUniqueBackerCount(campaign.id)`
- Includes `backerCount: <number>` in response object

Both endpoints return consistent response format with backer count as a numeric field.

### 4. Frontend Type Definition

**File:** `off-chain/frontend/src/lib/types.ts`

Updated Campaign interface:
- Added `backerCount?: number;` field
- Marked as optional (?) for backward compatibility during transitions
- Added inline comment: "Count of unique backers across pledges and receipts"
- Positioned near `receiptCount` for consistency

### 5. Campaign Listing Page

**File:** `off-chain/frontend/src/app/page.tsx`

Refactored home page to use API-provided backer count:

**Removed:**
- `fetchPledges()` call from parallel Promise.all
- `pledgesByCampaign` state management
- `Pledge[]` import and type reference
- `getUniqueBackerCount()` import from utils

**Updated:**
- `CampaignCard` component no longer receives `backerCount` prop
- No client-side computation of backer count
- Relies entirely on API response

**Before:**
```typescript
<CampaignCard
  campaign={campaign}
  currentBlock={currentBlock}
  backerCount={getUniqueBackerCount(pledgesByCampaign[campaign.campaignId] || [])}
/>
```

**After:**
```typescript
<CampaignCard
  campaign={campaign}
  currentBlock={currentBlock}
/>
```

### 6. Campaign Card Component

**File:** `off-chain/frontend/src/components/CampaignCard.tsx`

Updated CampaignCard to display API backer count:

**Props change:**
- Removed `backerCount: number` prop from CampaignCardProps interface
- Updated function signature to no longer accept backerCount

**Display update:**
```typescript
// Before:
<span className="font-medium">{backerCount}</span>

// After:
<span className="font-medium">{campaign.backerCount ?? 0}</span>
```

- Displays `campaign.backerCount` from API response
- Defaults to 0 if field is undefined
- No client-side computation

### 7. Campaign Detail Page

**File:** `off-chain/frontend/src/app/campaigns/[id]/page.tsx`

Updated campaign detail page for consistency:

**Removed:**
- `getUniqueBackerCount` import from utils

**Updated:**
```typescript
// Before:
const backerCount = getUniqueBackerCount(pledges);

// After:
const backerCount = campaign?.backerCount ?? 0;
```

- Uses `campaign.backerCount` from API response
- Consistent with campaign listing page
- No longer depends on pledges array for backer count

## Implementation Details

### Why Count Both Pledges and Receipts?

In v1.1's trustless model:
- **Pledges**: Live pledge cells created when user pledges (before deadline/finalization)
- **Receipts**: Receipt cells created after finalization, proving backer's historical pledge

A backer could have:
- Only a pledge (before finalization)
- Only a receipt (after distribution/refund)
- Neither (if pledge was distributed and receipt consumed)

Counting both ensures accurate backer count across all campaign states.

### Lock Hash Normalization

All lock hash comparisons normalize to lowercase to handle:
- Case sensitivity differences from blockchain vs indexer parsing
- Consistent database queries
- Frontend display consistency

### API-First Architecture

Moving calculation to indexer:
- **Reduces frontend burden**: No need to fetch all pledges just to count backers
- **Improves performance**: Database query is atomic, fast, indexed
- **Ensures consistency**: Single source of truth for backer count
- **Scales better**: Multiple frontend clients don't duplicate computation

## Verification

All acceptance criteria from plan met:

- [x] `getUniqueBackerCount` method exists in `off-chain/indexer/src/database.ts`
- [x] Method queries both pledges and receipts tables
- [x] Lock hashes normalized to lowercase
- [x] Returns numeric count (type: number)
- [x] Located in Database class
- [x] Grep finds "backerCount" in api.ts (both endpoints)
- [x] Both /campaigns and /campaigns/:id endpoints include backerCount
- [x] backerCount set via `this.indexer.getUniqueBackerCount()`
- [x] backerCount is numeric (not string) in response
- [x] Campaign interface includes `backerCount?: number` field
- [x] Home page no longer calls `getUniqueBackerCount()` utility
- [x] `fetchPledges()` removed from home page
- [x] CampaignCard receives campaign object, displays `campaign.backerCount ?? 0`
- [x] Campaign detail page uses API backerCount

## Data Flow

```
User Views Campaign List
    ↓
Frontend calls GET /campaigns
    ↓
Indexer API endpoint receives request
    ↓
For each campaign:
  - Retrieves campaign from database
  - Calls database.getUniqueBackerCount(campaignId)
  - Database queries both pledges and receipts tables
  - Merges unique backer sets
  - Returns count
    ↓
API response includes { ..., backerCount: 3, ... }
    ↓
Frontend stores in Campaign state
    ↓
CampaignCard displays: {campaign.backerCount ?? 0} backers
```

## Decisions Made

No new decisions — executed per locked plan decisions D-14 through D-16:

- **D-14**: Count unique backer lock hashes from BOTH pledges AND receipts
- **D-15**: Implement in indexer API (not frontend) for efficiency
- **D-16**: Frontend uses API value directly, no client-side computation

## Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `off-chain/indexer/src/database.ts` | Added getUniqueBackerCount method | +22 |
| `off-chain/indexer/src/indexer.ts` | Added getUniqueBackerCount delegation | +5 |
| `off-chain/indexer/src/api.ts` | Updated both endpoints with backerCount | +2 |
| `off-chain/frontend/src/lib/types.ts` | Added backerCount field to Campaign interface | +1 |
| `off-chain/frontend/src/app/page.tsx` | Removed pledges fetching + client computation | -18 |
| `off-chain/frontend/src/app/campaigns/[id]/page.tsx` | Updated to use API backerCount | -2 |

## Commits

1. `250d8d0`: feat(04-05): clarify creator-only finalization to non-creators
   - (Includes all core backer count changes)
2. `f5c4528`: fix(04-02): update campaign detail page to use API backerCount
   - (Completes implementation on detail page)

## Testing Recommendations

1. **API Test**: Call GET /campaigns, verify backerCount field present and numeric
2. **API Test**: Call GET /campaigns/:id, verify backerCount included
3. **Mixed Pledges/Receipts**: Create campaign with pledges, finalize, verify backer count includes both pledge and receipt backers
4. **Unique Count**: Create multiple pledges from same backer, verify count = 1 (not 2)
5. **Receipt-Only**: Finalize campaign, distribute all pledges, verify receipts still counted as backers
6. **Zero Count**: Campaign with no pledges/receipts should show backerCount = 0
7. **Frontend Display**: Listing page should show correct count without delay
8. **Detail Page**: Detail page should show same count as listing

## Known Stubs / Placeholders

None - implementation complete and verified across all required surfaces.

## Related Items

- **Requirement:** BUG-05 (Minor)
- **Phase:** 04-v1-1-bug-fixes
- **Related Plans:** 04-01 (Distribution triggers), 04-03 (Cost breakdown), 04-04 (Finalize capacity leak), 04-05 (Creator-only finalization)
- **Dependencies:** Indexer database with pledges and receipts tables, CCC SDK, Express API
- **Affected Interfaces:** GET /campaigns, GET /campaigns/:id, Campaign type, CampaignCard component, Home page

## Summary

BUG-05 has been successfully fixed by moving backer count calculation from client-side to server-side indexer. The indexer now queries both pledges and receipts tables, counts unique backers, and returns the result in all campaign API responses. Frontend components (listing and detail pages) now use this API-provided value instead of computing it locally from pledges only. This ensures accurate backer counts across all campaign states and improves frontend performance by eliminating unnecessary pledge fetching.
