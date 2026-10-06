import { SwapForm } from "@/components/SwapForm";

export default function SwapPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[40px] font-normal leading-[1.1] tracking-[-0.02em]">Swap: see the fee before you pay it</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-fg-muted">
          Pool V charges the clim fee, computed inside every swap by the hook from the latest Chainlink CRE report; pool S charges
          a fixed fee. Pick a pool, read the weather that sets your fee, swap, then check the fee you actually paid in the Swap event.
        </p>
      </div>
      <SwapForm />
    </div>
  );
}
