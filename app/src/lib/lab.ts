// Lab outputs (lab/out/*.json, written by plan 03) read by the app: summary.json (the condensed view of
// backtest-summary.json, which plan 06 reads), the columnar part of replay-2026-02-04.json and ptrade-band.json,
// so the README, the deck and the dashboard show the same numbers.
// Units: fractions for P_trade and pStar (0.097), percent for every *Pct field (-24.5), bp for fees.
// app/src/fixtures/lab/*.json are synthetic, shape-identical files carrying `fixture: true`.

export type PeriodChange = { period: string; arbChangePct: number };

export type LabSummary = {
  fixture: boolean;
  generatedAt: string;
  setting: { pStar: number; feeMinPips: number };
  comparisons: { equalAvgFee: PeriodChange[]; equalTraderCost: PeriodChange[] };
  pTrade: { period: string; predicted: number; observed: number; blocks: number }[];
  replay: {
    window: string;
    sigmaMinPct: number;
    sigmaMaxPct: number;
    feeVMinBp: number;
    feeVMaxBp: number;
    feeSBp: number;
    arbChangePct: number;
    arbChangeRangePct: [number, number];
    // Added by plan 03 Task 17 in the fixer pass; absent from older outputs and from the fixtures.
    windowsMedianPct?: number;
    windowsBetterCount?: number;
    windowsCount?: number;
    windowsBeatingChosenCount?: number;
    pTradePredicted: number;
    pTradeObserved: number;
  };
  lpGain: { fullRangeEthPctPerYear: [number, number]; volatileAssetPctPerYearMax: number; shareFromTop5WeeksPct: number };
  modelSeverityRatio: [number, number];
  inPoolVolGainSharePct: [number, number];
};

export type LabReplay = {
  fixture: boolean;
  window: { startUtc: string; endUtc: string };
  t: number[]; // unix seconds
  sigmaAnnualPct: number[];
  feeVBp: number[];
  feeSBp: number;
  arbCumVUsd: number[];
  arbCumSUsd: number[];
  price?: number[]; // optional ETH/USD, drawn when present
};

export type ReplayRow = { t: number; sigmaAnnualPct: number; feeVBp: number; feeSBp: number; arbCumVUsd: number; arbCumSUsd: number; price?: number };

export type BandRow = { p: number; lo95: number; hi95: number; lo99: number; hi99: number };
export type LabPTradeBand = {
  fixture: boolean;
  generatedAt: string;
  windowBlocks: number;
  method: string;
  grid: BandRow[]; // ascending p; quantiles of the observed rolling frequency under the clustered model
};

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null;

function need(o: Obj, path: string): unknown {
  let cur: unknown = o;
  for (const k of path.split(".")) {
    if (!isObj(cur) || cur[k] === undefined || cur[k] === null) throw new Error(`lab file: missing ${path}`);
    cur = cur[k];
  }
  return cur;
}

export function parseSummary(raw: unknown): LabSummary {
  if (!isObj(raw)) throw new Error("summary.json: not an object");
  for (const p of [
    "generatedAt", "setting.pStar", "comparisons.equalAvgFee", "comparisons.equalTraderCost", "pTrade",
    "replay.arbChangeRangePct", "replay.feeSBp", "lpGain.fullRangeEthPctPerYear", "modelSeverityRatio", "inPoolVolGainSharePct",
  ]) need(raw, p);
  return { ...(raw as unknown as LabSummary), fixture: raw.fixture === true };
}

const SERIES = ["t", "sigmaAnnualPct", "feeVBp", "arbCumVUsd", "arbCumSUsd"] as const;

export function parseReplay(raw: unknown): LabReplay {
  if (!isObj(raw)) throw new Error("replay: not an object");
  need(raw, "window.startUtc");
  need(raw, "feeSBp");
  const lengths = SERIES.map((k) => (Array.isArray(raw[k]) ? (raw[k] as unknown[]).length : -1));
  if (lengths[0] < 2) throw new Error("replay: need at least 2 points");
  if (lengths.some((n) => n !== lengths[0])) throw new Error(`replay: arrays differ in length (${SERIES.map((k, i) => `${k}=${lengths[i]}`).join(", ")})`);
  if (raw.price !== undefined && (!Array.isArray(raw.price) || raw.price.length !== lengths[0])) throw new Error("replay: price must match t");
  return { ...(raw as unknown as LabReplay), fixture: raw.fixture === true };
}

/** Columnar replay -> one row per point, for the charts. */
export function replayRows(r: LabReplay): ReplayRow[] {
  return r.t.map((t, i) => ({
    t,
    sigmaAnnualPct: r.sigmaAnnualPct[i],
    feeVBp: r.feeVBp[i],
    feeSBp: r.feeSBp,
    arbCumVUsd: r.arbCumVUsd[i],
    arbCumSUsd: r.arbCumSUsd[i],
    ...(r.price ? { price: r.price[i] } : {}),
  }));
}

export function parsePTradeBand(raw: unknown): LabPTradeBand {
  if (!isObj(raw)) throw new Error("ptrade-band.json: not an object");
  const grid = need(raw, "grid") as BandRow[];
  need(raw, "windowBlocks");
  if (!Array.isArray(grid) || grid.length === 0) throw new Error("ptrade-band.json: grid must be a non-empty array");
  for (let i = 1; i < grid.length; i++) {
    if (grid[i].p <= grid[i - 1].p) throw new Error("ptrade-band.json: grid must be ascending in p");
  }
  return { ...(raw as unknown as LabPTradeBand), fixture: raw.fixture === true };
}

/** Band quantiles at predicted frequency p (linear interpolation on the lab grid, clamped at the ends). */
export function bandAt(band: LabPTradeBand, p: number): Omit<BandRow, "p"> {
  const g = band.grid;
  const strip = ({ lo95, hi95, lo99, hi99 }: BandRow) => ({ lo95, hi95, lo99, hi99 });
  if (p <= g[0].p) return strip(g[0]);
  if (p >= g[g.length - 1].p) return strip(g[g.length - 1]);
  const i = g.findIndex((r) => r.p >= p);
  const a = g[i - 1];
  const b = g[i];
  const w = (p - a.p) / (b.p - a.p);
  const lerp = (x: number, y: number) => x + (y - x) * w;
  return { lo95: lerp(a.lo95, b.lo95), hi95: lerp(a.hi95, b.hi95), lo99: lerp(a.lo99, b.lo99), hi99: lerp(a.hi99, b.hi99) };
}
