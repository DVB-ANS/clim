// Display helpers for lab numbers: lab/out/*.json carries 8 significant digits, judges see rounded values
// (shares to whole percent, % of capital per year to 2 decimals), the same rule as the README and the deck (plan 06).

/** Signed percent with a fixed number of decimals: "+0.70%", "-0.10%". */
export function signedPct(x: number, digits = 2): string {
  return `${x > 0 ? "+" : ""}${x.toFixed(digits)}%`;
}

/** A share in whole percent: "53%". */
export function roundPct(x: number): string {
  return `${Math.round(x)}%`;
}

/** A gain in % of capital per year as dollars per year per $1M of liquidity (1% of $1M = $10,000). */
export function usdPerMillion(pctPerYear: number): string {
  const usd = Math.round(Math.abs(pctPerYear) * 10_000);
  return `${pctPerYear < 0 ? "-" : ""}$${usd.toLocaleString("en-US")}`;
}

export type ReplayWindows = {
  arbChangeRangePct?: [number, number];
  windowsMedianPct?: number;
  windowsBetterCount?: number;
  windowsCount?: number;
  windowsBeatingChosenCount?: number;
};

/** The replay window against the rolling 4 h windows of the storm (plan 03 Task 17); null with an older summary.json. */
export function replayWindowNote(r: ReplayWindows): string | null {
  const { windowsMedianPct: median, windowsBetterCount: better, windowsCount: n, windowsBeatingChosenCount: beating } = r;
  if (median === undefined || better === undefined || n === undefined || beating === undefined) return null;
  const best = r.arbChangeRangePct?.[0];
  // The replay window (12:00-16:00) is not one of the rolling windows (they start at :16), so the note says
  // that none does better, in the README's words, rather than calling it the best of them.
  const where = beating === 0
    ? `no rolling 4 h window of the storm does better${best === undefined ? "" : ` (best ${signedPct(best, 1)})`}`
    : `${beating} of the ${n} rolling 4 h windows of the storm did better`;
  return `Picked during design at an earlier setting, around the sharpest rise in volatility: at this P* ${where}; median ${signedPct(median, 1)}; ${better} of ${n} windows beat the fixed pool.`;
}
