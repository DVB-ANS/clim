import { describe, expect, it } from "vitest";
import { decodeDeliveries, decodeReports, decodeSwaps } from "@/lib/decode";
import { computePoolId } from "@/lib/deployments";
import { FeeMode, type FeeParams } from "@/lib/feeMath";
import { makeMockWorld, MOCK_STATIC_FEE_PIPS } from "./world";
import { pnlExplain } from "@/lib/pnl";
import { arbBlocksOf } from "@/lib/ptrade";
import { weatherSeries } from "@/lib/series";

const params: FeeParams = { etaE4: 41_760, sqrtHalfDtE6: 2_449_490, feeMinPips: 500, feeMaxPips: 15_000, feeSafePips: 3_000, tauKillSec: 180 };
const NOW = 1_791_300_000;

describe("makeMockWorld", () => {
  const w = makeMockWorld({ nowSec: NOW, params });
  const reports = decodeReports(w.deskLogs);
  const swaps = decodeSwaps(w.swapLogs);

  it("is deterministic for a given seed and time", () => {
    const again = makeMockWorld({ nowSec: NOW, params });
    expect(again.deskLogs).toEqual(w.deskLogs);
    expect(again.swapLogs).toEqual(w.swapLogs);
  });
  it("emits a report every 30 s except during the cut-loop gap", () => {
    expect(reports.length).toBeGreaterThan(650);
    expect(reports.length).toBeLessThan(720);
    expect(reports.every((r, i) => i === 0 || r.seq === reports[i - 1].seq + 1)).toBe(true);
  });
  it("shows the three hook modes and a storm above the static pool's fee", () => {
    const s = weatherSeries(reports, params, NOW);
    const modes = new Set(s.map((x) => x.mode));
    expect(modes).toEqual(new Set([FeeMode.Normal, FeeMode.Degraded, FeeMode.Blind]));
    expect(Math.max(...s.map((x) => x.feeVBp))).toBeGreaterThan(MOCK_STATIC_FEE_PIPS / 100);
    expect(Math.min(...s.map((x) => x.feeVBp))).toBe(5);
  });
  it("uses pool ids that hash from the mock keys", () => {
    expect(w.pair.V.poolId).toBe(computePoolId(w.pair.V.key));
    expect(w.pair.S.poolId).toBe(computePoolId(w.pair.S.key));
  });
  it("produces arbitrage and retail swaps on both pools with a sensible P&L explain", () => {
    for (const pool of [w.pair.V, w.pair.S]) {
      expect(arbBlocksOf(swaps, pool.poolId, w.arbRouter).size).toBeGreaterThan(50);
      const r = pnlExplain({ swaps, reports, poolId: pool.poolId, token0IsEth: true, arbRouter: w.arbRouter });
      expect(r.arbSwaps).toBeLessThan(r.swaps);
      expect(r.arbUsd).toBeGreaterThan(0);
      expect(r.feeRetailUsd).toBeGreaterThan(0);
      expect(r.lvrUsd).toBeGreaterThan(0);
    }
  });
  it("records one rejected forged report next to the accepted deliveries", () => {
    const d = decodeDeliveries(w.forwarderLogs);
    expect(d.filter((x) => !x.accepted)).toHaveLength(1);
    expect(d.filter((x) => x.accepted)).toHaveLength(reports.length);
  });
  it("exposes the latest desk state and quote", () => {
    expect(w.desk.seq).toBe(reports.at(-1)?.seq);
    expect(w.latestBlock.timestamp).toBe(NOW);
    expect(w.quote.feePips).toBeGreaterThanOrEqual(500);
  });
});
