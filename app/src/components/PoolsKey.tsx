import type { ReactNode } from "react";
import { params } from "@/lib/config";
import { cn } from "@/lib/cn";
import { formatBp, pipsToBp } from "@/lib/units";

export type PoolsKeyVariant = "live" | "replay" | "mock";

/**
 * The key to pools V and S, under each app page's intro: what sets each pool's fee, and why comparing
 * them is fair. Two halves joined at a dotted seam, the language of the landing's PoolsVersus; a plain
 * band between hairlines, not a card. Pure (no hooks), so it renders in server pages and in Dashboard.
 */
export function PoolsKey({ variant, staticFeePips, className }: { variant: PoolsKeyVariant; staticFeePips: number; className?: string }) {
  const fee = formatBp(pipsToBp(staticFeePips), 2);
  const sText =
    variant === "replay"
      ? `Same pair and same depth as V, with a fixed fee of ${fee}: V's average fee over the same window in the lab's replay. On chain, V's own average came out a little higher (the P&L card gives it).`
      : variant === "mock"
        ? `Same pair and same depth as V, with a fixed fee of ${fee} (simulated data).`
        : `Same pair and same depth as V, with a fixed fee of ${fee}: the lab's forecast of V's average fee.`;
  return (
    <section aria-label="Pools V and S" className={cn("border-y border-line py-4", className)}>
      <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-[1fr_1px_1fr] sm:gap-x-6 sm:gap-y-0">
        <Half
          swatch={<span aria-hidden className="h-0.5 w-4 shrink-0 rounded-full bg-v" />}
          name="Pool V"
          tag="clim"
          text={`The clim hook sets its fee on every swap from the desk's latest σ: ${pipsToBp(params.feeMinPips)} bp in calm markets, a higher premium in a storm.`}
        />
        {/* the seam: dots in the axis grey, a 6 px strip centred on the 1 px column (or row, stacked) */}
        <div aria-hidden className="relative">
          <div className="dotted-divider absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 [--clim-line:var(--clim-muted)] sm:inset-x-auto sm:inset-y-0 sm:left-1/2 sm:top-0 sm:h-auto sm:w-1.5 sm:-translate-x-1/2 sm:translate-y-0" />
        </div>
        <Half
          swatch={<span aria-hidden className="w-4 shrink-0 border-t-2 border-dashed border-s" />}
          name="Pool S"
          tag="static twin"
          text={sText}
        />
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-fg-subtle">
        Both pools get the same retail swaps (every order goes to both) and the same arbitrage bot. At the same average fee, any gap
        between them comes from when V charges more: in a storm, or in a safe mode while the desk is silent or the venues disagree.
      </p>
    </section>
  );
}

function Half({ swatch, name, tag, text }: { swatch: ReactNode; name: string; tag: string; text: string }) {
  return (
    <div className="min-w-0 max-w-[52ch]">
      <p className="flex items-center gap-2.5 text-[15px] leading-snug">
        {swatch}
        <span>
          <span className="font-medium text-fg">{name}</span>
          <span className="text-fg-subtle"> · {tag}</span>
        </span>
      </p>
      <p className="mt-1 pl-[26px] text-sm leading-relaxed text-fg-muted">{text}</p>
    </div>
  );
}
