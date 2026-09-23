interface LogoMarkProps {
  size?: number;
}

/** Top-left to bottom-right positions of a 3x3 grid */
const GRID = [1, 9.5, 18];

/**
 * CrowdCell mark: a 3x3 grid of cells. The amber cells are pledges filling toward the goal;
 * the blue cell is the campaign cell holding them.
 */
export function LogoMark({ size = 26 }: LogoMarkProps) {
  // Row-major index of each cell: 0-2 top row, 3-5 middle, 6-8 bottom
  const fill = (i: number) => (i === 2 ? "var(--cell)" : i >= 3 && i !== 5 ? "var(--fund)" : "var(--line)");
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      {GRID.flatMap((y, row) =>
        GRID.map((x, col) => (
          <rect key={`${row}-${col}`} x={x} y={y} width="7" height="7" rx="1.5" fill={fill(row * 3 + col)} />
        ))
      )}
    </svg>
  );
}
