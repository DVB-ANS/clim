import { describe, expect, it } from "vitest";
import { decodeDeliveries, decodeReports, decodeSwaps, lastAtOrBefore } from "./decode";
import { encodeReportProcessedLog, encodeRiskReportedLog, encodeSwapLog } from "./encode";

const DESK = "0x00000000000000000000000000000000000de5c0";
const PM = "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543";
const POOL = "0x203a9d9283af6b2a48fd7e84ad78308008fecfe468f294bba26776f9d7ce62a3";
const ROUTER = "0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe";
const TX = "0x7cd1bd67280cc7c7e96c3fff4e956c708043d6091972c78c9536d7711587fe63";

const report = {
  seq: 12,
  tObs: 1_790_000_000,
  sigmaApplied: 85_475,
  sigmaReported: 90_000,
  rv15E9: 90_000,
  dvolE2: 4_825,
  refTick: 78_244,
  dispBp: 3,
  nSources: 4,
  kE4: 10_000,
  zone: 0,
};

describe("decodeReports", () => {
  it("decodes every RiskReported field plus log metadata, sorted by block then log index", () => {
    const a = encodeRiskReportedLog(report, {
      address: DESK, blockNumber: 101, blockTimestamp: 1_790_000_048, transactionHash: TX, logIndex: 4,
    });
    const b = encodeRiskReportedLog({ ...report, seq: 11 }, {
      address: DESK, blockNumber: 100, blockTimestamp: 1_790_000_036, transactionHash: TX, logIndex: 9,
    });
    const out = decodeReports([a, b]);
    expect(out.map((r) => r.seq)).toEqual([11, 12]);
    expect(out[1]).toEqual({
      ...report,
      blockNumber: 101,
      blockTimestamp: 1_790_000_048,
      latencySec: 48,
      txHash: TX,
      logIndex: 4,
    });
  });
  it("ignores logs with another topic", () => {
    const swap = encodeSwapLog(
      { poolId: POOL, sender: ROUTER, amount0: -1n, amount1: 1n, sqrtPriceX96: 1n, liquidity: 1n, tick: 0, fee: 500 },
      { address: PM, blockNumber: 1, blockTimestamp: 1, transactionHash: TX, logIndex: 0 },
    );
    expect(decodeReports([swap])).toEqual([]);
  });
});

describe("decodeSwaps", () => {
  it("decodes signed amounts, the fee and the pool id", () => {
    const log = encodeSwapLog(
      {
        poolId: POOL,
        sender: ROUTER,
        amount0: -2_000_000_000_000_000_000n,
        amount1: 4_990_000_000_000_000_000_000n,
        sqrtPriceX96: 3_961_408_125_713_216_879_677_197_516_800n,
        liquidity: 20_000_000_000_000_000_000_000n,
        tick: 78_244,
        fee: 1_822,
      },
      { address: PM, blockNumber: 200, blockTimestamp: 1_790_001_000, transactionHash: TX, logIndex: 1 },
    );
    const [s] = decodeSwaps([log]);
    expect(s.poolId).toBe(POOL);
    expect(s.sender).toBe(ROUTER);
    expect(s.amount0).toBe(-2_000_000_000_000_000_000n);
    expect(s.amount1).toBe(4_990_000_000_000_000_000_000n);
    expect(s.fee).toBe(1_822);
    expect(s.tick).toBe(78_244);
    expect(s.liquidity).toBe(20_000_000_000_000_000_000_000n);
    expect(s.blockNumber).toBe(200);
    expect(s.blockTimestamp).toBe(1_790_001_000);
  });
});

describe("lastAtOrBefore", () => {
  it("finds the last row at or before a block", () => {
    const rows = [{ blockNumber: 10 }, { blockNumber: 20 }, { blockNumber: 20 }, { blockNumber: 30 }];
    expect(lastAtOrBefore(rows, 5)).toBe(-1);
    expect(lastAtOrBefore(rows, 10)).toBe(0);
    expect(lastAtOrBefore(rows, 25)).toBe(2);
    expect(lastAtOrBefore(rows, 99)).toBe(3);
  });
});

describe("decodeDeliveries", () => {
  it("decodes forwarder ReportProcessed logs, accepted or rejected", () => {
    const FWD = "0x15fC6ae953E024d975e77382eEeC56A9101f9F88";
    const mk = (result: boolean, logIndex: number) =>
      encodeReportProcessedLog(
        { receiver: "0x4000000000000000000000000000000000000004", workflowExecutionId: TX, reportId: "0x0001", result },
        { address: FWD, blockNumber: 300, blockTimestamp: 1_790_002_000, transactionHash: TX, logIndex },
      );
    const out = decodeDeliveries([mk(false, 2), mk(true, 1)]);
    expect(out.map((d) => d.accepted)).toEqual([true, false]);
    expect(out[1]).toMatchObject({ receiver: "0x4000000000000000000000000000000000000004", blockNumber: 300, txHash: TX });
  });
});
