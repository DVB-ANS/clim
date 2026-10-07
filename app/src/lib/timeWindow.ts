// The weather chart's time window: presets that fit the history actually loaded, and the pan and zoom
// maths of its range selector. Pure functions on unix seconds; no React.

/** The loaded history, first and last point (unix s). */
export type Bounds = readonly [number, number];
/** A shown window, from and to (unix s). */
export type Range = readonly [number, number];
export type Preset = { label: string; sec: number }; // sec = Infinity for "All"

export const PRESETS: Preset[] = [
  { label: "15 min", sec: 900 },
  { label: "1 h", sec: 3_600 },
  { label: "6 h", sec: 21_600 },
  { label: "All", sec: Number.POSITIVE_INFINITY },
];

/** The narrowest window the chart zooms to: ten reports at one every 30 s. */
export const MIN_WINDOW_SEC = 300;

/** A preset must be this much shorter than the history, or it would show almost what "All" shows. */
const DISTINCT = 1.25;

export const spanOf = (b: Bounds): number => Math.max(0, b[1] - b[0]);

/** "All" always; a fixed window only when it is clearly shorter than the history, so no two presets show the same range. */
export function presetEnabled(p: Preset, spanSec: number): boolean {
  return !Number.isFinite(p.sec) || p.sec * DISTINCT <= spanSec;
}

/** The window a preset shows: its length, ending at the latest point ("All": the whole history). */
export function presetRange(p: Preset, b: Bounds): Range {
  return [Math.max(b[0], b[1] - p.sec), b[1]];
}

/** The preset to open with: `wanted` when it fits the history, else "All". */
export function initialPreset(wanted: string, spanSec: number): Preset {
  const p = PRESETS.find((x) => x.label === wanted);
  return p && presetEnabled(p, spanSec) ? p : PRESETS[PRESETS.length - 1];
}

/** The preset a window matches (it ends at the latest point and has that length), if any. */
export function matchingPreset(r: Range, b: Bounds): Preset | undefined {
  if (Math.abs(r[1] - b[1]) > 1) return undefined;
  return PRESETS.filter((p) => presetEnabled(p, spanOf(b))).find((p) => {
    const q = presetRange(p, b);
    return Math.abs(q[0] - r[0]) <= 1;
  });
}

/** A window kept inside the history and at least MIN_WINDOW_SEC long (or the whole history when shorter). */
export function clampRange(r: Range, b: Bounds, minSec = MIN_WINDOW_SEC): Range {
  const span = spanOf(b);
  const w = Math.min(span, Math.max(minSec, r[1] - r[0]));
  const from = Math.min(Math.max(r[0], b[0]), b[1] - w);
  return [from, from + w];
}

/** The window moved by `deltaSec` (negative: earlier), same length, stopped at the history's ends. */
export function panRange(r: Range, deltaSec: number, b: Bounds): Range {
  return clampRange([r[0] + deltaSec, r[1] + deltaSec], b);
}

/**
 * The window scaled by `factor` (below 1 zooms in) around `anchor`, which keeps its place on screen
 * (the pointer's time for a wheel, the middle for a button), then kept inside the history.
 */
export function zoomRange(r: Range, factor: number, b: Bounds, anchor = (r[0] + r[1]) / 2, minSec = MIN_WINDOW_SEC): Range {
  const w = r[1] - r[0];
  const nw = Math.min(spanOf(b), Math.max(minSec, w * factor));
  const k = w > 0 ? (anchor - r[0]) / w : 0.5;
  return clampRange([anchor - k * nw, anchor - k * nw + nw], b, minSec);
}

/** One edge of the window moved by `deltaSec`, the other edge kept, the width at least `minSec`, inside the history. */
export function moveEdge(r: Range, edge: "from" | "to", deltaSec: number, b: Bounds, minSec = MIN_WINDOW_SEC): Range {
  const min = Math.min(minSec, spanOf(b));
  if (edge === "from") return [Math.min(Math.max(b[0], r[0] + deltaSec), r[1] - min), r[1]];
  return [r[0], Math.max(Math.min(b[1], r[1] + deltaSec), r[0] + min)];
}

/**
 * The points of a step series inside a window, with the step in force at each edge re-stamped there,
 * so the line runs from the left edge to the right one instead of between the changes inside it.
 */
export function sliceSteps<T extends { t: number }>(points: T[], r: Range): T[] {
  const inside = points.filter((p) => p.t >= r[0] && p.t <= r[1]);
  const before = points.filter((p) => p.t < r[0]).at(-1);
  const out = before && inside[0]?.t !== r[0] ? [{ ...before, t: r[0] }, ...inside] : inside;
  const last = out.at(-1);
  return last && last.t < r[1] && points.some((p) => p.t > r[1]) ? [...out, { ...last, t: r[1] }] : out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "6 Oct 16:32 UTC": when the loaded history starts, for the "All" preset. */
export function sinceLabel(t: number): string {
  const d = new Date(t * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hh}:${mm} UTC`;
}

/** A window's length for display: "45 min", "1 h 30 min", "7 h". */
export function durationLabel(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}
