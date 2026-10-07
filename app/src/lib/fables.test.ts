import { describe, expect, it } from "vitest";
import raw from "../../public/data/lab/fables-storm-2026-10-07.json";
import { mergeSteps, parseFablesStorm } from "./fables";

describe("mergeSteps", () => {
  it("puts both series on every change time, inside the window", () => {
    const a = [
      { t: 0, feePips: 500 },
      { t: 30, feePips: 900 },
    ];
    const b = [
      { t: 10, feePips: 700 },
      { t: 40, feePips: 6000 },
      { t: 200, feePips: 700 },
    ];
    expect(mergeSteps(a, b, 5, 100)).toEqual([
      { t: 5, a: 500, b: 700 },
      { t: 10, a: 500, b: 700 },
      { t: 30, a: 900, b: 700 },
      { t: 40, a: 900, b: 6000 },
      { t: 100, a: 900, b: 6000 },
    ]);
  });
});

describe("the 7 October file", () => {
  const d = parseFablesStorm(raw);
  it("covers clim's storm window, 01:40 to 03:10 UTC", () => {
    expect(d.window).toEqual({ start: Date.UTC(2026, 9, 7, 1, 40) / 1000, end: Date.UTC(2026, 9, 7, 3, 10) / 1000 });
  });
  it("starts at the flat fee and reaches the cap", () => {
    expect(d.steps[0].feePips).toBe(d.config.flatPips);
    expect(Math.max(...d.steps.map((s) => s.feePips))).toBe(d.config.capPips);
  });
  it("checks every swap against the keeper's rule", () => {
    expect(d.swaps.matchKeeperRule).toBe(d.swaps.n);
  });
  it("names one keeper for every poke", () => {
    expect(d.keepers).toHaveLength(1);
  });
  it("refuses a file without steps", () => {
    expect(() => parseFablesStorm({ ...d, steps: [] })).toThrow();
  });
});
