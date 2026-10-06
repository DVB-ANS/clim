"use client";

import type { CSSProperties, ReactNode } from "react";

type Entry = { name?: string | number; value?: unknown; color?: string; dataKey?: unknown };
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * The charts' tooltip: small and quiet, one row per curve listed in `only` (never the swap dots or
 * raw fields like t), so its size stays the same while the pointer moves and it glides from point
 * to point instead of popping in and out.
 */
export function ChartTooltip({ active, payload, label, only, labelFormat, valueFormat }: {
  active?: boolean;
  payload?: readonly Entry[];
  label?: unknown;
  only: string[];
  labelFormat?: (label: unknown) => ReactNode;
  valueFormat: (value: number, dataKey: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const rows = only
    .map((key) => payload.find((e) => String(e.dataKey) === key))
    .filter((e): e is Entry => !!e && (isNum(e.value) || (Array.isArray(e.value) && e.value.length === 2 && e.value.every(isNum))));
  if (!rows.length) return null;
  return (
    <div className="pointer-events-none min-w-40 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-[0_8px_24px_rgba(14,17,25,0.1)]">
      {labelFormat ? <p className="mb-1 text-fg-subtle">{labelFormat(label)}</p> : null}
      <ul className="space-y-0.5">
        {rows.map((e) => (
          <li key={String(e.dataKey)} className="flex items-center gap-2">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: e.color }} />
            <span className="text-fg-muted">{e.name}</span>
            <span className="ml-auto pl-4 font-medium tabular-nums text-fg">
              {Array.isArray(e.value)
                ? `${valueFormat(e.value[0], String(e.dataKey))} to ${valueFormat(e.value[1], String(e.dataKey))}`
                : valueFormat(e.value as number, String(e.dataKey))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tooltip settings shared by every chart: a hairline cursor, no pop-in animation, a short glide. */
export const TOOLTIP = {
  isAnimationActive: false,
  cursor: { stroke: "var(--clim-fg-subtle)", strokeWidth: 1, strokeDasharray: "3 3" },
  wrapperStyle: { transition: "transform 120ms ease-out", outline: "none" } as CSSProperties,
} as const;
