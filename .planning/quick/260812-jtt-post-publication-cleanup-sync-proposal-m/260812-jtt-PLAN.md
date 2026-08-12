---
phase: quick
plan: 260812-jtt
type: execute
created_date: 2026-08-12
autonomous: true
requirements: []
user_setup: []
---

<objective>
Post-publication cleanup after posting the [DIS] CrowdCell grant proposal to Nervos Talk on 2026-08-12.

Purpose: Sync docs files to the published version (em dashes removed), log the milestone, and commit pre-review docs to version control.

Output: 
- docs/grant/PROPOSAL.md synchronized (22 em dashes removed, title changed to colon format)
- docs/ProjectPlan.md updated with 2026-08-12 log entry
- .planning/v12-pre-review/REVIEW.md committed to git
</objective>

<context>
**Published proposal details (use verbatim):**
- Topic URL: https://talk.nervos.org/t/dis-crowdcell-mainnet-launch-of-trustless-all-or-nothing-crowdfunding-on-ckb/10609
- Topic ID: 10609
- Category: DAOs & Funding > CKB Community Fund DAO
- Tag: lang-en
- Title: "[DIS] CrowdCell: Mainnet Launch of Trustless All-or-Nothing Crowdfunding on CKB" (colon, not em dash)
- Em dashes: all 22 removed in the published version

**File tracking status:**
- `docs/grant/PROPOSAL.md` — gitignored (untracked), contains 22 em dashes
- `docs/ProjectPlan.md` — tracked, needs 2026-08-12 log entry
- `.planning/v12-pre-review/REVIEW.md` — untracked, needs commit

**Em dash replacements used in published version (specific patterns, all must apply):**
- §1 Title: colon instead of em dash
- §2 items 1-4, 7 (bold-label items): colon moved inside bold, e.g., `**User dashboards:** creator (...)`
- §2 items 5-6: period + new sentence (colons already in line, would collide). Item 5: `**Public launch.** A coordinated launch package: ...`
- §3 "Why now" last bullet: `since a mainnet launch needs...` (no em dash)
- §3 rebrand paragraph: uses parentheses `plays on "Crowd-Sell" (what a creator does, selling an idea to the crowd) while substituting "cell"`
- §4 byline: `**LESFER Ayoub @RickSoze**, Lead Developer` (comma, not em dash)
- §4 role line: `full-stack, covering contracts (...)`
- §4 background: sentence break before "Currently enterprise SaaS"
- §5 status bullets: colons instead of em dashes
- §6.1 step 4: arrows dropped, `Success routes...` / `Failed routes...` (already removed)
- §6.2 config cell: colon instead of em dash
- §6.4 config bullet: colon instead of em dash
- §8 time framing: semicolon before "mainnet launch (M5) follows"
- Verify: zero em dashes remain after edits
</context>

<tasks>

<task type="auto">
  <name>Task 1: Sync docs/grant/PROPOSAL.md to published version (remove 22 em dashes, colon title)</name>
  <files>docs/grant/PROPOSAL.md</files>
  <action>
Remove all 22 em dashes from docs/grant/PROPOSAL.md and replace per the published version patterns above. Key replacements:

1. **Title (line 1):** Change `# [DIS] CrowdCell — Mainnet Launch...` to `# [DIS] CrowdCell: Mainnet Launch...`
2. **§2 title (line 7):** Same title change
3. **§2.1-2.4, 2.7 (lines 15-18, 21):** Move colon inside bold, e.g., `**User dashboards:** creator...` (was `**User dashboards** —`)
4. **§2.5-2.6 (lines 19-20):** Period + new sentence. Line 19: `**Public launch.** A coordinated launch package:` (was `**Public launch** — coordinated...`). Line 20: `**Rebrand to CrowdCell.** "Kickstarter" is a registered...` (was `**Rebrand** —...`)
5. **§3 "Why now" last bullet (line 46):** `cannot reasonably be split into separate proposals since a mainnet launch needs...` (was `...separate proposals — a mainnet...`)
6. **§3 rebrand (line 50):** Two changes: (a) `plays on "Crowd-Sell" (what a creator does, selling an idea to the crowd) while substituting "cell"` (was `...plays on "Crowd-Sell" — what...`). (b) Remove second em dash if present.
7. **§4 byline (line 54):** `**LESFER Ayoub @RickSoze**, Lead Developer` (was `**LESFER Ayoub @RickSoze** —`)
8. **§4 role (line 55):** `full-stack, covering contracts...` (was `full-stack —`)
9. **§4 background (line 56):** Add sentence break: `...production systems. Currently enterprise SaaS...` (was `...systems — currently...`)
10. **§5 status bullets (lines 64-67):** Replace `—` with `:` e.g., `**v1.0 (testnet MVP):** full campaign...` (was `**v1.0** —`)
11. **§6.2 (line 89):** `**Contracts (Rust, ckb-std):** five v1.1 contracts...` and later `...plus one new contract in v1.2: a singleton config...` (was both `—`)
12. **§6.4 (line 113):** `**Configurable via platform config cell:** initial rate...` (was `—`)
13. **§8 (line 139):** `...additive to that; mainnet launch (M5) follows...` (was `...to that — mainnet...`)
14. **Verify:** Run `grep "—" docs/grant/PROPOSAL.md` and confirm zero results (all 22 em dashes removed).

Use sed or direct file edit — whatever is fastest and most reliable. After changes, verify the file syntax is valid markdown (no corruption).
  </action>
  <verify>
    <automated>
grep -c "—" /Users/ayoublesfer/Documents/Dev/decentralized-kickstarter/docs/grant/PROPOSAL.md && echo "FAIL: em dashes found" || echo "PASS: zero em dashes"
    </automated>
  </verify>
  <done>
All 22 em dashes removed from PROPOSAL.md. Title uses colon instead of em dash. All replacements per published version applied. File is valid markdown with no syntax errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add 2026-08-12 log entry to docs/ProjectPlan.md, update open actions</name>
  <files>docs/ProjectPlan.md</files>
  <action>
Add a new dated log entry for 2026-08-12 before the closing section. Match the existing format (e.g., the `**2026-07-07:**` entry style).

New entry content (after line 1604):

```
**2026-08-12:** [DIS] CrowdCell Grant Proposal Published to Nervos Talk
- Published the grant proposal to Nervos Talk on 2026-08-12
- Topic URL: https://talk.nervos.org/t/dis-crowdcell-mainnet-launch-of-trustless-all-or-nothing-crowdfunding-on-ckb/10609
- Topic ID: 10609
- Category: DAOs & Funding > CKB Community Fund DAO
- Tag: lang-en
- Title: "[DIS] CrowdCell: Mainnet Launch of Trustless All-or-Nothing Crowdfunding on CKB" (colon, not em dash)
- Published body: all 22 em dashes removed from local draft
- Local docs/grant/PROPOSAL.md synced to published version (Task 1)
- Pre-review REVIEW.md committed to version control (Task 3)
- Open actions now: (1) Chinese translation of the proposal; (2) respond to community comments during the DIS window; (3) start v1.2 GSD phase planning via `/gsd:new-milestone`
```

Also update the **2026-07-07** entry's open-actions line (currently at end of that entry) to mark posting as DONE. Current line approximately at 1604: "Open actions: post `[DIS]` PROPOSAL.md to Nervos Talk (unblocked — audit budget anchored by Scalebit quote); Chinese translation of proposal; then start v1.2 GSD phase planning."

Revise to mark posting complete: "Open actions (2026-07-07): post `[DIS]` PROPOSAL.md to Nervos Talk **[DONE 2026-08-12]**; Chinese translation of proposal; respond to community feedback; start v1.2 GSD phase planning via `/gsd:new-milestone`."

Insert the new 2026-08-12 entry right after line 1604.
  </action>
  <verify>
    <automated>
grep "2026-08-12" /Users/ayoublesfer/Documents/Dev/decentralized-kickstarter/docs/ProjectPlan.md && echo "PASS: 2026-08-12 entry present" || echo "FAIL: entry missing"
    </automated>
  </verify>
  <done>
2026-08-12 log entry added with topic URL, category, tag, and status. 2026-07-07 open actions updated to mark posting complete and redirect to new entry. File format matches existing dated-log entries.
  </done>
</task>

<task type="auto">
  <name>Task 3: Commit .planning/v12-pre-review/REVIEW.md to git</name>
  <files>.planning/v12-pre-review/REVIEW.md</files>
  <action>
The REVIEW.md file is currently untracked. It's referenced publicly in the published proposal §5 and §13 as "available on request", so it should be in version control. Commit it with a descriptive message.

```bash
git add .planning/v12-pre-review/REVIEW.md
git commit -m "docs(v12-pre-review): commit trust-boundary audit report

- v1.2 pre-review of v1.1 contracts for trust-boundary vulnerabilities
- 3 actionable medium-severity issues identified and folded into v1.2 Phase 8
- 2 demoted findings (design-as-intended, false positive)
- 1 acknowledged design tradeoff
- Report referenced in published grant proposal as 'available on request'

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Verify the commit landed and the file is now tracked.
  </action>
  <verify>
    <automated>
git ls-files | grep "v12-pre-review/REVIEW.md" && echo "PASS: file tracked" || echo "FAIL: file not in index"
    </automated>
  </verify>
  <done>
REVIEW.md committed to git with full history. File is now tracked and part of the repository. Commit message reflects the content and purpose.
  </done>
</task>

</tasks>

<threat_model>
No security implications. This task is documentation + git hygiene only — no secrets, no external APIs, no contract changes. Files are written locally and committed.
</threat_model>

<verification>
After all tasks complete:
1. PROPOSAL.md has zero em dashes (grep confirms)
2. ProjectPlan.md has dated entry for 2026-08-12 with topic URL and status
3. REVIEW.md is tracked in git (`git ls-files` includes it)
4. Title changes in PROPOSAL.md match published version (colon, not em dash)
</verification>

<success_criteria>
- All 22 em dashes removed from docs/grant/PROPOSAL.md
- Title changed from em dash to colon format
- 2026-08-12 log entry added to ProjectPlan.md with topic URL and category
- 2026-07-07 entry updated to mark posting complete
- .planning/v12-pre-review/REVIEW.md committed with descriptive message
- All files have valid syntax (markdown, valid git state)
- No unintended changes to other files
</success_criteria>

<output>
After completion, create `.planning/quick/260812-jtt-post-publication-cleanup-sync-proposal-m/260812-jtt-SUMMARY.md`
</output>
