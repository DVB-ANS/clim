import { describe, expect, it } from "vitest";
import { contourSegments, deskChecks, reportStatuses } from "./desk";

describe("reportStatuses (one status per report, for the desk's status bars)", () => {
  it("marks a report degraded when the venues disagree by more than 25 bp", () => {
    const rs = [{ tObs: 0, dispBp: 4 }, { tObs: 30, dispBp: 26 }, { tObs: 60, dispBp: 25 }];
    expect(reportStatuses(rs, 180)).toEqual(["normal", "degraded", "normal"]);
  });

  it("marks a report blind when it ends a silence longer than tauKill", () => {
    const rs = [{ tObs: 0, dispBp: 4 }, { tObs: 181, dispBp: 40 }, { tObs: 211, dispBp: 4 }];
    expect(reportStatuses(rs, 180)).toEqual(["normal", "blind", "normal"]);
  });
});

describe("deskChecks (the hook's health checks, now)", () => {
  const last = { tObs: 1_000, dispBp: 4, nSources: 4 };

  it("is all clear for an agreeing, fresh, complete desk", () => {
    expect(deskChecks(last, 1_040, 180).map((c) => c.level)).toEqual(["ok", "ok", "ok"]);
  });

  it("raises each check on its own threshold", () => {
    expect(deskChecks({ ...last, dispBp: 31 }, 1_040, 180)[0].level).toBe("high");
    expect(deskChecks(last, 1_100, 180)[1].level).toBe("watch");
    expect(deskChecks(last, 1_181, 180)[1].level).toBe("high");
    expect(deskChecks({ ...last, nSources: 3 }, 1_040, 180)[2].level).toBe("watch");
  });

  it("says why, in the desk's own units", () => {
    const [agreement, heartbeat, sources] = deskChecks(last, 1_066, 180);
    expect(agreement.detail).toBe("dispersion 4 bp, limit 25 bp");
    expect(heartbeat.detail).toBe("last report 1 min 06 s ago, blind after 180 s");
    expect(sources.detail).toBe("4 of 4 venues, quorum 3");
  });
});

describe("contourSegments (marching squares, for the isobar map)", () => {
  it("draws one segment across a cell whose single corner is above the level", () => {
    // 1 x 1 grid, corners top-left, top-right / bottom-left, bottom-right: only the top-left is high
    const field = new Float32Array([1, 0, 0, 0]);
    expect(contourSegments(field, 1, 1, 0.5, 10, 10)).toEqual([[0, 5, 5, 0]]);
  });

  it("draws nothing where the whole cell is on one side", () => {
    expect(contourSegments(new Float32Array([1, 1, 1, 1]), 1, 1, 0.5, 10, 10)).toEqual([]);
  });
});
