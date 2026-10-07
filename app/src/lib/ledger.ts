// Display helpers for the /app comparison cards: the volatility scale against V's break-even and the
// LP profit-and-loss ledger of pool V against pool S. Pure functions, so the copy is tested.

import { FeeMode } from "./feeMath";
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
  return `${utcTime(t)} UTC on ${utcDay(t)}`;
}

/** "7 Oct": the UTC day. */
export function utcDay(t: number): string {
  const d = new Date(t * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "16:27:12": the UTC clock to the second. */
export function utcClock(t: number): string {
  return new Date(t * 1000).toISOString().slice(11, 19);
}

/**
 * A dated UTC span for event lists that cover several days: "7 Oct, 04:48:02 to 04:48:48 UTC", the day
 * repeated only when the span crosses midnight, and "to now" while it is still open.
 */
export function utcSpan(from: number, to: number, ongoing = false): string {
  const start = `${utcDay(from)}, ${utcClock(from)}`;
  if (ongoing) return `${start} UTC to now`;
  return `${start} to ${utcDay(to) === utcDay(from) ? "" : `${utcDay(to)}, `}${utcClock(to)} UTC`;
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

/** How long pool V's fee sat above its floor over a window, and why: σ in normal mode (the weather), or a safe mode. */
export type FeeRegimes = {
  stormSec: number; // normal mode, fee above the floor: σ lifted it
  blindSec: number; // blind mode: the desk silent for more than tauKillSec, fee at the safe floor or more
  degradedSec: number; // degraded mode: the venues apart, fee at the safe floor or more
};

/** FeeRegimes of the hook's step series (weatherSeries) from its first point to `to`. */
export function feeRegimes(points: ReadonlyArray<{ t: number; feeVBp: number; mode: FeeMode }>, to: number, floorBp: number): FeeRegimes {
  const r: FeeRegimes = { stormSec: 0, blindSec: 0, degradedSec: 0 };
  points.forEach((p, i) => {
    const span = Math.max(0, Math.min(to, i + 1 < points.length ? points[i + 1].t : to) - p.t);
    if (p.mode === FeeMode.Blind) r.blindSec += span;
    else if (p.mode === FeeMode.Degraded) r.degradedSec += span;
    else if (p.feeVBp > floorBp + 1e-9) r.stormSec += span;
  });
  return r;
}

/** "45 s", "7 min", "2 h 05 min": a duration rounded for a sentence. */
export function spanLabel(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

/**
 * What sits behind the P&L headline, read from the same window: how long σ lifted V's fee off its
 * floor, how long a safe mode held it at the safe fee instead (desk outages, not the weather), and
 * that every retail order is mirrored to both pools, so no flow moves to the cheaper one.
 */
export function pnlCaveat(r: FeeRegimes, floorBp: number, safeBp: number): string {
  const safeParts = [
    r.blindSec > 0 ? `${spanLabel(r.blindSec)} in blind mode (the desk silent)` : null,
    r.degradedSec > 0 ? `${spanLabel(r.degradedSec)} in degraded mode (the venues apart)` : null,
  ].filter((x): x is string => x !== null);
  const safe = safeParts.join(" and ");
  const why = r.degradedSec > 0 ? "the desk's safe modes" : "desk outages";
  const storm = spanLabel(r.stormSec);
  const first =
    r.stormSec > 0 && safe
      ? `V's fee left its ${floorBp} bp floor for ${storm} because σ rose, and sat at ${safeBp} bp or more for ${safe}: that part of V's premium came from ${why}, not from the weather.`
      : r.stormSec > 0
        ? `V's fee left its ${floorBp} bp floor for ${storm}, each time because σ rose; no safe mode in this window.`
        : safe
          ? `σ never took V's fee off its ${floorBp} bp floor in this window: V charged more only for ${safe}, at ${safeBp} bp or more, so the gap comes from ${why}, not from the weather.`
          : `V's fee stayed at its ${floorBp} bp floor throughout: no premium is behind the gap.`;
  return `${first} Every retail order also goes to both pools at once, so neither loses flow when it costs more; through a router, each order would go to the cheaper pool, which only the lab's aggregator scenario models.`;
}

/** "about 1 h", "about 20 min": a span of Sepolia blocks (12 s each) in words. */
export function blocksSpan(blocks: number, blockSec = 12): string {
  const min = (blocks * blockSec) / 60;
  if (min < 60) return `about ${Math.round(min)} min`;
  return `about ${Math.round(min / 30) / 2} h`; // to the half hour
}
