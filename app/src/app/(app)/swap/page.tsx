import type { Metadata } from "next";
import { PoolsKey } from "@/components/PoolsKey";
import { SwapForm } from "@/components/SwapForm";
import { dataSource, deployments } from "@/lib/config";
import { MOCK_STATIC_FEE_PIPS } from "@/lib/mock";

export const metadata: Metadata = { title: "Swap" };

export default function SwapPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[40px] font-normal leading-[1.1] tracking-[-0.02em]">Swap: see the fee before you pay it</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-fg-muted">
          Two pools trade the same pair. Pick one, read the fee it will charge you, swap, then check the fee you actually paid in the Swap
          event.
        </p>
      </div>
      <PoolsKey
        variant={dataSource("live") === "mock" ? "mock" : "live"}
        staticFeePips={deployments.pairs.live?.S.key.fee ?? MOCK_STATIC_FEE_PIPS}
      />
      <SwapForm />
    </div>
  );
}
