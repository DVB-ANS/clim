import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Hex, numberToHex } from "viem";
import { describe, expect, it } from "vitest";
import { parseSnapshot } from "./chain";
import { deployments, params as deployed } from "./config";
import { decodeReports, decodeSwaps, type DeskReport, type SwapRow } from "./decode";
import { type FeeParams, quoteFee } from "./feeMath";
import { deskStateOf } from "./series";
import { LATEST_STORM_WINDOW, stormStats } from "./storm";
import { annualPctToSigmaE9 } from "./units";

const params: FeeParams = { etaE4: 25_093, sqrtHalfDtE6: 2_449_490, feeMinPips: 500, feeMaxPips: 15_000, feeSafePips: 3_000, tauKillSec: 180 };
const V = "0x00000000000000000000000000000000000000000000000000000000000000a1" as Hex;
const S = "0x00000000000000000000000000000000000000000000000000000000000000b2" as Hex;
const T0 = 1_791_000_000;
const tsOf = (block: number) => T0 + (block - 100) * 12;
const hash = (block: number, logIndex: number) => numberToHex(block * 1_000 + logIndex, { size: 32 });

/** A RiskReported row at `block`, observed 20 s before it landed. */
function report(o: { seq: number; block: number; logIndex?: number; sigmaPct: number; dispBp?: number }): DeskReport {
  const t = tsOf(o.block);
  const sigma = annualPctToSigmaE9(o.sigmaPct);
  return {
    seq: o.seq, tObs: t - 20, sigmaApplied: sigma, sigmaReported: sigma, rv15E9: sigma, dvolE2: 0, refTick: 0,
    dispBp: o.dispBp ?? 3, nSources: 4, kE4: 10_000, zone: 0,
    blockNumber: o.block, blockTimestamp: t, txHash: hash(o.block, o.logIndex ?? 0), logIndex: o.logIndex ?? 0, latencySec: 20,
  };
}

const swap = (o: { pool: Hex; block: number; logIndex?: number; fee: number }) =>
  ({ poolId: o.pool, blockNumber: o.block, blockTimestamp: tsOf(o.block), logIndex: o.logIndex ?? 0, txHash: hash(o.block, o.logIndex ?? 0), fee: o.fee }) as SwapRow;

const fee = (r: DeskReport, t = r.blockTimestamp) => quoteFee(deskStateOf(r), t, params).feePips;

// calm, a storm with a degraded report in it (higher σ, but a safe mode), its peak, then calm again
const r1 = report({ seq: 1, block: 100, sigmaPct: 20 });
const r2 = report({ seq: 2, block: 103, logIndex: 5, sigmaPct: 100 });
const r3 = report({ seq: 3, block: 106, sigmaPct: 400, dispBp: 31 });
const r4 = report({ seq: 4, block: 109, sigmaPct: 300 });
const r5 = report({ seq: 5, block: 112, sigmaPct: 20 });
const r6 = report({ seq: 6, block: 115, sigmaPct: 20 });
const reports = [r1, r2, r3, r4, r5, r6];
const window = [tsOf(98), tsOf(118)] as const;
const run = (o: { reports?: DeskReport[]; swaps?: SwapRow[]; window?: readonly [number, number] } = {}) =>
  stormStats({ reports: o.reports ?? reports, swaps: o.swaps ?? [], poolIdV: V, poolIdS: S, params, window: o.window ?? window });

describe("LATEST_STORM_WINDOW", () => {
  it("is 7 October 2026, 01:40 to 03:10 UTC", () => {
    expect(LATEST_STORM_WINDOW.map((t) => new Date(t * 1000).toISOString())).toEqual(["2026-10-07T01:40:00.000Z", "2026-10-07T03:10:00.000Z"]);
  });
});

describe("stormStats", () => {
  it("is undefined when no report landed in the window, or when σ never took V's fee off its floor", () => {
    expect(run({ window: [tsOf(200), tsOf(210)] })).toBeUndefined();
    expect(run({ reports: [r1, r5, r6] })).toBeUndefined();
    expect(run({ reports: [] })).toBeUndefined();
  });

  it("takes the highest σ among the reports that landed in the window, skipping a higher, degraded one", () => {
    const s = run();
    expect(s?.peak.report).toBe(r4);
    expect(s?.peak.sigmaPct).toBeCloseTo(300, 3);
    expect(s?.peak.feePips).toBe(fee(r4));
    expect(fee(r4)).toBeGreaterThan(params.feeSafePips);
  });

  it("spans the first to the last moment σ held the fee above the floor, counting normal mode only", () => {
    const s = run();
    // above from r2 to r3 (σ), not from r3 to r4 (degraded: a safe mode, not the weather), above from r4 to r5
    expect(s?.above).toEqual({ from: r2.blockTimestamp, to: r5.blockTimestamp, sec: 36 + 36 });
    expect(s?.reports).toEqual({ n: 3, aboveFloor: 2 });
  });

  it("stops at the window's end when the fee is still above the floor there", () => {
    const s = run({ window: [tsOf(98), tsOf(110)] });
    expect(s?.above).toEqual({ from: r2.blockTimestamp, to: tsOf(110), sec: 36 + 12 });
  });

  it("counts V's swaps in the span, those above the floor, and those that paid the formula's fee for the report in force", () => {
    const sameBlockBefore = swap({ pool: V, block: 103, logIndex: 0, fee: fee(r1, tsOf(103)) }); // before r2 in its block: r1 prices it
    const underR2 = swap({ pool: V, block: 104, fee: fee(r2, tsOf(104)) });
    const degraded = swap({ pool: V, block: 107, fee: fee(r3, tsOf(107)) }); // a safe mode quotes max(σ's fee, the safe fee)
    const degradedTie = swap({ pool: V, block: 108, fee: fee(r3, tsOf(108)) });
    const underR4 = swap({ pool: V, block: 110, fee: fee(r4, tsOf(110)) });
    const wrong = swap({ pool: V, block: 111, logIndex: 1, fee: 777 });
    const outsideBefore = swap({ pool: V, block: 99, fee: 500 });
    const outsideAfter = swap({ pool: V, block: 112, logIndex: 1, fee: 500 });
    const onS = [swap({ pool: S, block: 104, fee: 511 }), swap({ pool: S, block: 110, fee: 511 }), swap({ pool: S, block: 99, fee: 600 })];
    const swaps = [wrong, underR4, degradedTie, degraded, underR2, sameBlockBefore, outsideBefore, outsideAfter, ...onS];
    const s = run({ swaps });
    expect(sameBlockBefore.fee).toBe(params.feeMinPips);
    expect(degraded.fee).toBeGreaterThan(fee(r4));
    expect(s?.v).toEqual({ n: 6, minPips: 500, maxPips: degraded.fee, aboveFloor: 5, formula: 5, top: degraded });
    expect(s?.s).toEqual({ n: 2, minPips: 511, maxPips: 511 });
  });

  it("leaves V and S undefined when they had no swap in the span", () => {
    const s = run({ swaps: [swap({ pool: V, block: 99, fee: 500 })] });
    expect(s?.v).toBeUndefined();
    expect(s?.s).toBeUndefined();
  });

  it("reads the modes from the hook's own series: a blind spell is not a storm", () => {
    // a single stormy report, then silence: blind from tObs + tauKillSec + 1, at the safe fee, not counted
    const lone = report({ seq: 1, block: 100, sigmaPct: 200 });
    const s = run({ reports: [lone], window: [tsOf(100), tsOf(130)] });
    expect(s?.above).toEqual({ from: lone.blockTimestamp, to: lone.tObs + params.tauKillSec + 1, sec: params.tauKillSec + 1 - 20 });
  });
});

// The real storm, from the committed snapshot of the live pair's logs: the numbers /replay shows must be the ones
// docs/sessions/2026-10-07.md and the README report. Skipped if the snapshot stops covering the window.
const snapPath = fileURLToPath(new URL("../../public/data/chain/live.json", import.meta.url));
const snap = existsSync(snapPath) ? parseSnapshot(JSON.parse(readFileSync(snapPath, "utf8")), "live") : null;
const live = deployments.pairs.live;
const covers = live !== undefined && snap !== null && snap.deskLogs.length > 0 && snap.fromBlock <= 11_859_000 && snap.toBlock >= 11_861_000;

describe.skipIf(!covers)("the 7 October 2026 storm in the live snapshot", () => {
  it("matches the session log: σ 242.1%/yr in report #1119, 26.50 bp paid in its block, 105 swaps on V at the formula's fee", () => {
    const s = stormStats({
      reports: decodeReports(snap!.deskLogs),
      swaps: decodeSwaps(snap!.swapLogs),
      poolIdV: live!.V.poolId,
      poolIdS: live!.S.poolId,
      params: deployed,
      window: LATEST_STORM_WINDOW,
    });
    expect(s).toBeDefined();
    const iso = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);
    expect(s!.peak.report.seq).toBe(1119);
    expect(s!.peak.sigmaPct.toFixed(1)).toBe("242.1");
    expect(s!.peak.feePips).toBe(2650);
    expect(iso(s!.peak.report.blockTimestamp)).toBe("02:11");
    expect([iso(s!.above.from), iso(s!.above.to)]).toEqual(["01:58", "02:51"]);
    expect(s!.reports).toEqual({ n: 105, aboveFloor: 100 });
    expect(s!.v?.top.txHash).toBe("0xbc900e898c3ab4a46ea985d9d70786226c2edd7b6aefae2d566c8d8c280fe7e2");
    expect(s!.v?.top.blockNumber).toBe(11_859_911);
    expect(s!.v?.top.blockNumber).toBe(s!.peak.report.blockNumber);
    expect(s!.v).toMatchObject({ n: 105, minPips: 500, maxPips: 2650, formula: 105 });
    expect(s!.s).toMatchObject({ minPips: 511, maxPips: 511 });
  });
});
