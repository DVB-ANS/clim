import type { Metadata } from "next";
import { Dashboard } from "@/components/Dashboard";
import { PoolsKey } from "@/components/PoolsKey";
import { ReplayPanel } from "@/components/ReplayPanel";
import { linkCls } from "@/components/ui";
import { deployments } from "@/lib/config";
import { labBand, labReplay, labSummary } from "@/lib/labData";
import { lessMore, replayWindowsSpread } from "@/lib/labText";

export const metadata: Metadata = { title: "Storm replay" };

export default function ReplayPage() {
  // the chosen window's result, then the spread over the storm's other windows, so the lead is not the best case alone
  const spread = replayWindowsSpread(labSummary.replay);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[40px] font-normal leading-[1.1] tracking-[-0.02em]">The 4 February 2026 storm, replayed</h1>
      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-fg-muted">
        Binance ETHUSDT, 12:00 to 16:00 UTC: the desk&apos;s 15-minute volatility ranges from {Math.round(labSummary.replay.sigmaMinPct)}% to{" "}
        {Math.round(labSummary.replay.sigmaMaxPct)}% a year. Below, the lab&apos;s replay of that window
        {deployments.pairs.replay ? ", then the same window replayed on-chain on Sepolia (replay desk flagged REPLAY, one price series served to every venue path)" : ""}.
      </p>
      <p className="max-w-3xl text-[15px] leading-relaxed">
        {`In the lab, at the same average fee, pool V lost ${lessMore(labSummary.replay.arbChangePct)} to arbitrage than pool S over this window, which we chose around the sharpest rise in volatility${spread ? `. ${spread}` : ""} (`}
        <a className={linkCls} href="#lab">
          section 1
        </a>
        ).
        {deployments.pairs.replay ? (
          <>
            {" "}
            On Sepolia, the replay desk ran the same window again, report by report, while our bots traded both pools;{" "}
            <a className={linkCls} href="#pnl">
              the profit and loss card
            </a>{" "}
            in{" "}
            <a className={linkCls} href="#onchain">
              section 2
            </a>{" "}
            gives that result.
          </>
        ) : null}
      </p>
      <PoolsKey variant="replay" staticFeePips={deployments.pairs.replay?.S.key.fee ?? Math.round(labSummary.replay.feeSBp * 100)} />
      <section id="lab" aria-labelledby="lab-title" className="space-y-3 pt-2">
        <h2 id="lab-title" className="font-display text-[26px] tracking-[-0.02em]">
          1. In the lab: the real 4 February data
        </h2>
        <p className="text-sm text-fg-muted">An off-chain backtest of the same fee rule on Binance ETHUSDT.</p>
        <ReplayPanel replay={labReplay} summary={labSummary} level={3} />
      </section>
      {deployments.pairs.replay ? (
        <section id="onchain" aria-labelledby="onchain-title" className="space-y-3 pt-4">
          <h2 id="onchain-title" className="font-display text-[26px] tracking-[-0.02em]">
            2. On Sepolia: the same window, replayed on chain
          </h2>
          <p className="text-sm text-fg-muted">Read from the replay desk&apos;s and pools&apos; logs. Each card links its transactions on Etherscan.</p>
          <Dashboard band={labBand} initialPair="replay" keyShownAbove="replay" lockPair panelLevel={3} />
        </section>
      ) : null}
    </div>
  );
}
