"use client";

import type { ReactNode } from "react";
import { LOGOS } from "./site/logos";

/** tETH wears Ethereum's mark, tUSD a dollar sign: the two test tokens of the pair (a mark, next to the symbol). */
export function TokenIcon({ symbol, className = "size-6" }: { symbol: string; className?: string }) {
  if (symbol === "tETH") {
    const eth = LOGOS.Ethereum;
    return (
      <span className={`grid shrink-0 place-items-center rounded-full bg-fg text-surface ${className}`}>
        <svg viewBox={eth.viewBox} className="size-[70%]" aria-hidden dangerouslySetInnerHTML={{ __html: eth.body }} />
      </span>
    );
  }
  return <span className={`grid shrink-0 place-items-center rounded-full bg-signal text-[13px] font-semibold text-accent-fg ${className}`} aria-hidden>$</span>;
}

export function TokenPill({ symbol }: { symbol: string }) {
  return (
    <span className="flex shrink-0 items-center gap-2 rounded-full bg-surface py-1.5 pl-1.5 pr-3.5 text-[15px] font-medium shadow-[0_0_0_1px_var(--clim-line)]">
      <TokenIcon symbol={symbol} />
      {symbol}
    </span>
  );
}

/** A DEX amount field: a label, a large number, the token, and a hint line (value, balance). */
export function AmountBox({ id, label, value, onChange, symbol, hint, error }: {
  id: string;
  label: string;
  value: string;
  onChange?: (v: string) => void;
  symbol: string;
  hint?: ReactNode;
  error?: string | null;
}) {
  return (
    <div className="rounded-lg bg-surface-2 p-4 transition-shadow focus-within:shadow-[0_0_0_1px_var(--clim-signal)]">
      <label htmlFor={id} className="text-sm text-fg-subtle">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-3">
        <input
          id={id}
          value={value}
          readOnly={!onChange}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          className="min-w-0 flex-1 bg-transparent font-display text-[34px] leading-tight tracking-[-0.02em] tabular-nums outline-none placeholder:text-fg-subtle read-only:text-fg-muted"
        />
        <TokenPill symbol={symbol} />
      </div>
      <div className="mt-1 min-h-5 text-sm">{error ? <span className="text-danger">{error}</span> : <span className="text-fg-subtle">{hint}</span>}</div>
    </div>
  );
}

/** The arrow between the two boxes: flips the direction of the trade. */
export function FlipButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div className="relative z-10 -my-4 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="grid size-10 place-items-center rounded-md border-4 border-surface bg-surface-2 text-fg transition-transform duration-300 hover:rotate-180"
      >
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
          <path d="M8 2.5v11M3.5 9 8 13.5 12.5 9" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

export type PoolOption<T extends string> = { value: T; title: string; subtitle: string; fee: string; badge?: ReactNode };

/** Pool choice as two cards: name, what sets its fee, the fee now. */
export function PoolCards<T extends string>({ value, options, onChange }: { value: T; options: PoolOption<T>[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label="Pool" className="grid grid-cols-2 gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`rounded-md p-3 text-left transition-[box-shadow,background-color] duration-200 ${on ? "bg-surface shadow-[0_0_0_1.5px_var(--clim-signal)]" : "bg-surface-2 hover:bg-surface"}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{o.title}</span>
              <span aria-hidden className={`size-2 rounded-full ${on ? "bg-signal" : "bg-line"}`} />
            </span>
            <span className="mt-0.5 block text-xs text-fg-subtle">{o.subtitle}</span>
            <span className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-display text-[22px] leading-none tracking-[-0.02em] tabular-nums">{o.fee}</span>
              {o.badge}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-fg-subtle">{label}</span>
      <span className="text-right text-fg">{children}</span>
    </div>
  );
}
