import Link from "next/link";
import { NETWORK } from "@/lib/constants";
import { HeroGrid } from "./HeroGrid";

/** Example campaign drawn in the hero meter. Clearly labelled as an example on the page. */
const EXAMPLE = {
  title: "CKB Light Client for iOS",
  pledged: 49_440,
  goal: 120_000,
  deadlineBlock: 22_900_000,
};

/** The meter is 12x6 cells; the goal boundary sits at cell 60, leaving room to overshoot */
const METER_CELLS = 72;
const GOAL_CELL = 60;

/**
 * Protocol facts under the hero. Stand-ins for live stats until there is real volume to show;
 * see docs/design/landing/NOTES.md, "Deferred until we have numbers".
 */
const FACTS = [
  { label: "Custody", value: "None" },
  { label: "Settlement", value: "On-chain" },
  { label: "Fail-safe", value: "~180 days" },
  { label: "Network", value: NETWORK.charAt(0).toUpperCase() + NETWORK.slice(1) },
];

const BUTTON = "inline-flex items-center px-[18px] py-[11px] rounded-lg font-semibold text-sm";

function ExampleMeter() {
  const filled = Math.round((EXAMPLE.pledged / EXAMPLE.goal) * GOAL_CELL);
  const rows = [
    { label: "Pledged", value: EXAMPLE.pledged.toLocaleString("en-US") },
    { label: "Goal", value: EXAMPLE.goal.toLocaleString("en-US") },
    { label: "Deadline", value: `#${EXAMPLE.deadlineBlock.toLocaleString("en-US")}` },
  ];

  return (
    <div
      className="bg-surface-2 border border-line rounded-[14px] p-[18px] shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
      aria-label="Example campaign meter"
    >
      <div className="flex justify-between items-baseline gap-2.5 mb-3">
        <strong className="font-bold text-[15px]">{EXAMPLE.title}</strong>
        <span className="text-xs text-ink-3 whitespace-nowrap">example campaign</span>
      </div>
      <div className="grid grid-cols-12 gap-1" aria-hidden="true">
        {Array.from({ length: METER_CELLS }, (_, i) => (
          <b
            key={i}
            className={`block aspect-square rounded-[3px] border ${
              i < filled ? "bg-fund border-fund" : "bg-line-2 border-line"
            } ${i === GOAL_CELL - 1 ? "outline outline-1 outline-dashed outline-cell -outline-offset-1" : ""}`}
          />
        ))}
      </div>
      <div className="mt-3.5 grid grid-cols-2 min-[481px]:grid-cols-3 gap-2">
        {rows.map((row) => (
          <div key={row.label} className="bg-surface-3 rounded-lg px-3 py-2.5">
            <div className="text-[11px] text-ink-3 tracking-wider uppercase">{row.label}</div>
            <div className="font-mono text-sm mt-0.5">{row.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-3.5 flex-wrap text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-sm bg-fund" />
          pledged CKB
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-sm bg-line-2 outline outline-1 outline-dashed outline-cell -outline-offset-1" />
          goal boundary
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-sm bg-line-2" />
          remaining
        </span>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <div className="relative overflow-hidden border-b border-line-2">
      <HeroGrid />
      <div className="relative max-w-6xl mx-auto px-4 py-12 md:py-[72px] grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-9 lg:gap-12 items-center">
        <div>
          <p className="eyebrow">Crowdfunding · Nervos CKB · all-or-nothing</p>
          <h1 className="font-display font-medium tracking-tight text-[clamp(30px,4.6vw,54px)] leading-[1.12] mt-4 text-balance">
            Your <span className="text-fund">funds</span> live in a <span className="text-cell">cell</span> that only
            the outcome can unlock.
          </h1>
          <p className="mt-5 text-[17px] text-ink-2 max-w-[32em]">
            CrowdCell is a launchpad for CKB projects where the chain, not a company, decides what happens to every
            pledge. Goal met by the deadline: funds release to the creator. Goal missed: every backer is refunded. No
            custody in between.
          </p>
          <div className="flex gap-3 mt-7 flex-wrap">
            <Link href="/app" className={`${BUTTON} bg-fund text-fund-ink hover:brightness-105`}>
              Launch app
            </Link>
            <a href="#how" className={`${BUTTON} border border-line hover:bg-surface-3`}>
              How it works
            </a>
          </div>
          <dl className="mt-9 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 max-w-[36em]">
            {FACTS.map((fact) => (
              <div key={fact.label} className="border-l border-line pl-3">
                <dt className="eyebrow !text-[11px]">{fact.label}</dt>
                <dd className="font-display font-medium text-lg mt-1">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <ExampleMeter />
      </div>
    </div>
  );
}
