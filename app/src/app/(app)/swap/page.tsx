import type { Metadata } from "next";
import Link from "next/link";
import { TrySteps } from "@/components/guide/TrySteps";
import { PoolsKey } from "@/components/PoolsKey";
import { SwapForm } from "@/components/SwapForm";
import { linkCls } from "@/components/ui";
import { livePair } from "@/lib/config";

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
      <PoolsKey variant="live" staticFeePips={livePair.S.key.fee} />
      <SwapForm />
      <section id="try" aria-labelledby="try-title" className="rounded-lg bg-wash p-4 sm:p-5">
        <h2 id="try-title" className="font-display text-lg">
          Try it with a wallet
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          You need a wallet on Ethereum Sepolia. No wallet?{" "}
          <Link className={linkCls} href="/app#verify">
            Check everything on the dashboard
          </Link>
          , no wallet needed.
        </p>
        <TrySteps layout="row" here="swap" />
      </section>
    </div>
  );
}
