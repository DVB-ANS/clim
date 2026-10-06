import type { ReactNode } from "react";
import type { FeeMode } from "@/lib/feeMath";
import { MODE_STYLE } from "@/lib/theme";

/** A data card: white, 20 px corners, hairline border, the title in the display face at weight 400. */
export function Panel({ title, subtitle, children, className = "", id }: { title: string; subtitle?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`rounded-lg border border-line bg-surface p-6 ${id ? "scroll-mt-24" : ""} ${className}`}>
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

export function TxLink({ hash, live, explorer = "https://sepolia.etherscan.io" }: { hash: string; live: boolean; explorer?: string }) {
  const short = `${hash.slice(0, 6)}…${hash.slice(-4)}`;
  if (!live) return <span className="font-mono text-xs">{short} (mock)</span>;
  return (
    <a className="font-mono text-xs text-link underline" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">
      {short}
    </a>
  );
}

/** A segmented choice (pool, direction): white pill on an Ash capsule. */
export function Toggle<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex gap-1 rounded-full bg-surface-2 p-1 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3.5 py-1.5 ${o.value === value ? "bg-surface text-fg shadow-[0_0_0_1px_var(--clim-line)]" : "text-fg-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
