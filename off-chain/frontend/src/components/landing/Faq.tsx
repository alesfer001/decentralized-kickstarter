import { MIN_PLEDGE_CKB, PLEDGE_CELL_OVERHEAD, RECEIPT_CELL_CAPACITY } from "@/lib/constants";
import { shannonsToCKB } from "@/lib/utils";

const FAUCET_URL = "https://faucet.nervos.org/";

interface Question {
  q: string;
  a: React.ReactNode;
}

/*
 * An "Is it audited?" entry joins these once the independent audit is done;
 * see docs/design/landing/NOTES.md, "Deferred until we have numbers".
 */
const QUESTIONS: Question[] = [
  {
    q: "What happens if a campaign misses its goal?",
    a: "After the deadline it is finalized as Unsuccessful, and every pledge is refunded to the backer who made it. The finalization bot sends the refunds automatically, and anyone can also trigger them from the campaign page.",
  },
  {
    q: "Who holds the funds while a campaign runs?",
    a: "Nobody. Each pledge sits in its own cell, locked by a script that only lets it go to the creator once the campaign is finalized as Funded, or back to the backer once it is finalized as Unsuccessful or the fail-safe opens. There is no admin key.",
  },
  {
    q: "What does pledging cost?",
    a: (
      <>
        The minimum pledge is {MIN_PLEDGE_CKB} CKB. On CKB every cell holds enough CKB to pay for its own storage, so a
        pledge also locks two deposits that come back to you: about {shannonsToCKB(PLEDGE_CELL_OVERHEAD)} CKB for the
        pledge cell, returned when the pledge is released or refunded, and about{" "}
        {shannonsToCKB(RECEIPT_CELL_CAPACITY)} CKB for the receipt, which you reclaim once the campaign is finalized. The
        network fee is under 0.01 CKB and there is no platform fee. The exact breakdown is shown before you sign.
      </>
    ),
  },
  {
    q: "What if the finalization bot stops running?",
    a: "Nothing gets stuck. Anyone can finalize a campaign and release or refund its pledges from the campaign page. And if a pledge is still unsettled about 180 days after the deadline, anyone can send it back to its backer without the campaign at all.",
  },
  {
    q: "Can a creator change the goal or the deadline?",
    a: "No. Both are fixed when the campaign is created, and the campaign script rejects any transaction that changes them.",
  },
  {
    q: "Which wallets can I use, and is this real CKB?",
    a: (
      <>
        JoyID, or any other wallet the CCC connector supports. CrowdCell currently runs on the CKB testnet, so it uses
        test CKB, which you can get for free from the{" "}
        <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="text-cell hover:underline">
          Nervos faucet
        </a>
        .
      </>
    ),
  },
];

export function Faq() {
  return (
    <section id="faq" className="py-[72px] bg-surface-2 border-y border-line-2">
      <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-9">
        <div>
          <p className="eyebrow">FAQ</p>
          <h2 className="font-display font-medium tracking-tight text-[clamp(24px,3.2vw,36px)] leading-[1.15] mt-2.5 text-balance">
            Questions backers ask
          </h2>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex justify-between items-center gap-4 cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden="true"
                  className="font-mono text-ink-3 text-lg leading-none transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-ink-2 max-w-[60ch]">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
