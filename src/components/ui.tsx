import type { ReactNode } from "react";
import type { FeeMode } from "@/lib/feeMath";
import { MODE_STYLE } from "@/lib/theme";

export function Panel({ title, subtitle, children, className = "" }: { title: string; subtitle?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-surface p-4 ${className}`}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">{title}</h2>
      {subtitle ? <p className="mt-1 text-xs text-fg-subtle">{subtitle}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-fg-subtle">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-fg-subtle">{hint}</div> : null}
    </div>
  );
}

export function ModeBadge({ mode }: { mode: FeeMode }) {
  const m = MODE_STYLE[mode];
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium">
      <span style={{ color: m.color }} aria-hidden>
        {m.icon}
      </span>
      {m.label}
    </span>
  );
}

export function FixtureNote({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return <p className="mb-2 rounded-sm bg-notice-bg px-2 py-1 text-xs text-notice-fg">{children}</p>;
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
