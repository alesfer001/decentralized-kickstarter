import { EXPLORER_URL, REPO_URL } from "@/lib/constants";

/** A cell in the matrix: whether the party can do it, and an optional qualifier */
type Permission = { ok: boolean; note?: string };

interface MatrixRow {
  action: string;
  detail?: string;
  creator: Permission;
  backer: Permission;
  anyone: Permission;
  enforcedBy: string;
}

const YES: Permission = { ok: true };
const NO: Permission = { ok: false };
const IF_VERIFIED: Permission = { ok: true, note: "if it verifies" };

/** What each party can do, as the contracts enforce it (v1.2) */
const ROWS: MatrixRow[] = [
  {
    action: "Pledge to a campaign",
    detail: "before the deadline, 100 CKB minimum",
    creator: YES,
    backer: YES,
    anyone: { ok: true, note: "as a backer" },
    enforcedBy: "campaign + pledge type scripts",
  },
  {
    action: "Finalize as Funded or Unsuccessful",
    detail: "after the deadline, must match total pledged vs goal",
    creator: IF_VERIFIED,
    backer: IF_VERIFIED,
    anyone: IF_VERIFIED,
    enforcedBy: "campaign type script",
  },
  {
    action: "Release funds to the creator",
    detail: "only once finalized as Funded",
    creator: YES,
    backer: YES,
    anyone: YES,
    enforcedBy: "pledge lock script",
  },
  {
    action: "Refund a backer",
    detail: "only once finalized as Unsuccessful",
    creator: YES,
    backer: YES,
    anyone: YES,
    enforcedBy: "pledge lock script",
  },
  {
    action: "Send funds anywhere else",
    creator: NO,
    backer: NO,
    anyone: NO,
    enforcedBy: "pledge lock script",
  },
  {
    action: "Return an unsettled pledge to its backer",
    detail: "fail-safe, ~180 days after the deadline",
    creator: YES,
    backer: YES,
    anyone: YES,
    enforcedBy: "pledge lock script",
  },
  {
    action: "Reclaim a receipt's deposit",
    detail: "once the campaign is finalized",
    creator: NO,
    backer: { ok: true, note: "their own" },
    anyone: NO,
    enforcedBy: "receipt type script",
  },
];

/**
 * Evidence anyone can check today. An audit line joins these once the independent audit is done;
 * see docs/design/landing/NOTES.md, "Deferred until we have numbers".
 */
const VERIFIABLE = [
  {
    title: "Open source",
    body: "The contracts, the indexer, the finalization bot and this site are all public.",
    link: { label: "GitHub", href: REPO_URL },
  },
  {
    title: "Rules that can't change",
    body: "Campaigns reference the scripts by the hash of their code, so nobody can upgrade them under a live campaign.",
    link: { label: "Contracts", href: `${REPO_URL}/tree/main/contracts` },
  },
  {
    title: "Everything is inspectable",
    body: "Every campaign, pledge and receipt is a cell you can look up on the CKB explorer.",
    link: { label: "Explorer", href: EXPLORER_URL },
  },
];

function PermissionCell({ permission }: { permission: Permission }) {
  return (
    <td className={`px-[18px] py-3.5 font-bold ${permission.ok ? "text-ok" : "text-bad"}`}>
      {permission.ok ? "yes" : "no"}
      {permission.note && <span className="font-normal">, {permission.note}</span>}
    </td>
  );
}

export function TrustMatrix() {
  const th = "px-[18px] py-3.5 font-mono font-medium text-[11px] tracking-widest uppercase text-ink-3";
  return (
    <section id="trust" className="py-[72px] bg-surface-2 border-y border-line-2">
      <div className="max-w-6xl mx-auto px-4">
        <div className="max-w-[40em] mb-9">
          <p className="eyebrow">Trust model</p>
          <h2 className="font-display font-medium tracking-tight text-[clamp(24px,3.2vw,36px)] leading-[1.15] mt-2.5 text-balance">
            Who can do what, and who can&apos;t
          </h2>
          <p className="text-ink-2 mt-3">
            &quot;Trustless&quot; is a specific claim. Here is exactly what each party is allowed to do, as enforced by
            the scripts. They are referenced by code hash, so nobody can swap them out, including us.
          </p>
        </div>

        <div className="border border-line rounded-[14px] overflow-x-auto bg-surface-2">
          <table className="w-full min-w-[680px] border-collapse text-sm text-left align-top">
            <thead>
              <tr className="border-b border-line-2">
                <th className={th}>Action</th>
                <th className={th}>Creator</th>
                <th className={th}>Backer</th>
                <th className={th}>Anyone / bot</th>
                <th className={th}>Enforced by</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.action} className="border-b border-line-2 last:border-b-0 align-top">
                  <td className="px-[18px] py-3.5 font-bold">
                    {row.action}
                    {row.detail && <span className="block font-normal text-ink-2 text-[13px] mt-0.5">{row.detail}</span>}
                  </td>
                  <PermissionCell permission={row.creator} />
                  <PermissionCell permission={row.backer} />
                  <PermissionCell permission={row.anyone} />
                  <td className="px-[18px] py-3.5 font-mono text-xs text-ink-3">{row.enforcedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3.5 grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {VERIFIABLE.map((item) => (
            <div key={item.title} className="border border-line rounded-[14px] p-[22px] flex flex-col">
              <h3 className="text-[17px] font-bold mb-2">{item.title}</h3>
              <p className="text-sm text-ink-2 flex-1">{item.body}</p>
              {/* The devnet has no public explorer, so its link is empty */}
              {item.link.href && (
                <a
                  href={item.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 font-mono text-xs text-cell hover:underline"
                >
                  {item.link.label}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
