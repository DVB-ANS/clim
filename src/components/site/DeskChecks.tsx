import type { CheckLevel, DeskCheck, DeskStatus } from "@/lib/desk";

const PILL: Record<CheckLevel, { text: string; cls: string; dot: string }> = {
  ok: { text: "On track", cls: "bg-normal/12 text-normal", dot: "bg-normal" },
  watch: { text: "Watch closely", cls: "bg-degraded/15 text-degraded", dot: "bg-degraded" },
  high: { text: "Safe mode · ≥ 30 bp", cls: "bg-blind/12 text-blind", dot: "bg-blind" },
};

const BAR: Record<DeskStatus, string> = { normal: "bg-line", degraded: "bg-degraded", blind: "bg-blind" };

/** The desk's status bars: calm reads quiet, only the degraded and blind reports carry colour. */
export function StatusBars({ statuses, className = "" }: { statuses: DeskStatus[]; className?: string }) {
  const blind = statuses.filter((s) => s === "blind").length;
  const degraded = statuses.filter((s) => s === "degraded").length;
  return (
    <div className={className}>
      <div className="flex h-9 gap-[3px]" role="img" aria-label={`Last ${statuses.length} reports: ${degraded} degraded, ${blind} after a blind gap`}>
        {statuses.map((s, i) => (
          <span key={i} className={`flex-1 rounded-[2px] ${BAR[s]}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-fg-subtle">
        <span>last {statuses.length} reports · one every 30 s</span>
        <span>
          <span className="text-degraded">▲</span> degraded {degraded} · <span className="text-blind">■</span> blind {blind}
        </span>
      </div>
    </div>
  );
}

/** Ventriloc's "priorities" card, for the desk: the hook's checks now, each with its state. */
export function DeskChecks({ checks, statuses, simulated }: { checks: DeskCheck[]; statuses: DeskStatus[]; simulated: boolean }) {
  return (
    <div className="rounded-lg bg-surface p-5 shadow-[0_0_0_1px_var(--clim-line)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-medium">Desk checks</p>
          <p className="text-xs text-fg-subtle">As the hook sees the desk now{simulated ? " · simulated" : ""}</p>
        </div>
        <span className="rounded-full bg-normal/12 px-2 py-0.5 text-xs text-normal">● Live</span>
      </div>
      <ul className="mt-4 space-y-2.5">
        {checks.map((c) => (
          <li key={c.id} className={`flex items-center gap-3 rounded-md px-3.5 py-3 ${c.level === "ok" ? "shadow-[0_0_0_1px_var(--clim-line)]" : "bg-blind/5 shadow-[0_0_0_1px_var(--clim-blind)]"}`}>
            <span className={`size-2 shrink-0 rounded-full ${PILL[c.level].dot}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{c.label}</span>
              <span className="block text-xs text-fg-subtle">{c.detail}</span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${PILL[c.level].cls}`}>{PILL[c.level].text}</span>
          </li>
        ))}
      </ul>
      <StatusBars statuses={statuses} className="mt-5" />
    </div>
  );
}
