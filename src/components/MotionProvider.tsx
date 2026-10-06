"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** motion's animations follow the visitor's reduced-motion setting: positional moves become instant. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
