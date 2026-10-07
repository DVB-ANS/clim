"use client";

import Link from "next/link";
import { type CSSProperties, type FocusEvent, type ReactNode, useRef } from "react";
import { LaunchLink } from "./LaunchLink";

/**
 * Ventriloc's stacked service panel: a gray card with the signature asymmetric corner, the step
 * number and the title behind a blue square, a navy subtitle, the text and a link; the live mock on
 * the right. Each panel sticks a little lower than the previous one, so they pile up as the page
 * scrolls (globals.css, .stack-panel, from 1280 x 820 where a panel fits the window). A panel the next
 * one covers cannot be scrolled into view by the browser, so keyboard focus landing in it (tested a
 * frame after the browser's smooth scroll starts, and only while the panels stick) brings its sentinel
 * (an unstuck marker just above it) back to the top.
 */
export function ServiceSection({ id, index, step, title, subtitle, link, children, mock }: {
  id: string;
  index: number;
  step?: string;
  title: string;
  subtitle: string;
  link: { href: string; label: string };
  children: ReactNode;
  mock: ReactNode;
}) {
  const top = 84 + index * 14;
  const sentinel = useRef<HTMLDivElement>(null);
  const onFocus = (e: FocusEvent<HTMLElement>) => {
    const panel = e.currentTarget;
    const target = e.target;
    // the panels stick only from 1280 x 820 (globals.css); below that the browser's own scroll is right
    if (getComputedStyle(panel).position !== "sticky") return;
    // keyboard focus scrolls smoothly (html { scroll-behavior: smooth }), so test a frame later: a target
    // still off screen, or under the next panel, brings the sentinel back to the top
    requestAnimationFrame(() => {
      const r = target.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 8));
      if (!hit || !panel.contains(hit)) sentinel.current?.scrollIntoView({ block: "start" });
    });
  };
  // the way into the app opens it from the link, like "Launch app" (LaunchLink)
  const linkClass = "mt-6 ml-5 inline-flex items-center gap-1.5 text-[15px] font-medium text-fg hover:text-signal";
  const linkBody = (
    <>
      {link.label}
      <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
        <path d="M3 1.5L6.5 5 3 8.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </svg>
    </>
  );
  return (
    <>
      <div ref={sentinel} aria-hidden className="m-0! h-0" style={{ scrollMarginTop: `${top}px` }} />
      <section
        id={id}
        aria-labelledby={`${id}-title`}
        data-stack={index}
        onFocus={onFocus}
        className="anchor stack-panel grid gap-10 rounded-[6px_0_0_0] bg-surface-2 p-6 md:p-12 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)] xl:p-[56px]"
        style={{ "--stack-top": `${top}px` } as CSSProperties}
      >
        <div>
          <h3 id={`${id}-title`} className="flex items-center gap-3 font-display text-[28px] font-normal leading-tight tracking-[-0.02em]">
            <span aria-hidden className="size-2 shrink-0 bg-signal" />
            {step ? <span className="text-[15px] tabular-nums text-fg-muted">{step}</span> : null}
            {title}
          </h3>
          <p className="mt-2 pl-5 text-[13px] text-deep">{subtitle}</p>
          <div className="mt-5 space-y-3 pl-5 text-[16px] leading-relaxed text-fg-muted">{children}</div>
          {link.href === "/app" ? (
            <LaunchLink className={linkClass}>{linkBody}</LaunchLink>
          ) : (
            <Link href={link.href} className={linkClass}>
              {linkBody}
            </Link>
          )}
        </div>
        <div className="min-w-0 rounded-md bg-wash p-4 md:p-8">{mock}</div>
      </section>
    </>
  );
}
