import { describe, expect, it } from "vitest";
import {
  type Bounds,
  clampRange,
  durationLabel,
  initialPreset,
  matchingPreset,
  MIN_WINDOW_SEC,
  moveEdge,
  panRange,
  PRESETS,
  presetEnabled,
  presetRange,
  sinceLabel,
  sliceSteps,
  spanOf,
  zoomRange,
} from "./timeWindow";

const H = 3_600;
const T0 = 1_791_300_000;
const byLabel = (l: string) => PRESETS.find((p) => p.label === l)!;
const enabled = (spanSec: number) => PRESETS.filter((p) => presetEnabled(p, spanSec)).map((p) => p.label);

describe("presets for the history loaded", () => {
  it("offers 15 min, 1 h, 6 h and All", () => {
    expect(PRESETS.map((p) => p.label)).toEqual(["15 min", "1 h", "6 h", "All"]);
  });

  it("disables a preset that would show about what All shows", () => {
    expect(enabled(7 * H)).toEqual(["15 min", "1 h", "All"]); // 6 h of a 7 h history is not a distinct view
    expect(enabled(24 * H)).toEqual(["15 min", "1 h", "6 h", "All"]);
    expect(enabled(70 * 60)).toEqual(["15 min", "All"]);
    expect(enabled(10 * 60)).toEqual(["All"]);
    expect(enabled(0)).toEqual(["All"]);
  });

  it("never enables two presets with the same range", () => {
    for (const span of [5 * 60, 20 * 60, 75 * 60, 3 * H, 7 * H, 30 * H]) {
      const b: Bounds = [T0, T0 + span];
      const starts = PRESETS.filter((p) => presetEnabled(p, span)).map((p) => presetRange(p, b)[0]);
      expect(new Set(starts).size).toBe(starts.length);
    }
  });

  it("ends every preset at the latest point; All starts at the first", () => {
    const b: Bounds = [T0, T0 + 7 * H];
    expect(presetRange(byLabel("1 h"), b)).toEqual([T0 + 6 * H, T0 + 7 * H]);
    expect(presetRange(byLabel("15 min"), b)).toEqual([T0 + 7 * H - 900, T0 + 7 * H]);
    expect(presetRange(byLabel("All"), b)).toEqual([T0, T0 + 7 * H]);
  });

  it("opens on the wanted preset when it fits, else on All", () => {
    expect(initialPreset("1 h", 7 * H).label).toBe("1 h");
    expect(initialPreset("1 h", 40 * 60).label).toBe("All");
    expect(initialPreset("All", 7 * H).label).toBe("All");
    expect(initialPreset("nope", 7 * H).label).toBe("All");
  });

  it("recognises a preset's window, and nothing else", () => {
    const b: Bounds = [T0, T0 + 7 * H];
    expect(matchingPreset([T0 + 6 * H, T0 + 7 * H], b)?.label).toBe("1 h");
    expect(matchingPreset([T0, T0 + 7 * H], b)?.label).toBe("All");
    expect(matchingPreset([T0 + 5 * H, T0 + 6 * H], b)).toBeUndefined(); // an hour, but not the last one
    expect(matchingPreset([T0 + H, T0 + 7 * H], b)).toBeUndefined(); // 6 h is disabled on a 7 h history
  });
});

describe("pan and zoom", () => {
  const b: Bounds = [T0, T0 + 7 * H];

  it("keeps a window inside the history and at least the minimum length", () => {
    expect(clampRange([T0 - 600, T0 + H - 600], b)).toEqual([T0, T0 + H]);
    expect(clampRange([T0 + 7 * H - 600, T0 + 8 * H - 600], b)).toEqual([T0 + 6 * H, T0 + 7 * H]);
    expect(clampRange([T0 + H, T0 + H + 10], b)).toEqual([T0 + H, T0 + H + MIN_WINDOW_SEC]);
    const short: Bounds = [T0, T0 + 120];
    expect(clampRange([T0, T0 + 60], short)).toEqual([T0, T0 + 120]);
  });

  it("pans by a delta, stopping at either end with the same length", () => {
    expect(panRange([T0 + H, T0 + 2 * H], -H / 2, b)).toEqual([T0 + H / 2, T0 + 1.5 * H]);
    expect(panRange([T0 + H, T0 + 2 * H], -3 * H, b)).toEqual([T0, T0 + H]);
    expect(panRange([T0 + 5 * H, T0 + 6 * H], 3 * H, b)).toEqual([T0 + 6 * H, T0 + 7 * H]);
  });

  it("zooms around an anchor that keeps its place", () => {
    expect(zoomRange([T0 + 2 * H, T0 + 4 * H], 0.5, b)).toEqual([T0 + 2.5 * H, T0 + 3.5 * H]);
    const r = zoomRange([T0 + 2 * H, T0 + 4 * H], 0.5, b, T0 + 2 * H);
    expect(r).toEqual([T0 + 2 * H, T0 + 3 * H]);
    expect(zoomRange([T0 + 2 * H, T0 + 4 * H], 10, b)).toEqual([T0, T0 + 7 * H]); // never wider than the history
    expect(zoomRange([T0 + 2 * H, T0 + 2 * H + 400], 0.1, b)[1] - zoomRange([T0 + 2 * H, T0 + 2 * H + 400], 0.1, b)[0]).toBe(MIN_WINDOW_SEC);
  });
});

describe("resizing from one edge", () => {
  const b: Bounds = [T0, T0 + 7 * H];

  it("moves one edge and keeps the other", () => {
    expect(moveEdge([T0 + H, T0 + 2 * H], "from", -600, b)).toEqual([T0 + H - 600, T0 + 2 * H]);
    expect(moveEdge([T0 + H, T0 + 2 * H], "to", 600, b)).toEqual([T0 + H, T0 + 2 * H + 600]);
  });

  it("stops at the history's ends and at the narrowest window", () => {
    expect(moveEdge([T0 + H, T0 + 2 * H], "from", -5 * H, b)).toEqual([T0, T0 + 2 * H]);
    expect(moveEdge([T0 + H, T0 + 2 * H], "to", 9 * H, b)).toEqual([T0 + H, T0 + 7 * H]);
    expect(moveEdge([T0 + H, T0 + 2 * H], "from", 2 * H, b)).toEqual([T0 + 2 * H - MIN_WINDOW_SEC, T0 + 2 * H]);
    expect(moveEdge([T0 + H, T0 + 2 * H], "to", -2 * H, b)).toEqual([T0 + H, T0 + H + MIN_WINDOW_SEC]);
  });
});

describe("the step series inside a window", () => {
  const pts = [{ t: 0, v: 1 }, { t: 100, v: 2 }, { t: 200, v: 3 }, { t: 300, v: 4 }];

  it("keeps the points inside and re-stamps the step in force at each edge", () => {
    expect(sliceSteps(pts, [150, 300])).toEqual([{ t: 150, v: 2 }, { t: 200, v: 3 }, { t: 300, v: 4 }]);
    expect(sliceSteps(pts, [150, 250])).toEqual([{ t: 150, v: 2 }, { t: 200, v: 3 }, { t: 250, v: 3 }]);
    expect(sliceSteps(pts, [0, 100])).toEqual([{ t: 0, v: 1 }, { t: 100, v: 2 }]);
    expect(sliceSteps(pts, [120, 180])).toEqual([{ t: 120, v: 2 }, { t: 180, v: 2 }]);
  });

  it("stops at the last point: nothing is drawn past the history", () => {
    expect(sliceSteps(pts, [350, 400])).toEqual([{ t: 350, v: 4 }]);
  });
});

describe("labels", () => {
  it("says when the history starts and how long a window is", () => {
    expect(sinceLabel(Date.UTC(2026, 9, 6, 16, 32, 40) / 1000)).toBe("6 Oct 16:32 UTC");
    expect(durationLabel(900)).toBe("15 min");
    expect(durationLabel(5_400)).toBe("1 h 30 min");
    expect(durationLabel(7 * H)).toBe("7 h");
    expect(spanOf([T0, T0 - 5])).toBe(0);
  });
});
