"use client";

import { useRef } from "react";
import { contourSegments } from "@/lib/desk";
import { type CanvasTokens, canvasTokens } from "./canvasTokens";
import { useCanvasLoop } from "./useCanvasLoop";

/** Isobars of the market's weather: a low whose depth follows σ, drifting over a slow pressure field. */
export function IsobarCanvas({ sigmaPct, className = "" }: { sigmaPct: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const clock = useRef({ phase: 0, t: 0 });
  const tokens = useRef<CanvasTokens | null>(null);
  useCanvasLoop(ref, (g, w, h, dpr, now) => {
    if (!tokens.current && ref.current) tokens.current = canvasTokens(ref.current);
    const k = tokens.current;
    if (!k) return;
    const c = clock.current;
    if (c.t) c.phase += ((now - c.t) / 1000) * 0.12;
    c.t = now;
    const p = c.phase;
    g.clearRect(0, 0, w, h);
    const cols = 64, rows = Math.max(8, Math.round((cols * h) / w)), cw = w / cols, ch = h / rows;
    const depth = 1.4 + sigmaPct / 45;
    const lx = 0.6 + 0.05 * Math.sin(p * 0.7), ly = 0.5 + 0.06 * Math.cos(p * 0.9), aspect = w / h;
    const F = new Float32Array((cols + 1) * (rows + 1));
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const x = i / cols, y = j / rows, dx = (x - lx) * aspect, dy = y - ly;
        F[j * (cols + 1) + i] =
          -depth * Math.exp(-(dx * dx + dy * dy) / 0.1) + 0.5 * Math.sin(x * 3.1 + p) + 0.42 * Math.cos(y * 4.2 - p * 1.3) + 0.22 * Math.sin((x + y) * 6 + p * 1.7);
      }
    }
    g.lineWidth = dpr;
    for (let lv = -3.4; lv < 1.3; lv += 0.2) {
      const major = Math.abs(lv - Math.round(lv)) < 0.01;
      g.strokeStyle = major ? k.fg : k.brass;
      g.globalAlpha = major ? 0.42 : 0.34;
      g.beginPath();
      for (const [x1, y1, x2, y2] of contourSegments(F, cols, rows, lv, cw, ch)) {
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = k.ember;
    g.font = `500 ${22 * dpr}px ${k.display}`;
    g.fillText("L", lx * w - 7 * dpr, ly * h + 8 * dpr);
    g.fillStyle = k.fg;
    g.font = `500 ${12 * dpr}px ${k.ui}`;
    g.fillText(`σ ${sigmaPct.toFixed(0)}%`, lx * w + 14 * dpr, ly * h + 6 * dpr);
  });
  return <canvas ref={ref} aria-hidden className={className} />;
}
