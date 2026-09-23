/** Colour of the filled cells: amber while funds are pledged, green or red once the outcome is known */
export type CellMeterTone = "fund" | "ok" | "bad";

interface CellMeterProps {
  /** Funding progress in percent; values above 100 fill the whole strip */
  progress: number;
  tone?: CellMeterTone;
  cells?: number;
}

const TONE_CLASS: Record<CellMeterTone, string> = {
  fund: "bg-fund",
  ok: "bg-ok",
  bad: "bg-bad",
};

/**
 * A campaign's progress drawn as a strip of cells filling up. Any pledge at all lights at
 * least one cell, so a small but real total never reads as zero.
 */
export function CellMeter({ progress, tone = "fund", cells = 20 }: CellMeterProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  const filled = clamped > 0 ? Math.max(1, Math.round((clamped / 100) * cells)) : 0;
  return (
    <div
      className="grid gap-0.5"
      style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}
      role="img"
      aria-label={`${progress.toFixed(1)}% funded`}
    >
      {Array.from({ length: cells }, (_, i) => (
        <b key={i} className={`block aspect-square rounded-[1px] ${i < filled ? TONE_CLASS[tone] : "bg-line-2"}`} />
      ))}
    </div>
  );
}
