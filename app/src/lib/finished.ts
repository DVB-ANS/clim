// The replay pair ran once (2026-10-06, 4 February's 12:00-16:00 UTC replayed at real speed) and then
// stopped. Its desk has been silent ever since, so its hook quotes the safe fee (blind mode). This module
// detects such a finished run from the logs alone, so the dashboard can show the run's history up to its
// end instead of stretching it to "now", and say plainly that the run is over.
import type { DeskReport, SwapRow } from "./decode";

/** A desk silent this long has stopped, not stalled (the hook goes blind after tauKillSec = 180 s). */
export const FINISHED_AFTER_SEC = 900;

export type FinishedRun = {
  firstSeq: number;
  lastSeq: number;
  /** Inclusion time of the first report. */
  startSec: number;
  /** Inclusion time of the last report. */
  lastReportSec: number;
  /** End of the run's on-chain activity: the later of the last report and the last swap on its pools. */
  endSec: number;
  endBlock: number;
};

/** The run's span when its desk has been silent for more than `silentSec`; undefined while it still reports. */
export function finishedRun(reports: DeskReport[], swaps: SwapRow[], nowSec: number, silentSec = FINISHED_AFTER_SEC): FinishedRun | undefined {
  const first = reports[0];
  const last = reports.at(-1);
  if (!first || !last || nowSec - last.blockTimestamp <= silentSec) return undefined;
  const lastSwap = swaps.at(-1);
  const swapLater = lastSwap !== undefined && lastSwap.blockNumber > last.blockNumber;
  return {
    firstSeq: first.seq,
    lastSeq: last.seq,
    startSec: first.blockTimestamp,
    lastReportSec: last.blockTimestamp,
    endSec: swapLater ? lastSwap.blockTimestamp : last.blockTimestamp,
    endBlock: swapLater ? lastSwap.blockNumber : last.blockNumber,
  };
}
