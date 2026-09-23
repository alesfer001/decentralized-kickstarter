import Link from "next/link";

/** What a creator gets today; what's coming is on the roadmap */
const FEATURES = [
  "All-or-nothing, verified on-chain",
  "Automatic release and refund via the finalization bot",
  "A receipt cell for every pledge, and a ~180-day fail-safe",
  "Backers connect with JoyID or any CCC-supported wallet",
];

export function CreatorsBand() {
  return (
    <section id="creators" className="py-[72px]">
      <div className="max-w-6xl mx-auto px-4">
        <div className="relative overflow-hidden bg-surface-2 border border-line rounded-[18px] p-6 md:p-9 grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-9 items-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-20 w-80 h-80 rounded-full bg-[radial-gradient(circle,var(--fund-soft),transparent_70%)]"
          />
          <div className="relative">
            <p className="eyebrow">For creators</p>
            <h2 className="font-display font-medium tracking-tight text-[clamp(22px,3vw,32px)] leading-[1.15] mt-2.5 text-balance">
              Launch a CKB project with terms the chain enforces.
            </h2>
            <p className="text-ink-2 mt-3">
              Set the goal, set the deadline, publish. Backers can see there is no way for you, or us, to touch their
              CKB unless the goal is met. That is a better pitch than any promise.
            </p>
            <div className="flex gap-3 mt-6 flex-wrap">
              <Link
                href="/campaigns/new"
                className="inline-flex items-center px-[18px] py-[11px] rounded-lg font-semibold text-sm bg-fund text-fund-ink hover:brightness-105"
              >
                Create a campaign
              </Link>
            </div>
          </div>
          <ul className="relative grid gap-2.5 text-sm">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex gap-2.5 items-start">
                <span
                  aria-hidden="true"
                  className="w-[18px] h-[18px] rounded-[5px] flex-none grid place-items-center text-[11px] font-bold mt-0.5 bg-ok text-[#05261a]"
                >
                  ✓
                </span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
