import type { Metadata } from "next";
import { LiquidityBoard } from "@/components/LiquidityBoard";
import { PoolsKey } from "@/components/PoolsKey";
import { dataSource, deployments } from "@/lib/config";
import { MOCK_STATIC_FEE_PIPS } from "@/lib/mock";

export const metadata: Metadata = { title: "Liquidity" };

export default function LpPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[40px] font-normal leading-[1.1] tracking-[-0.02em]">Liquidity: be the LP the storm insurance protects</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-fg-muted">
          Get test tokens, add full-range liquidity to pool V or pool S, and follow your position: its value, the fees it earned, and what
          the same liquidity would have made in the other pool.
        </p>
      </div>
      <PoolsKey
        variant={dataSource("live") === "mock" ? "mock" : "live"}
        staticFeePips={deployments.pairs.live?.S.key.fee ?? MOCK_STATIC_FEE_PIPS}
      />
      <LiquidityBoard />
    </div>
  );
}
