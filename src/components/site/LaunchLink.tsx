"use client";

import Link from "next/link";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { type BootValues, useLaunch } from "./Launch";

/**
 * A real link to /app that plays the launch transition on a plain click (a modified click, or no
 * JavaScript, still just opens the app).
 */
export function LaunchLink({ boot, className, style, children, ...rest }: { boot: BootValues; className: string; style?: CSSProperties; children: ReactNode; "aria-label"?: string }) {
  const launch = useLaunch();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    launch(boot);
  };
  return (
    <Link href="/app" onClick={onClick} className={className} style={style} {...rest}>
      {children}
    </Link>
  );
}
