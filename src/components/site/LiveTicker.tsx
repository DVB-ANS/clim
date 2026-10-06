export type TickerItem = { seq: number; sigmaPct: number; feeVBp: number; feeSBp: number; mode: string };

/** A slim band of the latest reports, scrolling; it stops under the pointer, on keyboard focus and with reduced motion. */
export function LiveTicker({ items, simulated }: { items: TickerItem[]; simulated: boolean }) {
  if (items.length === 0) return null;
  // the row twice, the copy hidden from assistive tech, so the loop is seamless at -50%
  const row = (copy: boolean) =>
    items.map((r) => (
      <span key={`${copy ? "b" : "a"}-${r.seq}`} aria-hidden={copy || undefined} className="flex shrink-0 items-center gap-2 tabular-nums">
        <span className="text-fg">#{r.seq}</span>
        <span className="text-sigma-ink">σ {r.sigmaPct.toFixed(1)} %/yr</span>
        <span>
          V <span className="text-signal">{r.feeVBp.toFixed(2)} bp</span>
        </span>
        <span>S {r.feeSBp.toFixed(2)} bp</span>
        <span>{r.mode}</span>
        <span aria-hidden className="pl-4 text-line">
          ·
        </span>
      </span>
    ));
  return (
    <div className="border-y border-line bg-surface text-[13px] text-fg-subtle">
      <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-4">
        <span className="flex shrink-0 items-center gap-2 py-2.5 font-medium text-fg">
          <span className="size-2 rounded-full bg-pink" />
          Live{simulated ? " · simulated" : ""}
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]">
          <div className="flex w-max gap-6 py-2.5 animate-[clim-marquee_70s_linear_infinite] hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]">
            {row(false)}
            {row(true)}
          </div>
        </div>
      </div>
    </div>
  );
}
