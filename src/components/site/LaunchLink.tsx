"use client";

import Link from "next/link";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

/**
 * A real link to /app tagged with the "launch" transition type: the button blooms into the app
 * (globals.css, "Launch transition"). On click it hands its box and its rounding to that CSS; a
 * modified click opens a new tab as usual, and browsers without view transitions simply navigate.
 */
export function LaunchLink({ className, style, children, ...rest }: { className: string; style?: CSSProperties; children: ReactNode; "aria-label"?: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const radius = parseFloat(getComputedStyle(e.currentTarget).borderTopLeftRadius) || 0;
    const s = document.documentElement.style;
    s.setProperty("--launch-t", `${r.top}px`);
    s.setProperty("--launch-l", `${r.left}px`);
    s.setProperty("--launch-r", `${r.right}px`);
    s.setProperty("--launch-b", `${r.bottom}px`);
    s.setProperty("--launch-rad", `${Math.min(radius, r.height / 2)}px`);
    s.setProperty("--launch-cx", `${r.left + r.width / 2}px`);
    s.setProperty("--launch-cy", `${r.top + r.height / 2}px`);
  };
  return (
    <Link href="/app" transitionTypes={["launch"]} onClick={onClick} className={className} style={style} {...rest}>
      {children}
    </Link>
  );
}
