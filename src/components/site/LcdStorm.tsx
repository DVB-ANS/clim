"use client";

import { useRef } from "react";
import { stormParticles, stormPositions } from "@/lib/desk";
import { type CanvasTokens, canvasTokens } from "./canvasTokens";
import { useCanvasLoop } from "./useCanvasLoop";

const PARTICLES = stormParticles(1500, 20261006);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** The CL-1's dot-matrix screen: the storm in lit pixels, turning faster and wider as σ rises. */
export function LcdStorm({ sigmaPct, className = "" }: { sigmaPct: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const spin = useRef({ angle: 0, t: 0 });
  const tokens = useRef<CanvasTokens | null>(null);
  useCanvasLoop(ref, (g, w, h, dpr, now) => {
    if (!tokens.current && ref.current) tokens.current = canvasTokens(ref.current);
    const k = tokens.current;
    if (!k) return;
    const storm = clamp01((sigmaPct - 30) / 150);
    const s = spin.current;
    if (s.t) s.angle += ((now - s.t) / 1000) * (0.35 + 1.4 * storm);
    s.t = now;
    g.globalAlpha = 1;
    g.fillStyle = k.lcdBg;
    g.fillRect(0, 0, w, h);
    const cell = Math.max(4, Math.min(7, w / dpr / 60)) * dpr, cols = Math.floor(w / cell), rows = Math.floor(h / cell);
    const grid = new Float32Array(cols * rows);
    const R = Math.min(w, h) * (0.62 + 0.18 * storm), cx = w * 0.62, cy = h * 0.5;
    for (const [x, y, r] of stormPositions(PARTICLES, s.angle, 1 + storm)) {
      const gx = Math.floor((cx + x * R) / cell), gy = Math.floor((cy + y * R) / cell);
      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) grid[gy * cols + gx] += r < 0.2 ? 1.5 : 1;
    }
    // thresholds relative to the mean density inside the storm, so any screen size reads the same
    const mean = PARTICLES.length / Math.max(1, (Math.PI * R * R * 0.9) / (cell * cell));
    const dot = cell * 0.62, off = (cell - dot) / 2;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const v = grid[y * cols + x], dither = ((x * 3 + y * 5) % 4) / 4;
        const hot = v >= mean * (3.2 + dither), lit = v >= mean * (0.7 + 0.5 * dither);
        g.fillStyle = hot ? k.lcdHot : k.lcdLit;
        g.globalAlpha = hot ? 1 : lit ? 0.72 : 0.07;
        g.fillRect(x * cell + off, y * cell + off, dot, dot);
      }
    }
    g.globalAlpha = 1;
  });
  return <canvas ref={ref} aria-hidden className={className} />;
}
