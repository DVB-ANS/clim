// Display helpers for lab numbers: lab/out/*.json carries 8 significant digits, judges see rounded values
// (shares to whole percent, % of capital per year to 2 decimals), the same rule as the README and the deck (plan 06).

/** Signed percent with a fixed number of decimals: "+0.70%", "-0.10%". */
export function signedPct(x: number, digits = 2): string {
  return `${x > 0 ? "+" : ""}${x.toFixed(digits)}%`;
}

/** A V-against-S change in words: -18.63 -> "18.6% less", 3.15 -> "3.1% more", anything that rounds to 0 -> "no change". */
export function lessMore(pct: number, digits = 1): string {
  const s = Math.abs(pct).toFixed(digits);
  if (Number(s) === 0) return "no change";
  return `${s}% ${pct < 0 ? "less" : "more"}`;
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

/** The replay window against the storm's other 4 h windows (plan 03 Task 17), in plain words; null with an older summary.json. */
export function replayWindowNote(r: ReplayWindows): string | null {
  const { windowsMedianPct: median, windowsBetterCount: better, windowsCount: n, windowsBeatingChosenCount: beating } = r;
  if (median === undefined || better === undefined || n === undefined || beating === undefined) return null;
  const best = r.arbChangeRangePct?.[0];
  // The replay window (12:00-16:00) is not one of the rolling windows (they start at :16), so the note says
  // that none does better, in the README's words, rather than calling it the best of them.
  const where = beating === 0
    ? `None of the storm's ${n} four-hour windows does better${best === undefined ? "" : ` (best: ${lessMore(best)})`}`
    : `${beating} of the storm's ${n} four-hour windows did better`;
  return `We chose this window while designing clim, around the sharpest rise in volatility. ${where}; ${medianText(median)}, and V lost less in ${better} of ${n}.`;
}

/** The /replay lead's spread: "Over the storm's 92 four-hour windows the median is 2.1% less, and V lost less in 66 of them"; null with an older summary.json. */
export function replayWindowsSpread(r: ReplayWindows): string | null {
  const { windowsMedianPct: median, windowsBetterCount: better, windowsCount: n } = r;
  if (median === undefined || better === undefined || n === undefined) return null;
  return `Over the storm's ${n} four-hour windows ${medianText(median)}, and V lost less in ${better} of them`;
}

const medianText = (median: number) => (lessMore(median) === "no change" ? "the median shows no change" : `the median is ${lessMore(median)}`);
