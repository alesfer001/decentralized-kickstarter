import { SettlementFlow } from "./SettlementFlow";

const TILE = "bg-surface-2 border border-line rounded-[14px] p-[22px]";
const KV = "font-mono text-xs text-ink-3 mt-3 pt-3 border-t border-dashed border-line";

interface StepTileProps {
  title: string;
  children: React.ReactNode;
  detail?: string;
  className: string;
}

function StepTile({ title, children, detail, className }: StepTileProps) {
  return (
    <div className={`${TILE} ${className}`}>
      <h3 className="text-[17px] font-bold mb-2">{title}</h3>
      <p className="text-sm text-ink-2">{children}</p>
      {detail && <div className={KV}>{detail}</div>}
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how" className="py-[72px]">
      <div className="max-w-6xl mx-auto px-4">
        <div className="max-w-[40em] mb-9">
          <p className="eyebrow">How it works</p>
          <h2 className="font-display font-medium tracking-tight text-[clamp(24px,3.2vw,36px)] leading-[1.15] mt-2.5 text-balance">
            One campaign cell. Many pledge cells. Two exits.
          </h2>
          <p className="text-ink-2 mt-3">
            CKB stores state in cells. CrowdCell uses that literally: a campaign is a cell, each pledge is a cell, and
            the scripts guarding them allow only the settlement paths below.
          </p>
        </div>

        <div className="grid grid-cols-12 gap-3.5">
          <div className={`${TILE} col-span-12 lg:col-span-7`}>
            <h3 className="text-[17px] font-bold mb-2">Settlement paths</h3>
            <p className="text-sm text-ink-2">Where a pledge cell can go after the deadline, and nowhere else.</p>
            <SettlementFlow />
            <div className={KV}>
              verified on-chain against total pledged · triggerable by anyone · run automatically by the finalization
              bot
            </div>
          </div>
          <div className="col-span-12 lg:col-span-5 grid gap-3.5">
            <StepTile title="1. Create" detail="campaign cell · goal, deadline, running total" className="">
              A creator publishes a campaign cell with a funding goal in CKB and a deadline block. Neither can be
              changed once it is on-chain.
            </StepTile>
            <StepTile title="2. Pledge" detail="pledge cell · receipt cell · costs shown before you sign" className="">
              A backer locks CKB into a pledge cell, and the campaign&apos;s on-chain total goes up in the same
              transaction. A receipt cell lands in the backer&apos;s wallet as proof.
            </StepTile>
            <StepTile title="3. Settle" className="">
              After the deadline the campaign is finalized against its on-chain total, then every pledge is released
              or refunded. The finalization bot does this automatically, and anyone else can too.
            </StepTile>
          </div>
        </div>
      </div>
    </section>
  );
}
