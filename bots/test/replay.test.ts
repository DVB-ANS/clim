import { describe, expect, test } from "bun:test";
import { buildSnapshot, handleReplayRequest, makeClock, parseReplayWindow, type ReplayWindow, type Snapshot } from "../src/replay/klines";

// 30 minutes of synthetic 1 s closes: 2000.0, 2000.5, 2001.0, ... (monotonic, so open/low = first, high/close = last).
const START = 1_770_204_600; // 2026-02-04 11:30:00 UTC
const WARMUP = 1_260;
const W: ReplayWindow = parseReplayWindow({
  symbol: "ETHUSDT",
  source: "synthetic test window",
  startTs: START,
  stepSec: 1,
  warmupSec: WARMUP,
  closes: Array.from({ length: 1_800 }, (_, i) => 2_000 + i * 0.5),
});
const ANCHOR = 1_791_281_760; // wall-clock minute at which the replay main part (START + WARMUP) starts
const clock = makeClock(W, ANCHOR);

function get(path: string, wallSec: number) {
  return handleReplayRequest(W, clock, new URL(`http://127.0.0.1:8787${path}`), wallSec * 1000);
}
type K = [number, string, string, string, string, string, number, string, number, string, string, string];

describe("replay window validation", () => {
  const ok = { symbol: "ETHUSDT", source: "x", startTs: START, stepSec: 1, warmupSec: WARMUP, closes: Array(1_800).fill(1) };
  test("accepts a well-formed window", () => {
    expect(parseReplayWindow(ok).closes.length).toBe(1_800);
  });
  test("rejects windows off the minute grid, partial minutes, short warm-up or bad prices", () => {
    expect(() => parseReplayWindow({ ...ok, startTs: START + 1 })).toThrow(/minute/);
    expect(() => parseReplayWindow({ ...ok, closes: Array(1_801).fill(1) })).toThrow(/whole minutes/);
    expect(() => parseReplayWindow({ ...ok, warmupSec: 1_200 })).toThrow(/warmupSec/);
    expect(() => parseReplayWindow({ ...ok, closes: [...Array(1_799).fill(1), 0] })).toThrow(/positive/);
  });
});

describe("clock", () => {
  test("the anchor minute maps to the main start, then the replay runs at 1x", () => {
    expect((get("/status", ANCHOR).body as { histNow: number }).histNow).toBe(START + WARMUP);
    expect((get("/status", ANCHOR + 42).body as { histNow: number }).histNow).toBe(START + WARMUP + 42);
  });
});

describe("GET /snapshot (diagnostic)", () => {
  test("four identical venues of closed 1-minute candles in virtual time", () => {
    const s = get("/snapshot", ANCHOR + 75).body as Snapshot;
    expect(s.nowSec).toBe(START + WARMUP + 75);
    expect(s.usdtUsd).toBe(1);
    expect(s.dvol).toBeNull();
    expect(s.venues.map((v) => v.venue)).toEqual(["binance-replay-1", "binance-replay-2", "binance-replay-3", "binance-replay-4"]);
    const c = s.venues[0]?.candles ?? [];
    expect(c.length).toBe(22); // minutes 0..21 are closed at START + 1335
    expect(c[0]).toEqual([START, 2_029.5]);
    expect(c[21]).toEqual([START + 1_260, 2_659.5]);
    expect(s.venues.every((v) => v.quote === "USDT" && v.candles === c)).toBe(true);
  });
  test("covers [nowSec - 1200, nowSec - 65] from the first report", () => {
    const s = get("/snapshot", ANCHOR).body as Snapshot;
    const c = s.venues[0]?.candles ?? [];
    expect((c[0] as [number, number])[0]).toBeLessThanOrEqual(s.nowSec - 1_200);
    expect((c[c.length - 1] as [number, number])[0] + 60).toBeGreaterThanOrEqual(s.nowSec - 65);
  });
  test("keeps the last 25 minutes and freezes after the end of the window", () => {
    const s = buildSnapshot(W, START + 2_260);
    const c = s.venues[0]?.candles ?? [];
    expect(s.nowSec).toBe(START + 2_260);
    expect(c.length).toBe(25);
    expect(c[24]).toEqual([START + 1_740, 2_899.5]);
  });
});

describe("GET /api/v3/klines (Binance format, virtual time)", () => {
  test("at the anchor: 21 closed warm-up candles plus the open current candle", () => {
    const r = get("/api/v3/klines?symbol=ETHUSDT&interval=1m&limit=500", ANCHOR);
    expect(r.status).toBe(200);
    const k = r.body as K[];
    expect(k.length).toBe(22);
    const first = k[0] as K;
    expect(first[0]).toBe(START * 1000);
    expect(first.slice(1, 5)).toEqual(["2000.00000000", "2029.50000000", "2000.00000000", "2029.50000000"]);
    expect(first[6]).toBe(START * 1000 + 59_999);
    const last = k[21] as K;
    expect(last[0]).toBe((START + WARMUP) * 1000);
    expect(last[4]).toBe("2630.00000000");
  });
  test("limit returns the most recent candles; startTime returns from that minute forward", () => {
    expect((get("/api/v3/klines?symbol=ETHUSDT&interval=1m&limit=2", ANCHOR).body as K[]).map((x) => x[0])).toEqual([
      (START + WARMUP - 60) * 1000,
      (START + WARMUP) * 1000,
    ]);
    const t3 = (START + 180) * 1000;
    expect((get(`/api/v3/klines?symbol=ETHUSDT&interval=1m&limit=2&startTime=${t3}`, ANCHOR).body as K[]).map((x) => x[0])).toEqual([t3, t3 + 60_000]);
  });
  test("errors use Binance codes", () => {
    expect(get("/api/v3/klines?symbol=ETHUSDT&interval=5m", ANCHOR)).toEqual({ status: 400, body: { code: -1120, msg: "Invalid interval." } });
    expect(get("/api/v3/klines?symbol=BTCUSDT&interval=1m", ANCHOR)).toEqual({ status: 400, body: { code: -1121, msg: "Invalid symbol." } });
    expect(get("/nope", ANCHOR).status).toBe(404);
  });
});

describe("GET /venue/<name>/api/v3/klines (plan 02 replay mode, wall-clock time)", () => {
  test("the same candles as /api/v3/klines, open and close times shifted to the wall clock", () => {
    const hist = get("/api/v3/klines?symbol=ETHUSDT&interval=1m&limit=20", ANCHOR + 75).body as K[];
    const wall = get("/venue/kraken/api/v3/klines?symbol=ETHUSDT&interval=1m&limit=20", ANCHOR + 75).body as K[];
    expect(wall.length).toBe(20);
    expect(wall.map((k) => k.slice(1, 6))).toEqual(hist.map((k) => k.slice(1, 6)));
    expect(wall[19]?.[0]).toBe((ANCHOR + 60) * 1000); // the wall-clock minute in progress
    expect(wall[19]?.[6]).toBe((ANCHOR + 60) * 1000 + 59_999);
    expect(get("/venue/binance/api/v3/klines?symbol=ETHUSDT&interval=1m&limit=20", ANCHOR + 75).body).toEqual(wall);
  });
});

describe("GET /api/v3/ticker/price and /status", () => {
  test("ticker is the 1 s close at the replay time", () => {
    expect(get("/api/v3/ticker/price?symbol=ETHUSDT", ANCHOR + 30).body).toEqual({ symbol: "ETHUSDT", price: "2645.00000000" });
  });
  test("after the end the price freezes and status says done", () => {
    expect(get("/api/v3/ticker/price?symbol=ETHUSDT", ANCHOR + 1_000).body).toEqual({ symbol: "ETHUSDT", price: "2899.50000000" });
    const s = get("/status", ANCHOR + 1_000).body as { done: boolean; progress: number };
    expect(s.done).toBe(true);
    expect(s.progress).toBe(1);
  });
  test("before the window starts the server answers 503", () => {
    expect(get("/api/v3/ticker/price?symbol=ETHUSDT", ANCHOR - WARMUP - 1).status).toBe(503);
  });
});
