"use client";

import { type ReactNode, useState } from "react";

/**
 * A closed disclosure whose content mounts only once it is opened, so the heavy panels and their chain
 * reads stay out of the first view (/app's full dashboard, /replay's on-chain replay). A plus that turns
 * into a minus marks it as a control; the native triangle is hidden.
 */
export function LazyDetails({ id, title, summary, children }: { id: string; title: string; summary?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details id={id} className="group rounded-lg border border-line bg-surface" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-5 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-display text-lg tracking-tight">{title}</span>
          {summary ? <span className="mt-0.5 block text-sm text-fg-subtle">{summary}</span> : null}
        </span>
        <span aria-hidden className="relative size-4 shrink-0">
          <span className="absolute left-1/2 top-1/2 h-[1.5px] w-4 -translate-x-1/2 -translate-y-1/2 rounded-[1px] bg-current" />
          <span className="absolute left-1/2 top-1/2 h-[1.5px] w-4 -translate-x-1/2 -translate-y-1/2 rotate-90 rounded-[1px] bg-current transition-[rotate] duration-200 group-open:rotate-180 motion-reduce:transition-none" />
        </span>
      </summary>
      {open ? <div className="space-y-4 border-t border-line p-3 sm:p-5">{children}</div> : null}
    </details>
  );
}
