import { VENUE_PINS, WORLD_DOTS, WORLD_H, WORLD_ROW, WORLD_W } from "@/lib/worldDots";

// One path of zero-length segments with round caps: 2,698 land dots in a single element.
const LAND = (() => {
  const n = WORLD_DOTS.split(",").map(Number);
  let d = "";
  for (let i = 0; i < n.length; i += 2) d += `M${n[i] / 2} ${(n[i + 1] * WORLD_ROW).toFixed(2)}h0`;
  return d;
})();

const CRE: [number, number] = [62, 51];
// Binance and Hyperliquid share a region: spread them apart a little and put their labels on the left.
const PLACE: Record<string, { dx: number; dy: number; lx: number; ly: number; anchor: "start" | "end" }> = {
  Coinbase: { dx: 0, dy: 0, lx: 1.8, ly: -1.4, anchor: "start" },
  Kraken: { dx: 0, dy: 0, lx: 1.8, ly: -1.4, anchor: "start" },
  Binance: { dx: -0.9, dy: -0.5, lx: -1.8, ly: -1.4, anchor: "end" },
  Hyperliquid: { dx: 1.7, dy: 1.6, lx: -1.8, ly: 3.6, anchor: "end" },
  Deribit: { dx: 0, dy: 0, lx: 1.8, ly: -1.4, anchor: "start" },
};

/** Four stations and Deribit, at their approximate regions, feeding the Chainlink CRE median. */
export function VenueMap({ className = "" }: { className?: string }) {
  return (
    <svg viewBox={`-2 -3 ${WORLD_W + 4} ${WORLD_H + 9}`} className={className} role="img" aria-label="World map with Coinbase, Kraken, Binance, Hyperliquid and Deribit linked to the Chainlink CRE workflow's median">
      <path d={LAND} fill="none" stroke="var(--clim-muted)" strokeOpacity={0.55} strokeWidth={0.62} strokeLinecap="round" />
      {Object.entries(VENUE_PINS).map(([name, [x0, y0]]) => {
        const p = PLACE[name];
        const x = x0 + p.dx, y = y0 + p.dy;
        return (
          <g key={name}>
            <path
              d={`M${x} ${y} Q ${(x + CRE[0]) / 2} ${Math.max(y, CRE[1]) + 7} ${CRE[0]} ${CRE[1]}`}
              fill="none"
              stroke="var(--clim-deep)"
              strokeWidth={0.35}
              strokeDasharray="1.4 1.6"
              className="motion-loop animate-[clim-dash_1.6s_linear_infinite]"
            />
            <circle cx={x} cy={y} r={1.15} fill="var(--clim-signal)" stroke="var(--clim-surface)" strokeWidth={0.4} />
            <text x={x + p.lx} y={y + p.ly} textAnchor={p.anchor} fontSize={3.1} fill="var(--clim-fg)" fontFamily="var(--font-inter)" className="max-sm:hidden">
              {name === "Deribit" ? "Deribit DVOL" : name}
            </text>
          </g>
        );
      })}
      <circle cx={CRE[0]} cy={CRE[1]} r={2.1} fill="var(--clim-fg)" />
      <text x={CRE[0] + 3.2} y={CRE[1] + 0.9} fontSize={3.1} fill="var(--clim-fg)" fontFamily="var(--font-inter)" className="max-sm:hidden">
        Chainlink CRE · median (simulator)
      </text>
    </svg>
  );
}
