import type { Metadata } from "next";
import { ContractsPanel } from "@/components/ContractsPanel";
import { Dashboard } from "@/components/Dashboard";
import { LiveDesk } from "@/components/guide/LiveDesk";
import { LazyDetails } from "@/components/LazyDetails";
import { labBand } from "@/lib/labData";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-[40px] font-normal leading-[1.1] tracking-[-0.02em]">The desk, live</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-fg-muted">
          A Chainlink CRE workflow publishes ETH volatility on Sepolia every 30 s. A Uniswap v4 hook turns it into pool V&apos;s fee on every
          swap; pool S, its twin, keeps a fixed fee. See it, check it on Etherscan, or try it.
        </p>
      </div>
      <LiveDesk />
      <LazyDetails
        id="details"
        title="Full dashboard"
        summary="Every panel: the desk's report details, the model check, LP profit and loss, the safety log, every swap, the contracts, and the finished 4 February replay pair."
      >
        <Dashboard band={labBand} />
        <ContractsPanel />
      </LazyDetails>
    </div>
  );
}
