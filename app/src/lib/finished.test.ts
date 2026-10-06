import { describe, expect, it } from "vitest";
import type { DeskReport, SwapRow } from "./decode";
import { FINISHED_AFTER_SEC, finishedRun } from "./finished";

const report = (seq: number, blockNumber: number, blockTimestamp: number) => ({ seq, blockNumber, blockTimestamp }) as DeskReport;
const swap = (blockNumber: number, blockTimestamp: number) => ({ blockNumber, blockTimestamp }) as SwapRow;

describe("a finished run (the replay pair after its last report)", () => {
  // the replay pair on Sepolia: reports #1 to #459 from 17:02:00 to 20:58:48 UTC, last swap 21:04:00 UTC
  const reports = [report(1, 11_857_193, 1_791_306_120), report(459, 11_858_358, 1_791_320_328)];
  const swaps = [swap(11_857_194, 1_791_306_132), swap(11_858_382, 1_791_320_640)];

  it("is still running while the desk reports", () => {
    expect(finishedRun(reports, swaps, 1_791_320_328 + 60)).toBeUndefined();
    expect(finishedRun(reports, swaps, 1_791_320_328 + FINISHED_AFTER_SEC)).toBeUndefined();
    expect(finishedRun([], swaps, 1_791_400_000)).toBeUndefined();
  });

  it("ends at its last on-chain activity once the desk has been silent long enough", () => {
    expect(finishedRun(reports, swaps, 1_791_400_000)).toEqual({
      firstSeq: 1,
      lastSeq: 459,
      startSec: 1_791_306_120,
      lastReportSec: 1_791_320_328,
      endSec: 1_791_320_640,
      endBlock: 11_858_382,
    });
  });

  it("ends at the last report when no swap came after it", () => {
    const r = finishedRun(reports, swaps.slice(0, 1), 1_791_400_000);
    expect(r?.endSec).toBe(1_791_320_328);
    expect(r?.endBlock).toBe(11_858_358);
  });
});
