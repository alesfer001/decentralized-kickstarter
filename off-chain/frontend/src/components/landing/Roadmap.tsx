interface Stage {
  status: string;
  title: string;
  items: string[];
  live?: boolean;
}

const STAGES: Stage[] = [
  {
    status: "Live on testnet",
    title: "Trustless crowdfunding",
    items: [
      "All-or-nothing campaigns settled on-chain",
      "Automatic finalization, release and refund",
      "Receipts and the ~180-day fail-safe",
    ],
    live: true,
  },
  {
    status: "Next",
    title: "Dashboards",
    items: ["A creator dashboard for your campaigns", "A backer dashboard for your pledges and deposits"],
  },
  {
    status: "Later",
    title: "Mainnet",
    items: ["An independent security audit", "Launch on CKB mainnet"],
  },
  {
    status: "Planned",
    title: "Bitcoin backers",
    items: ["Pledge from a Bitcoin wallet through RGB++"],
  },
];

export function Roadmap() {
  return (
    <section id="roadmap" className="py-[72px]">
      <div className="max-w-6xl mx-auto px-4">
        <div className="max-w-[40em] mb-9">
          <p className="eyebrow">Roadmap</p>
          <h2 className="font-display font-medium tracking-tight text-[clamp(24px,3.2vw,36px)] leading-[1.15] mt-2.5 text-balance">
            Where CrowdCell is going
          </h2>
        </div>

        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {STAGES.map((stage) => (
            <li
              key={stage.title}
              className={`rounded-[14px] p-[22px] border ${
                stage.live ? "bg-surface-2 border-fund" : "bg-surface-2 border-line"
              }`}
            >
              <p
                className={`font-mono text-[11px] tracking-widest uppercase inline-flex items-center gap-1.5 ${
                  stage.live ? "text-fund" : "text-ink-3"
                }`}
              >
                <i className={`w-1.5 h-1.5 rounded-full ${stage.live ? "bg-fund" : "border border-ink-3"}`} />
                {stage.status}
              </p>
              <h3 className="text-[17px] font-bold mt-3">{stage.title}</h3>
              <ul className="mt-2 grid gap-1.5 text-sm text-ink-2">
                {stage.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
