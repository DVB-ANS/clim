import type { WeatherPoint } from "@/lib/series";
import { Wordmark } from "../Wordmark";
import { WeatherMini } from "./WeatherMini";

export type Kpi = { label: string; value: string; unit: string; delta?: { up: boolean; text: string }; note?: string };

/** Ventriloc's "Dashboard Overview" mock, filled with the desk's live numbers: the app, previewed. */
export function DashboardPreview({ kpis, points, staticFeeBp }: { kpis: Kpi[]; points: WeatherPoint[]; staticFeeBp: number }) {
  return (
    <div className="flex overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--clim-line)]">
      <aside className="hidden w-44 shrink-0 border-r border-line p-5 lg:block">
        <Wordmark className="text-[22px]" />
        <hr className="my-5 border-line" />
        <ul className="space-y-1 text-[13px]">
          {["Dashboard", "Swap", "Liquidity", "Replay", "Lab"].map((n, i) => (
            <li key={n} className={`rounded-full px-3 py-1.5 ${i === 0 ? "bg-surface-2 text-fg" : "text-fg-subtle"}`}>
              {n}
            </li>
          ))}
        </ul>
      </aside>
      <div className="min-w-0 flex-1 p-5">
        <p className="text-[15px] font-medium">Dashboard overview</p>
        <p className="text-xs text-fg-subtle">What the desk and the hook are doing right now.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-sm p-3 shadow-[0_0_0_1px_var(--clim-line)]">
              <p className="text-[11px] text-fg-subtle">{k.label}</p>
              <p className="mt-1 font-display text-[22px] font-medium leading-none tracking-[-0.02em] tabular-nums">
                {k.value} <span className="text-xs font-normal text-fg-subtle">{k.unit}</span>
              </p>
              {k.delta ? (
                <p className="mt-1.5 text-[11px] text-fg-subtle">
                  <span className={k.delta.up ? "text-signal" : "text-deep"}>{k.delta.up ? "↑" : "↓"} {k.delta.text}</span> vs 1 h ago
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] text-fg-subtle">{k.note}</p>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-sm p-3 shadow-[0_0_0_1px_var(--clim-line)]">
          <p className="text-[13px] font-medium">Weather</p>
          <p className="text-[11px] text-fg-subtle">σ above, V&apos;s fee against S below</p>
          <WeatherMini points={points} staticFeeBp={staticFeeBp} className="mt-2 h-auto w-full" />
        </div>
      </div>
    </div>
  );
}
