// The desk as the landing page shows it: one status per report (status bars), the hook's health
// checks right now, and the isobar contours of the storm map. Pure functions, no React.
import type { DeskReport } from "./decode";
import { DISP_MAX_BP } from "./series";
import { formatAge } from "./units";

export type DeskStatus = "normal" | "degraded" | "blind";

/** One status per report: blind when it ends a silence longer than tauKill, degraded when the venues disagree. */
export function reportStatuses(reports: Pick<DeskReport, "tObs" | "dispBp">[], tauKillSec: number): DeskStatus[] {
  return reports.map((r, i) => {
    if (i > 0 && r.tObs - reports[i - 1].tObs > tauKillSec) return "blind";
    return r.dispBp > DISP_MAX_BP ? "degraded" : "normal";
  });
}

export type CheckLevel = "ok" | "watch" | "high";
export type DeskCheck = { id: "agreement" | "heartbeat" | "sources"; label: string; detail: string; level: CheckLevel };

/** Three reports missed: late, but the hook still trusts the last one until tauKill. */
const LATE_SEC = 90;

/** The hook's three health checks, as it sees the desk now. */
export function deskChecks(last: Pick<DeskReport, "tObs" | "dispBp" | "nSources">, nowSec: number, tauKillSec: number): DeskCheck[] {
  const age = Math.max(0, nowSec - last.tObs);
  return [
    {
      id: "agreement",
      label: "Venues agree",
      detail: `dispersion ${last.dispBp} bp, limit ${DISP_MAX_BP} bp`,
      level: last.dispBp > DISP_MAX_BP ? "high" : "ok",
    },
    {
      id: "heartbeat",
      label: "Desk heartbeat",
      detail: `last report ${formatAge(age)} ago, blind after ${tauKillSec} s`,
      level: age > tauKillSec ? "high" : age > LATE_SEC ? "watch" : "ok",
    },
    {
      id: "sources",
      label: "Sources",
      detail: `${last.nSources} of 4 venues, quorum 3`,
      level: last.nSources < 3 ? "high" : last.nSources < 4 ? "watch" : "ok",
    },
  ];
}

// Marching squares: edges 0 top, 1 right, 2 bottom, 3 left; corner bits a (top-left) 1, b (top-right) 2,
// c (bottom-right) 4, d (bottom-left) 8. Saddles 5 and 10 take one fixed resolution.
const CASES: Record<number, [number, number][]> = {
  1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]],
  8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]],
};

/**
 * Contour segments [x1, y1, x2, y2] of `field` at `level`. The field holds (cols + 1) x (rows + 1)
 * samples, row by row; each cell is cw x ch pixels.
 */
export function contourSegments(field: ArrayLike<number>, cols: number, rows: number, level: number, cw: number, ch: number): number[][] {
  const out: number[][] = [];
  const at = (i: number, j: number) => field[j * (cols + 1) + i];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      const idx = (a > level ? 1 : 0) | (b > level ? 2 : 0) | (c > level ? 4 : 0) | (d > level ? 8 : 0);
      const pairs = CASES[idx];
      if (!pairs) continue;
      const x = i * cw, y = j * ch;
      const edge = [
        [x + cw * ((level - a) / (b - a)), y],
        [x + cw, y + ch * ((level - b) / (c - b))],
        [x + cw * ((level - d) / (c - d)), y + ch],
        [x, y + ch * ((level - a) / (d - a))],
      ];
      for (const [p, q] of pairs) out.push([edge[p][0], edge[p][1], edge[q][0], edge[q][1]]);
    }
  }
  return out;
}

export type StormParticle = { r: number; arm: number; jitter: number };

/** Deterministic dots of a four-armed storm (mulberry32), denser towards the eye. */
export function stormParticles(n: number, seed: number): StormParticle[] {
  let s = seed | 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: n }, () => ({ r: Math.pow(rnd(), 1.3), arm: Math.floor(rnd() * 4), jitter: rnd() - 0.5 }));
}

const EYE = 0.06;

/**
 * Positions [x, y, radius] in the unit disc (y squashed to 0.9): log-spiral arms turned by `rotation`,
 * spread wider by `spread` (1 calm, 2 a storm). The inner bands turn faster, like a real vortex.
 */
export function stormPositions(particles: StormParticle[], rotation: number, spread: number): [number, number, number][] {
  return particles.map((p) => {
    const r = EYE + (1 - EYE) * p.r;
    const th = 2.3 * Math.log(r / EYE) + (p.arm * Math.PI) / 2 + p.jitter * (0.3 + 1.2 * r) * spread - rotation * (1.3 - r);
    return [r * Math.cos(th), r * Math.sin(th) * 0.9, r];
  });
}
