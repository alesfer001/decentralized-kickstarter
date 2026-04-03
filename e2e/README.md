# E2E Test Scenarios (v1.1)

Browser-based test scenarios designed to be run with `claude --chrome`.

## Prerequisites

Start all three services before running any scenario:

```bash
# Terminal 1: CKB devnet (includes built-in miner)
offckb node

# Terminal 2: Indexer
cd off-chain/indexer && npm run dev

# Terminal 3: Frontend
cd off-chain/frontend && npm run dev
```

All 4 v1.1 contracts must be deployed to devnet (campaign, pledge type, pledge-lock, receipt).

## Scenarios

| # | File | What it tests |
|---|------|---------------|
| 1 | `scenario-1-successful-campaign.md` | Full lifecycle: create → pledge → finalize (success) → automatic release → destroy |
| 2 | `scenario-2-failed-campaign-refund.md` | Failed campaign: create → pledge → finalize (failed) → automatic refund → destroy |
| 3 | `scenario-3-indexer-persistence.md` | SQLite persistence: campaigns, pledges, and receipts survive indexer restart |
| 4 | `scenario-4-edge-cases.md` | Exact goal match, zero pledges, form validation, duplicate backer pledges, receipt matching |
| 5 | `scenario-5-campaign-destruction.md` | Destroy button visibility rules, capacity reclamation, campaign truly gone |
| 6 | `scenario-6-v1.1-trustless-distribution.md` | Verify no manual release/refund buttons, "Locked" badges, Distribution Status section |
| 7 | `scenario-7-v1.1-receipt-display.md` | Receipt cells displayed inline with pledges, amounts match, no expand needed |

## Running

Copy the prompt from inside a scenario file and pass it to `claude --chrome`:

```bash
claude --chrome
```

Then paste the prompt. Claude will navigate the browser and execute the steps.

## v1.1 Key Differences

All scenarios reflect the v1.1 trustless distribution model:
- **No manual buttons**: "Release to Creator" and "Claim Refund" buttons are removed.
- **Automatic distribution**: Fund routing is enforced on-chain via pledge-lock scripts. Anyone can trigger release/refund transactions permissionlessly.
- **Receipt cells**: Each pledge creates a receipt cell as proof of pledge, displayed inline in the pledges list.
- **Distribution Status**: A section appears after finalization showing automatic distribution progress.

## Tips

- Run scenarios in order (1 → 2 → ...) for a clean progression, or run each independently.
- Scenario 3 requires manual indexer restart mid-test.
- Set deadlines to current block + 60 (not +20) to avoid expiry during slow interactions.
- If devnet runs out of space: `offckb clean` then restart.
- Each scenario is self-contained — it creates its own campaigns.
