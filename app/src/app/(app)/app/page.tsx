import type { Metadata } from "next";
import { ContractsPanel } from "@/components/ContractsPanel";
import { Dashboard } from "@/components/Dashboard";
import { params } from "@/lib/config";
import { labBand } from "@/lib/labData";
import { pipsToBp } from "@/lib/units";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[40px] font-normal leading-[1.1] tracking-[-0.02em]">The desk, live</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-fg-muted">
          The LP fee follows the market&apos;s weather: {pipsToBp(params.feeMinPips)} bp when calm, a premium that rises with volatility in a storm.
          Volatility comes from a Chainlink CRE risk desk; the fee is applied by a Uniswap v4 hook on every swap.
        </p>
      </div>
      <Dashboard band={labBand} />
      <ContractsPanel />
    </div>
  );
}
