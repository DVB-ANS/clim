import { Dashboard } from "@/components/Dashboard";
import { ReplayPanel } from "@/components/ReplayPanel";
import { deployments } from "@/lib/config";
import { labBand, labReplay, labSummary } from "@/lib/labData";

export default function ReplayPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[40px] font-normal leading-[1.1] tracking-[-0.02em]">The 4 February 2026 storm, replayed</h1>
      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-fg-muted">
        Binance ETHUSDT, 12:00 to 16:00 UTC: hourly volatility goes from 74% to 225%. Below, the lab&apos;s replay of that window
        {deployments.pairs.replay ? ", then the same window replayed on-chain on Sepolia (replay desk flagged REPLAY, one price series served to every venue path)" : ""}.
      </p>
      <ReplayPanel replay={labReplay} summary={labSummary} />
      {deployments.pairs.replay ? <Dashboard band={labBand} initialPair="replay" /> : null}
    </div>
  );
}
