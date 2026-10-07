import type { Metadata } from "next";
import { BacktestTable } from "@/components/BacktestTable";
import { ReplayPanel } from "@/components/ReplayPanel";
import { FixtureNote, Panel } from "@/components/ui";
import { labReplay, labSummary } from "@/lib/labData";
import { roundPct, signedPct, usdPerMillion } from "@/lib/labText";

export const metadata: Metadata = { title: "Lab" };

export default function LabPage() {
  const s = labSummary;
  const [lo, hi] = s.lpGain.fullRangeEthPctPerYear;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[40px] font-normal leading-[1.1] tracking-[-0.02em]">Lab: real data, both comparisons</h1>
      <Panel
        title="Backtest summary"
        subtitle={`P* = ${(s.setting.pStar * 100).toFixed(0)}%, floor ${(s.setting.feeMinPips / 100).toFixed(0)} bp. Two fair comparisons against a static fee: at equal time-average fee, and at equal cost to traders (volume rises with volatility).`}
      >
        <FixtureNote show={s.fixture}>Synthetic fixture: the lab has not written lab/out/summary.json yet.</FixtureNote>
        <BacktestTable summary={s} />
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          <li>
            LP gain against a static 5 bp pool in the one-year backtest (1-minute data bridged to 12 s blocks), full-range ETH, across 5 retail
            scenarios: {signedPct(lo)} to {signedPct(hi)} of capital per year ({usdPerMillion(lo)} to {usdPerMillion(hi)} a year per $1M of
            liquidity). In the main scenario (an aggregator routes retail between clim and a static 5 bp pool four times deeper), about{" "}
            {roundPct(s.lpGain.shareFromTop5WeeksPct)} of the gain is earned in the five most turbulent weeks; the same scenario on an
            asset twice as volatile (the same year with every return doubled) gains {signedPct(s.lpGain.volatileAssetPctPerYearMax)} a year.
          </li>
          <li>The model predicts how often arbitrage happens; it underestimates how much it takes: observed ARB/LVR is {s.modelSeverityRatio[0].toFixed(2)} to {s.modelSeverityRatio[1].toFixed(2)} times the model.</li>
          <li>A volatility computed inside the pool gets {roundPct(s.inPoolVolGainSharePct[0])} to {roundPct(s.inPoolVolGainSharePct[1])} of the same gain{s.inPoolVolGainSharePct[1] > 100 ? " (above 100%: it did slightly better in one sample)" : ""}: Chainlink CRE is here for robustness (four venues must agree), not accuracy.</li>
        </ul>
        <p className="mt-2 text-xs text-fg-subtle">Raw data: <a className="underline" href="/data/lab/summary.json">/data/lab/summary.json</a></p>
      </Panel>
      <ReplayPanel replay={labReplay} summary={s} />
    </div>
  );
}
