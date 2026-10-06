// Replay of a historical 1 s price window at 1x real time.
// Clock: the replay "main start" (startTs + warmupSec) is mapped to a wall-clock minute (the anchor); from then on
// the virtual time advances with the wall clock: histNow = floor(nowWall) - offsetSec, offsetSec = anchor - mainStart.
// Everything is served in virtual (historical) time, except the per-venue klines that the CRE workflow reads: those
// are shifted to the wall clock, because the workflow judges candle freshness against DON time.
// Endpoints (handleReplayRequest):
//   GET /venue/<name>/api/v3/klines  plan 02 replay mode: Binance 1m klines, open/close times shifted to the wall clock
//   GET /snapshot                    diagnostic: {nowSec, usdtUsd, dvol, venues: [{venue, quote, candles: [[openTimeSec, close]]}]}
//   GET /api/v3/klines               Binance 1m klines (symbol, interval=1m, limit, startTime, endTime in historical ms)
//   GET /api/v3/ticker/price         Binance ticker, the 1 s close at the replay time (the replay arbitrageur's market price)
//   GET /status                      progress of the replay

export type ReplayWindow = {
  symbol: string;
  source: string;
  startTs: number; // unix seconds of closes[0], multiple of 60
  stepSec: 1;
  warmupSec: number; // multiple of 60, >= MIN_WARMUP_SEC
  closes: number[]; // one close per second, length multiple of 60
};

export type ReplayClock = { offsetSec: number; mainStartHist: number };

/** Binance kline: [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBase, takerQuote, ignore]. */
export type Kline = [number, string, string, string, string, string, number, string, number, string, string, string];

export type SnapshotVenue = { venue: string; quote: "USD" | "USDT"; candles: Array<[number, number]> };
export type Snapshot = { nowSec: number; usdtUsd: number | null; dvol: number | null; venues: SnapshotVenue[] };

export type HandlerResult = { status: number; body: unknown };

/** The CRE estimator needs 16 closed 1-minute candles (RV15) plus its freshness margin: 21 minutes of warm-up. */
export const MIN_WARMUP_SEC = 1260;
/** Closed candles per venue in /snapshot. */
export const SNAPSHOT_MINUTES = 25;
/** The window is one Binance series; it is served as several identical venues so the desk quorum (>= 3) is met.
 *  The names say so, the replay desk carries the REPLAY flag, and dispersion is 0 by construction. */
export const DEFAULT_SNAPSHOT_VENUES = ["binance-replay-1", "binance-replay-2", "binance-replay-3", "binance-replay-4"];
const MAX_LIMIT = 1_000;
const DEFAULT_LIMIT = 500;

export function parseReplayWindow(raw: unknown): ReplayWindow {
  if (typeof raw !== "object" || raw === null) throw new Error("replay window: expected an object");
  const o = raw as Record<string, unknown>;
  if (typeof o.symbol !== "string" || typeof o.source !== "string") throw new Error("replay window: symbol and source must be strings");
  if (typeof o.startTs !== "number" || !Number.isInteger(o.startTs) || o.startTs % 60 !== 0) {
    throw new Error("replay window: startTs must be a unix second on a minute boundary");
  }
  if (o.stepSec !== 1) throw new Error("replay window: stepSec must be 1");
  if (typeof o.warmupSec !== "number" || o.warmupSec < MIN_WARMUP_SEC || o.warmupSec % 60 !== 0) {
    throw new Error(`replay window: warmupSec must be a multiple of 60 and >= ${MIN_WARMUP_SEC}`);
  }
  if (!Array.isArray(o.closes) || o.closes.length % 60 !== 0 || o.closes.length <= o.warmupSec) {
    throw new Error("replay window: closes must cover whole minutes and extend past warmupSec");
  }
  if (!o.closes.every((c) => typeof c === "number" && Number.isFinite(c) && c > 0)) {
    throw new Error("replay window: every close must be a positive number");
  }
  return { symbol: o.symbol, source: o.source, startTs: o.startTs, stepSec: 1, warmupSec: o.warmupSec, closes: o.closes as number[] };
}

export function makeClock(w: ReplayWindow, anchorWallSec: number): ReplayClock {
  if (!Number.isInteger(anchorWallSec) || anchorWallSec % 60 !== 0) throw new Error("anchor must be a wall-clock minute (unix seconds, multiple of 60)");
  const mainStartHist = w.startTs + w.warmupSec;
  return { offsetSec: anchorWallSec - mainStartHist, mainStartHist };
}

function endHist(w: ReplayWindow): number {
  return w.startTs + w.closes.length - 1;
}

function closeAt(w: ReplayWindow, hist: number): number {
  return w.closes[hist - w.startTs] as number;
}

function fmt(x: number): string {
  return x.toFixed(8);
}

function kline(w: ReplayWindow, minuteIdx: number, histNow: number): Kline {
  const open = w.startTs + minuteIdx * 60;
  const last = Math.min(open + 59, histNow);
  let hi = -Infinity;
  let lo = Infinity;
  for (let t = open; t <= last; t++) {
    const c = closeAt(w, t);
    if (c > hi) hi = c;
    if (c < lo) lo = c;
  }
  return [open * 1000, fmt(closeAt(w, open)), fmt(hi), fmt(lo), fmt(closeAt(w, last)), "0", open * 1000 + 59_999, "0", 0, "0", "0", "0"];
}

function klines(w: ReplayWindow, histNow: number, q: URLSearchParams): HandlerResult {
  if (q.get("symbol") !== w.symbol) return { status: 400, body: { code: -1121, msg: "Invalid symbol." } };
  if (q.get("interval") !== "1m") return { status: 400, body: { code: -1120, msg: "Invalid interval." } };
  const limit = Math.min(Math.max(Number(q.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const toIdx = (ms: number) => (ms / 1000 - w.startTs) / 60;
  const lastIdx = Math.floor((Math.min(histNow, endHist(w)) - w.startTs) / 60);
  const endTime = q.get("endTime");
  const endIdx = endTime === null ? lastIdx : Math.min(lastIdx, Math.floor(toIdx(Number(endTime))));
  const startTime = q.get("startTime");
  let from: number;
  let to: number;
  if (startTime !== null) {
    from = Math.max(0, Math.ceil(toIdx(Number(startTime))));
    to = Math.min(endIdx, from + limit - 1);
  } else {
    to = endIdx;
    from = Math.max(0, to - limit + 1);
  }
  const out: Kline[] = [];
  for (let i = from; i <= to; i++) out.push(kline(w, i, histNow));
  return { status: 200, body: out };
}

/** Diagnostic snapshot: the last SNAPSHOT_MINUTES closed 1-minute candles [openTimeSec, close] per venue. */
export function buildSnapshot(w: ReplayWindow, histNow: number, venues: readonly string[] = DEFAULT_SNAPSHOT_VENUES): Snapshot {
  const closedUntil = Math.min(histNow, endHist(w) + 1); // a minute is closed once its 60th second is past
  const lastClosed = Math.floor((closedUntil - w.startTs) / 60) - 1;
  const candles: Array<[number, number]> = [];
  for (let i = Math.max(0, lastClosed - SNAPSHOT_MINUTES + 1); i <= lastClosed; i++) {
    const open = w.startTs + i * 60;
    candles.push([open, closeAt(w, open + 59)]);
  }
  return {
    nowSec: histNow,
    usdtUsd: 1, // the window is Binance ETHUSDT; the replay uses USDT as USD
    dvol: null, // no minute DVOL for the window (the desk reports dvolE2 = 0)
    venues: venues.map((venue) => ({ venue, quote: "USDT", candles })),
  };
}

/** Plan 02 replay mode (GET /venue/<name>/api/v3/klines): the same klines with open and close times shifted to the
 *  wall clock (+offsetSec), so the workflow's freshness rule (last closed candle at most 120 s old) holds. */
function wallClockKlines(w: ReplayWindow, histNow: number, q: URLSearchParams, offsetSec: number): HandlerResult {
  const shiftMs = offsetSec * 1000;
  const hq = new URLSearchParams(q);
  for (const k of ["startTime", "endTime"]) {
    const v = q.get(k);
    if (v !== null) hq.set(k, String(Number(v) - shiftMs));
  }
  const r = klines(w, histNow, hq);
  if (r.status !== 200) return r;
  return {
    status: 200,
    body: (r.body as Kline[]).map((k): Kline => [k[0] + shiftMs, k[1], k[2], k[3], k[4], k[5], k[6] + shiftMs, k[7], k[8], k[9], k[10], k[11]]),
  };
}

const VENUE_KLINES = /^\/venue\/[A-Za-z0-9_-]+\/api\/v3\/klines$/;

export function handleReplayRequest(
  w: ReplayWindow,
  clock: ReplayClock,
  url: URL,
  nowWallMs: number,
  venues: readonly string[] = DEFAULT_SNAPSHOT_VENUES,
): HandlerResult {
  const histNow = Math.floor(nowWallMs / 1000) - clock.offsetSec;
  const end = endHist(w);
  if (url.pathname === "/status") {
    const progress = Math.min(1, Math.max(0, (histNow - clock.mainStartHist) / (end - clock.mainStartHist)));
    return {
      status: 200,
      body: {
        symbol: w.symbol,
        source: w.source,
        histNow,
        histNowIso: new Date(Math.min(histNow, end) * 1000).toISOString(),
        offsetSec: clock.offsetSec,
        mainStartHist: clock.mainStartHist,
        endHist: end,
        progress,
        done: histNow > end,
      },
    };
  }
  if (histNow < w.startTs) return { status: 503, body: { msg: "replay not started" } };
  if (url.pathname === "/snapshot") return { status: 200, body: buildSnapshot(w, histNow, venues) };
  if (url.pathname === "/api/v3/ticker/price") {
    if (url.searchParams.get("symbol") !== w.symbol) return { status: 400, body: { code: -1121, msg: "Invalid symbol." } };
    return { status: 200, body: { symbol: w.symbol, price: fmt(closeAt(w, Math.min(histNow, end))) } };
  }
  if (url.pathname === "/api/v3/klines") return klines(w, histNow, url.searchParams);
  if (VENUE_KLINES.test(url.pathname)) return wallClockKlines(w, histNow, url.searchParams, clock.offsetSec);
  return { status: 404, body: { msg: `unknown path ${url.pathname}` } };
}
