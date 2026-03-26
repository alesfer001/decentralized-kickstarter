# Architecture Research — CKB Trustless Fund Distribution (v1.1)

## Script Interaction Model

### Current v1.0 Scripts
- **Campaign Type Script** — validates campaign cell state transitions (Active → Success/Failed)
- **Pledge Type Script** — validates pledge cell creation and immutability
- **Pledge Lock Script** — standard secp256k1 (backer's wallet key)

### v1.1 Script Architecture
```
Campaign Type Script (existing, may need updates)
  ├── Validates campaign lifecycle
  ├── Stores: creator_lock_hash, funding_goal, deadline_block, status
  └── Referenced via cell_deps by pledge lock script

Pledge Type Script (existing, may need updates)
  ├── Validates pledge cell data integrity
  └── Linked to campaign via type script args

Pledge Lock Script (NEW — core of v1.1)
  ├── Controls when/how pledge cells can be spent
  ├── Reads campaign cell via cell_deps to check status
  ├── Enforces deadline via since field
  └── Routes capacity to correct destination

Receipt Type Script (NEW)
  ├── Validates receipt cell creation (must accompany pledge creation)
  ├── Stores: pledge_amount, backer_lock_hash
  └── Validates receipt destruction (during refund, amount must match)
```

### Script Responsibility Boundaries
| Concern | Who Validates |
|---------|--------------|
| Campaign state transitions | Campaign Type Script |
| Pledge data integrity | Pledge Type Script |
| Fund custody & routing | **Pledge Lock Script** (NEW) |
| Backer identity proof | **Receipt Type Script** (NEW) |
| Deadline enforcement | **Pledge Lock Script** via since |

## Cell Deps Pattern

### How the Lock Script Reads Campaign Status
When a pledge cell is spent, the lock script needs to know the campaign outcome:

1. Transaction includes the campaign cell as a **cell_dep**
2. Lock script loads cell_dep data at the expected index
3. Lock script verifies the cell_dep's type script hash matches the expected campaign type script hash (from lock args)
4. Lock script reads campaign data: `status` field at byte 56

```
Transaction Structure (release):
  inputs:
    [0] pledge cell (lock: custom pledge lock)
  outputs:
    [0] creator cell (lock: creator's secp256k1, capacity >= pledge amount)
  cell_deps:
    [0] campaign cell (type: campaign type script, data includes status=Success)
    [1] pledge lock script code cell
    [2] receipt type script code cell (if receipt involved)
```

### Security: Preventing Fake Cell Deps
**Critical:** Anyone can put any cell in cell_deps. The lock script MUST verify:
1. The cell_dep's **type script hash** matches `campaign_type_script_hash` from lock args
2. This ensures only a real campaign cell (validated by the campaign type script) can be used
3. The campaign type script hash is baked into the lock args at pledge creation time — immutable

## Since Field Mechanics

### How `since` Works on CKB
The `since` field on a transaction input constrains when the input can be consumed:

- **Absolute block number:** `since = 0x0000_0000_XXXX_XXXX` — input can't be spent before block XXXX_XXXX
- **Absolute epoch:** `since = 0x2000_0000_XXXX_XXXX` — input can't be spent before epoch
- **Absolute timestamp:** `since = 0x4000_0000_XXXX_XXXX` — input can't be spent before timestamp
- **Relative versions** use `since` bit 63 = 1

### Recommended: Absolute Block Number
- Our campaigns already use block numbers for deadlines
- Simple, deterministic, no epoch calculation needed
- Lock script validates: `load_input_since() >= deadline_block` (from lock args)

### Lock Script Since Logic
```
if before_deadline:
    if merging_pledges:
        allow (verify merge conditions)
    else:
        reject (pledges locked until deadline)

if after_deadline:
    load campaign from cell_deps
    if campaign.status == Success:
        verify output goes to campaign.creator_lock_hash
    if campaign.status == Failed:
        verify output goes to backer_lock_hash (from args or receipt)
```

## Transaction Structures

### 1. Create Pledge (with Receipt)
```
inputs:
  [0] backer's CKB cell (secp256k1 lock)
outputs:
  [0] pledge cell
        lock: custom pledge lock (args: campaign_hash, deadline, backer_hash)
        type: pledge type script
        capacity: pledge_amount + min_capacity
  [1] receipt cell
        lock: backer's secp256k1 lock (backer owns this)
        type: receipt type script
        data: pledge_amount (u64 LE)
  [2] change cell (backer's remaining CKB)
cell_deps:
  [0] campaign cell
  [1] pledge lock code
  [2] pledge type code
  [3] receipt type code
```

### 2. Merge Pledges
```
inputs:
  [0..N] pledge cells (same campaign, custom lock)
  [N+1] fee provider cell
outputs:
  [0] merged pledge cell
        lock: same custom pledge lock
        type: pledge type script
        capacity: sum of input pledge capacities
  [1] change cell
cell_deps:
  [0] campaign cell (status must be Active, before deadline)
  [1] pledge lock code
since: none (merging allowed before deadline)
```

### 3. Permissionless Release (Success)
```
inputs:
  [0] pledge cell (custom lock)
  [1] fee provider cell (anyone can provide)
outputs:
  [0] creator cell
        lock: creator's lock hash (from campaign data)
        capacity: >= pledge capacity
  [1] change cell
cell_deps:
  [0] campaign cell (status = Success)
  [1] pledge lock code
since: absolute block >= deadline
```

### 4. Permissionless Refund (Failed)
```
inputs:
  [0] pledge cell (custom lock)
  [1] receipt cell (backer's receipt, type: receipt type script)
  [2] fee provider cell
outputs:
  [0] backer cell
        lock: backer's lock hash (from receipt/lock args)
        capacity: >= pledge capacity
  [1] change cell
cell_deps:
  [0] campaign cell (status = Failed)
  [1] pledge lock code
  [2] receipt type code
since: absolute block >= deadline
```

## Build Order (Dependencies)

```
Phase 1: Pledge Lock Script + Receipt Type Script (contracts)
  - These are the foundation — everything else depends on them
  - Can be tested with ckb-std native simulator

Phase 2: Updated Campaign/Pledge Type Scripts (if needed)
  - May need to validate receipt creation during pledge
  - May need to accept new finalization patterns

Phase 3: Transaction Builder Updates
  - New operations using the deployed contracts
  - Integration testing against devnet

Phase 4: Indexer Updates
  - Track new cell types (receipt cells, merged pledges)
  - New API endpoints

Phase 5: Frontend Updates
  - New UX for automatic distribution
  - Remove manual release/refund buttons
```
