import { describe, expect, it } from "vitest";
import { bandAt, parsePTradeBand, parseReplay, parseSummary, replayRows } from "./lab";

const band = {
  generatedAt: "2026-10-07T00:00:00Z",
  windowBlocks: 300,
  method: "test",
  grid: [
    { p: 0.1, lo95: 0.06, hi95: 0.15, lo99: 0.05, hi99: 0.17 },
    { p: 0.2, lo95: 0.14, hi95: 0.27, lo99: 0.12, hi99: 0.3 },
  ],
};

describe("parsePTradeBand / bandAt", () => {
  it("interpolates linearly between grid points and clamps outside", () => {
    const b = parsePTradeBand(band);
    expect(bandAt(b, 0.15).lo95).toBeCloseTo(0.1, 10);
    expect(bandAt(b, 0.15).hi99).toBeCloseTo(0.235, 10);
    expect(bandAt(b, 0.01)).toEqual({ lo95: 0.06, hi95: 0.15, lo99: 0.05, hi99: 0.17 });
    expect(bandAt(b, 0.9).hi95).toBe(0.27);
  });
  it("rejects an unsorted grid", () => {
    expect(() => parsePTradeBand({ ...band, grid: [...band.grid].reverse() })).toThrow(/ascending/);
  });
});

// Synthetic replay in the columnar shape plan 03 writes next to the points[] that plan 06 reads.
const replay = {
  window: { startUtc: "2026-02-04T12:00:00Z", endUtc: "2026-02-04T16:00:00Z" },
  t: [1770206400, 1770210000, 1770213600, 1770217200, 1770220800],
  sigmaAnnualPct: [74, 110, 225, 160, 120],
  feeVBp: [12, 30, 128, 80, 45],
  feeSBp: 55.7,
  arbCumVUsd: [0, 120, 900, 1300, 1500],
  arbCumSUsd: [0, 200, 1300, 1800, 2000],
};

describe("parseReplay / replayRows", () => {
  it("accepts plan 03's columnar shape and zips it into rows", () => {
    const rows = replayRows(parseReplay(replay));
    expect(rows).toHaveLength(5);
    expect(rows[2]).toEqual({ t: 1770213600, sigmaAnnualPct: 225, feeVBp: 128, feeSBp: 55.7, arbCumVUsd: 900, arbCumSUsd: 1300 });
  });
  it("keeps the optional price series", () => {
    expect(replayRows(parseReplay({ ...replay, price: [1, 2, 3, 4, 5] }))[4].price).toBe(5);
  });
  it("rejects arrays of different lengths", () => {
    expect(() => parseReplay({ ...replay, feeVBp: [12] })).toThrow(/arrays differ in length/);
  });
});

// Synthetic summary in the shape plan 03 writes to lab/out/summary.json (numbers from the old P* = 10% runs).
const summary = {
  generatedAt: "fixture",
  setting: { pStar: 0.1, feeMinPips: 500 },
  comparisons: {
    equalAvgFee: [{ period: "Feb 2026", arbChangePct: -20.0 }, { period: "Oct 2026", arbChangePct: -24.5 }],
    equalTraderCost: [{ period: "Feb 2026", arbChangePct: -14.0 }, { period: "Oct 2026", arbChangePct: 7.0 }],
  },
  pTrade: [
    { period: "Feb 2026", predicted: 0.1, observed: 0.08, blocks: 1200 },
    { period: "Oct 2026", predicted: 0.094, observed: 0.097, blocks: 1200 },
  ],
  replay: {
    window: "2026-02-04 12:00-16:00 UTC", sigmaMinPct: 74, sigmaMaxPct: 225, feeVMinBp: 12, feeVMaxBp: 128, feeSBp: 55.7,
    arbChangePct: -25.0, arbChangeRangePct: [-25.0, -8.0], pTradePredicted: 0.092, pTradeObserved: 0.069,
  },
  lpGain: { fullRangeEthPctPerYear: [0.1, 0.5], volatileAssetPctPerYearMax: 1.0, shareFromTop5WeeksPct: 50 },
  modelSeverityRatio: [1.1, 4.0],
  inPoolVolGainSharePct: [85, 97],
};

describe("parseSummary", () => {
  it("accepts plan 03's summary shape", () => {
    const s = parseSummary(summary);
    expect(s.comparisons.equalTraderCost[1].arbChangePct).toBe(7);
  });
  it("names the first missing field", () => {
    expect(() => parseSummary({ ...summary, comparisons: undefined })).toThrow(/missing comparisons.equalAvgFee/);
  });
});
