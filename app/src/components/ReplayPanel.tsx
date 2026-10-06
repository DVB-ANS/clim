import type { LabReplay, LabSummary } from "@/lib/lab";
import { ReplayCharts } from "./ReplayCharts";
import { FixtureNote, Panel, Stat } from "./ui";

const sgn = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;

/** The lab's Feb 4 2026 replay: the storm, V's fee leaving S's, and the cumulative arbitrage losses. */
export function ReplayPanel({ replay, summary }: { replay: LabReplay; summary: LabSummary }) {
  const r = summary.replay;
  return (
    <Panel title={`Replay: ${r.window}`} subtitle={`${replay.window.startUtc} to ${replay.window.endUtc}, P* = ${(summary.setting.pStar * 100).toFixed(0)}%, S static at ${r.feeSBp.toFixed(1)} bp (V's time-average).`}>
      <FixtureNote show={replay.fixture || summary.fixture}>Synthetic fixture: the lab has not written lab/out/replay-2026-02-04.json and lab/out/summary.json yet.</FixtureNote>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="ARB, V vs S" value={sgn(r.arbChangePct)} hint={`range over windows: ${sgn(r.arbChangeRangePct[0])} to ${sgn(r.arbChangeRangePct[1])}`} />
        <Stat label="σ" value={`${r.sigmaMinPct.toFixed(0)}% to ${r.sigmaMaxPct.toFixed(0)}%`} />
        <Stat label="Fee V (S)" value={`${r.feeVMinBp.toFixed(1)} to ${r.feeVMaxBp.toFixed(1)} bp`} hint={`S: ${r.feeSBp.toFixed(1)} bp`} />
        <Stat label="P_trade V predicted / observed" value={`${r.pTradePredicted.toFixed(3)} / ${r.pTradeObserved.toFixed(3)}`} />
      </div>
      <ReplayCharts replay={replay} />
      <p className="mt-2 text-xs text-fg-subtle">Raw data: <a className="underline" href="/data/lab/replay-2026-02-04.json">/data/lab/replay-2026-02-04.json</a></p>
    </Panel>
  );
}
