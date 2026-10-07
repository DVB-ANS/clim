import type { Metadata } from "next";
import Link from "next/link";
import { Dashboard } from "@/components/Dashboard";
import { LatestStorm } from "@/components/LatestStorm";
import { PoolsKey } from "@/components/PoolsKey";
import { LazyDetails } from "@/components/LazyDetails";
import { ExtLink, linkCls } from "@/components/ui";
import { deployments, params } from "@/lib/config";
import { etherscanAddress } from "@/lib/contracts";
import { labBand, labSummary } from "@/lib/labData";
import { lessMore, replayWindowsSpread } from "@/lib/labText";
import { pipsToBp, shortHash } from "@/lib/units";

export const metadata: Metadata = { title: "Storms: the latest live, and a replay" };

export default function ReplayPage() {
  // the chosen window's result, then the spread over the storm's other windows, so the lead is not the best case alone
  const spread = replayWindowsSpread(labSummary.replay);
  const live = deployments.pairs.live;
  return (
    <div className="space-y-4">
      {/* the latest real storm first: the live desk, not a replay; its numbers are read from the logs in LatestStorm */}
      <section id="latest" aria-labelledby="latest-title" className="space-y-4 pb-8">
        <h1 id="latest-title" className="font-display text-[40px] font-normal leading-[1.1] tracking-[-0.02em]">
          7 October 2026: a real storm, priced live
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-fg-muted">
          ETH&apos;s volatility jumped, and pool V&apos;s fee rose with it, swap by swap, then fell back to its {pipsToBp(params.feeMinPips)} bp
          floor, while pool S kept its fixed fee. Not a replay: this is the live clim desk on Sepolia, fed by our Chainlink CRE workflow running
          in CRE&apos;s simulator.
        </p>
        {live ? (
          <p className="text-xs text-fg-muted">
            Live pair on Sepolia: RiskDesk <ExtLink href={etherscanAddress(live.riskDesk)}>{shortHash(live.riskDesk)}</ExtLink>, ClimHook{" "}
            <ExtLink href={etherscanAddress(live.hook)}>{shortHash(live.hook)}</ExtLink>
          </p>
        ) : null}
        <LatestStorm />
      </section>
      <section id="earlier" aria-labelledby="earlier-title" className="space-y-4 border-t border-line pt-10">
        <h2 id="earlier-title" className="font-display text-[26px] tracking-[-0.02em]">
          Earlier: the 4 February 2026 storm, replayed
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-fg-muted">
          {`Binance ETHUSDT, 12:00 to 16:00 UTC, with the desk's 15-minute volatility between ${Math.round(labSummary.replay.sigmaMinPct)}% and ${Math.round(labSummary.replay.sigmaMaxPct)}% a year. In the lab, at the same average fee, pool V lost ${lessMore(labSummary.replay.arbChangePct)} to arbitrage than pool S over this window, which we chose around the sharpest rise in volatility${spread ? `. ${spread}` : ""}. `}
          <Link className={linkCls} href="/lab">
            The lab&apos;s replay
          </Link>
          .
        </p>
        {deployments.pairs.replay ? (
          <LazyDetails
            id="onchain"
            title="The same window, replayed on Sepolia"
            summary="A replay desk, flagged REPLAY, ran it again report by report on chain while our bots traded both pools. Finished on 6 October."
          >
            <PoolsKey variant="replay" staticFeePips={deployments.pairs.replay.S.key.fee} />
            <Dashboard band={labBand} initialPair="replay" keyShownAbove="replay" lockPair panelLevel={3} />
          </LazyDetails>
        ) : null}
      </section>
    </div>
  );
}
