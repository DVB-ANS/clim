// Fables' keeper fee during clim's 7 October 2026 storm: public/data/lab/fables-storm-2026-10-07.json, written by
// lab/scripts/fables_storm.py from Robinhood Chain logs (FeePoked, PoolConfigured, Swap) and copied by `npm run sync`.
// Pure: no React, so /replay's chart series are tested (fables.test.ts).

export type FeeStep = { t: number; feePips: number };
export type FablesTx = { t: number; feePips: number; tx: string };
export type FablesStorm = {
  chain: string;
  explorer: string;
  hook: string;
  pair: string;
  window: { start: number; end: number };
  config: { floorPips: number; flatPips: number; capPips: number };
  pokeTtlSec: number;
  keepers: string[];
  pokes: (FablesTx & { expiry: number })[];
  steps: FeeStep[];
  swaps: { n: number; minPips: number; maxPips: number; aboveFlat: number; matchKeeperRule: number; top: FablesTx };
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const num = (x: unknown, what: string): number => {
  if (typeof x !== "number" || !Number.isFinite(x)) throw new Error(`fables storm: ${what} is not a number`);
  return x;
};

/** The lab file, checked: a window, the pool's config, the keeper's steps and the swaps' summary. */
export function parseFablesStorm(raw: unknown): FablesStorm {
  if (!isObj(raw) || !isObj(raw.window) || !isObj(raw.config) || !isObj(raw.swaps) || !Array.isArray(raw.steps) || !Array.isArray(raw.pokes)) {
    throw new Error("fables storm: missing window, config, swaps, steps or pokes");
  }
  const d = raw as unknown as FablesStorm;
  num(d.window.start, "window.start");
  num(d.window.end, "window.end");
  num(d.config.flatPips, "config.flatPips");
  num(d.config.capPips, "config.capPips");
  num(d.swaps.n, "swaps.n");
  if (d.steps.length === 0 || d.steps[0].t > d.window.start) throw new Error("fables storm: no fee at the window's start");
  return d;
}

/**
 * Two step series on one time axis, from start to end: a point at start, at every change of either series
 * inside the window, and at end, each carrying the value of both at that time (the last change at or before).
 * A series with no change at or before a time takes its first value.
 */
export function mergeSteps(a: FeeStep[], b: FeeStep[], start: number, end: number): { t: number; a: number; b: number }[] {
  const at = (s: FeeStep[], t: number) => {
    let v = s[0]?.feePips ?? 0;
    for (const x of s) {
      if (x.t > t) break;
      v = x.feePips;
    }
    return v;
  };
  const times = [...new Set([start, ...a.map((x) => x.t), ...b.map((x) => x.t), end])].filter((t) => t >= start && t <= end).sort((x, y) => x - y);
  return times.map((t) => ({ t, a: at(a, t), b: at(b, t) }));
}
