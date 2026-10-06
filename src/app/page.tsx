import { Dashboard } from "@/components/Dashboard";
import { params } from "@/lib/config";
import { labBand } from "@/lib/labData";
import { pipsToBp } from "@/lib/units";

export default function Home() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Storm insurance for Uniswap v4 LPs</h1>
        <p className="text-sm text-fg-muted">
          The LP fee follows the market&apos;s weather: {pipsToBp(params.feeMinPips)} bp when calm, a toll that rises with volatility in a storm.
          Volatility comes from a Chainlink CRE risk desk; the fee is applied by a Uniswap v4 hook on every swap.
        </p>
      </div>
      <Dashboard band={labBand} />
    </div>
  );
}
