import { describe, expect, test } from "bun:test";
import { logNormal, mulberry32, poisson, standardNormal } from "../src/lib/rng";

function draws(n: number, f: () => number): number[] {
  return Array.from({ length: n }, f);
}
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

describe("seeded PRNG", () => {
  test("same seed -> same sequence, different seed -> different sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const sa = draws(5, a);
    expect(draws(5, b)).toEqual(sa);
    expect(draws(5, c)).not.toEqual(sa);
  });
  test("uniform in [0, 1) with mean 1/2", () => {
    const xs = draws(20_000, mulberry32(1));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(mean(xs)).toBeCloseTo(0.5, 2);
  });
});

describe("distributions", () => {
  test("standard normal: mean 0, sd 1", () => {
    const r = mulberry32(7);
    const xs = draws(20_000, () => standardNormal(r));
    const m = mean(xs);
    const sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
    expect(Math.abs(m)).toBeLessThan(0.03);
    expect(Math.abs(sd - 1)).toBeLessThan(0.03);
  });
  test("poisson: mean and variance equal lambda; lambda 0 gives 0", () => {
    const r = mulberry32(11);
    const xs = draws(20_000, () => poisson(r, 0.5));
    const m = mean(xs);
    const v = mean(xs.map((x) => (x - m) ** 2));
    expect(Math.abs(m - 0.5)).toBeLessThan(0.02);
    expect(Math.abs(v - 0.5)).toBeLessThan(0.03);
    expect(poisson(r, 0)).toBe(0);
    expect(() => poisson(r, -1)).toThrow(RangeError);
  });
  test("log-normal: sample median close to the median parameter", () => {
    const r = mulberry32(5);
    const xs = draws(20_001, () => logNormal(r, 2_000, 1)).sort((a, b) => a - b);
    expect(Math.abs((xs[10_000] ?? 0) / 2_000 - 1)).toBeLessThan(0.05);
  });
});
