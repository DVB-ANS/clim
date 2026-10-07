import type { ReactNode } from "react";
import type { FeeMode } from "@/lib/feeMath";
import { MODE_STYLE } from "@/lib/theme";

/** A data card: white, 20 px corners, hairline border, the title in the display face at weight 400. */
export function Panel({ title, subtitle, children, className = "", id }: { title: string; subtitle?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`rounded-lg border border-line bg-surface p-6 ${className}`}>
      <h2 className="font-display text-lg font-normal tracking-tight text-fg">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-fg-subtle">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="text-[13px] text-fg-subtle">{label}</div>
      <div className="mt-1 font-display text-2xl font-medium tracking-tight tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-fg-subtle">{hint}</div> : null}
    </div>
  );
}

/**
 * The app's data tables: small header in the caption grey, a hairline above every body row, tabular
 * figures. Give numeric cells (and their headers) className="num" to right-align them.
 */
export const dataTable =
  "w-full text-sm tabular-nums [&_th]:pb-2 [&_th]:text-xs [&_th]:font-normal [&_th]:text-fg-subtle [&_td]:border-t [&_td]:border-line [&_td]:py-2 [&_.num]:text-right";

/** The hook's mode as a tinted pill: icon, label and colour, never colour alone. */
export function ModeBadge({ mode }: { mode: FeeMode }) {
  const m = MODE_STYLE[mode];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-medium"
      style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 12%, transparent)` }}
    >
      <span aria-hidden>{m.icon}</span>
      {m.label}
    </span>
  );
}

export function FixtureNote({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return <p className="mb-3 rounded-md bg-notice-bg px-3 py-1.5 text-xs text-notice-fg">{children}</p>;
}

/** An Etherscan link to a transaction; at least 24 px tall, so stacked links stay apart as touch targets. */
export function TxLink({ hash, live, explorer = "https://sepolia.etherscan.io" }: { hash: string; live: boolean; explorer?: string }) {
  const short = `${hash.slice(0, 6)}…${hash.slice(-4)}`;
  if (!live) return <span className="font-mono text-xs">{short} (mock)</span>;
  return (
    <a className="inline-flex min-h-6 items-center font-mono text-xs text-link underline" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">
      {short}
    </a>
  );
}

export type ToggleOption<T extends string> = { value: T; label: ReactNode; ariaLabel?: string; title?: string; disabled?: boolean };

/** A segmented choice (pool, direction, time window): white pill on an Ash capsule. `value` may match no option. */
export function Toggle<T extends string>({ value, options, onChange, label }: { value: T | undefined; options: ToggleOption<T>[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="inline-flex gap-1 rounded-full bg-surface-2 p-1 text-sm" role={label ? "group" : undefined} aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          aria-label={o.ariaLabel}
          title={o.title}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3.5 py-1.5 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-fg-subtle disabled:opacity-60 ${o.value === value ? "bg-surface text-fg shadow-[0_0_0_1px_var(--clim-line)]" : "text-fg-muted enabled:hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
