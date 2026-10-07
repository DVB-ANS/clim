// Display helpers for the /app comparison cards: the volatility scale against V's break-even and the
// LP profit-and-loss ledger of pool V against pool S. Pure functions, so the copy is tested.

import { utcTime } from "./theme";

/** The steps the volatility scale may end on, in % a year. */
export const NICE_MAX_STEPS = [25, 50, 75, 100, 150, 200, 300, 500, 1_000, 1_500] as const;

/**
 * The end of a 0-to-max scale for volatilities in % a year: the smallest step that leaves 10% of
 * headroom above `x`. Past the last step it rounds up to a multiple of 500; a missing or non-positive
 * `x` gives the first step.
 */
export function niceMax(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return NICE_MAX_STEPS[0];
  const need = 1.1 * x;
  for (const step of NICE_MAX_STEPS) if (step >= need) return step;
  return Math.ceil(need / 500) * 500;
}

/** Where `x` sits on a 0-to-max scale, in %, kept inside the track. */
export function scalePct(x: number, max: number): number {
  if (!Number.isFinite(x) || !(max > 0)) return 0;
  return Math.min(100, Math.max(0, (x / max) * 100));
}

/**
 * A signed amount for the ledger: "+971", "−409" (a true minus sign, U+2212), en-US grouping,
 * `digits` decimals, a bare "0" when it rounds to zero and "n/a" when it is not a number.
 */
export function signed(x: number, digits = 0): string {
  if (!Number.isFinite(x)) return "n/a";
  const s = Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (Number(s.replace(/,/g, "")) === 0) return (0).toFixed(digits);
  return `${x < 0 ? "−" : "+"}${s}`;
}

/** An unsigned amount for the ledger's activity rows: "5,277,839". */
export function grouped(x: number): string {
  return Math.round(x).toLocaleString("en-US");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14:05 UTC on 7 Oct": deterministic (no locale data), the same on the server and in every browser. */
export function utcStamp(t: number): string {
  const d = new Date(t * 1000);
  return `${utcTime(t)} UTC on ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** How much V's amount differs from S's, in % of S's (the arbitrage loss, the hedged P&L); NaN when S's is not positive. */
export function relativePct(v: number, s: number): number {
  return s > 0 ? (v / s - 1) * 100 : Number.NaN;
}

/**
 * The P&L card's headline sentence: since when (or over the replay window), by how much pool V's hedged
 * LP did better or worse than pool S's, and whether the two pools' average fees make that a fair test.
 * Two gains compare as "earned x% more", two losses as "lost x% less"; with signs that differ, no %.
 */
export function pnlSentence(o: { vNet: number; sNet: number; sinceSec?: number; replay: boolean; fairFee: boolean }): string {
  const when = o.replay ? "Over the replay window" : o.sinceSec !== undefined ? `Since ${utcStamp(o.sinceSec)}` : "So far";
  const d = o.vNet - o.sNet;
  const tail = o.fairFee
    ? ", with average fees within 10% of each other."
    : ", but their average fees differ by more than 10%, so the lab's backtest at equal fee is the reference.";
  if (signed(d) === "0") return `${when}, pool V's hedged LP earned the same as pool S's${tail}`;
  if (o.vNet < 0 && o.sNet < 0) {
    const pct = (o.vNet / o.sNet - 1) * 100;
    return `${when}, pool V's hedged LP lost ${Math.abs(pct).toFixed(1)}% ${d > 0 ? "less" : "more"} than pool S's${tail}`;
  }
  const pct = relativePct(o.vNet, o.sNet);
  const by = Number.isFinite(pct) ? `${Math.abs(pct).toFixed(1)}% ` : "";
  return `${when}, pool V's hedged LP earned ${by}${d > 0 ? "more" : "less"} than pool S's${tail}`;
}

/** "about 1 h", "about 20 min": a span of Sepolia blocks (12 s each) in words. */
export function blocksSpan(blocks: number, blockSec = 12): string {
  const min = (blocks * blockSec) / 60;
  if (min < 60) return `about ${Math.round(min)} min`;
  return `about ${Math.round(min / 30) / 2} h`; // to the half hour
}
