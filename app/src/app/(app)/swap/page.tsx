import type { Metadata } from "next";
import Link from "next/link";
import { SwapForm } from "@/components/SwapForm";
import { SwapSteps } from "@/components/SwapSteps";
import { linkCls } from "@/components/ui";

export const metadata: Metadata = { title: "Swap" };

export default function SwapPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[40px] font-normal leading-[1.1] tracking-[-0.02em]">Swap: see the fee before you pay it</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-fg-muted">
          Pool V&apos;s fee follows the weather; pool S, its twin on the same pair, keeps a fixed fee. Swap the same amount on each, then compare
          the fees you paid.
        </p>
      </div>
      {/* #try: the anchor ChainNote's "how to get some" and older links land on */}
      <section id="try" aria-label="Try it" className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
        <SwapSteps />
        <SwapForm />
      </section>
      <p className="text-sm text-fg-muted">
        Rather be the LP?{" "}
        <Link className={linkCls} href="/lp">
          Add liquidity to pool V or pool S
        </Link>{" "}
        and follow your position against the twin.
      </p>
    </div>
  );
}
