import { describe, expect, test } from "bun:test";
import { cheaperPool, effectivePrice, planBlockOrders, type NoiseConfig, type PoolQuote } from "../src/lib/noise";
import { mulberry32 } from "../src/lib/rng";

const V: PoolQuote = { ethUsd: 2_000, feePips: 500 };
const S: PoolQuote = { ethUsd: 2_000, feePips: 1_200 };

describe("all-in price for a small retail order", () => {
  test("a buyer pays price / (1 - f), a seller receives price * (1 - f)", () => {
    expect(effectivePrice("buyEth", V)).toBeCloseTo(2_000 / 0.9995, 9);
    expect(effectivePrice("sellEth", V)).toBeCloseTo(2_000 * 0.9995, 9);
  });
  test("cheaper pool: lower fee wins at equal prices, better price can beat a lower fee", () => {
    expect(cheaperPool("buyEth", { V, S })).toBe("V");
    expect(cheaperPool("sellEth", { V, S })).toBe("V");
    const sCheap: PoolQuote = { ethUsd: 1_996, feePips: 1_200 }; // 1996 / 0.9988 = 1998.4 < 2000 / 0.9995 = 2001.0
    expect(cheaperPool("buyEth", { V, S: sCheap })).toBe("S");
    expect(cheaperPool("sellEth", { V, S: sCheap })).toBe("V");
  });
  test("ties go to V", () => {
    expect(cheaperPool("buyEth", { V, S: V })).toBe("V");
  });
});

describe("planBlockOrders", () => {
  const split: NoiseConfig = { ratePerBlock: 0.5, medianUsd: 2_000, sigmaLn: 1, routing: "split" };
  test("deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 50; i++) {
      expect(planBlockOrders(a, split, { V, S })).toEqual(planBlockOrders(b, split, { V, S }));
    }
  });
  test("Poisson count, balanced sides, 50/50 routing, log-normal size", () => {
    const r = mulberry32(3);
    const orders = Array.from({ length: 10_000 }, () => planBlockOrders(r, split, { V, S })).flat();
    expect(Math.abs(orders.length / 10_000 - 0.5)).toBeLessThan(0.03);
    expect(Math.abs(orders.filter((o) => o.side === "buyEth").length / orders.length - 0.5)).toBeLessThan(0.03);
    expect(Math.abs(orders.filter((o) => o.pool === "V").length / orders.length - 0.5)).toBeLessThan(0.03);
    const sizes = orders.map((o) => o.usd).sort((a, b) => a - b);
    expect(Math.abs((sizes[Math.floor(sizes.length / 2)] ?? 0) / 2_000 - 1)).toBeLessThan(0.08);
  });
  test("mirror routing sends the same order to V and to S", () => {
    const r = mulberry32(21);
    const mirror: NoiseConfig = { ...split, routing: "mirror", ratePerBlock: 2 };
    const orders = Array.from({ length: 500 }, () => planBlockOrders(r, mirror, { V, S })).flat();
    expect(orders.length % 2).toBe(0);
    for (let i = 0; i < orders.length; i += 2) {
      const [a, b] = [orders[i], orders[i + 1]];
      expect(a?.pool).toBe("V");
      expect(b?.pool).toBe("S");
      expect(b?.side).toBe(a?.side);
      expect(b?.usd).toBe(a?.usd);
    }
  });
  test("cheapest routing sends every order to the cheaper pool", () => {
    const r = mulberry32(9);
    const cheapest: NoiseConfig = { ...split, routing: "cheapest", ratePerBlock: 2 };
    const orders = Array.from({ length: 500 }, () => planBlockOrders(r, cheapest, { V, S })).flat();
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((o) => o.pool === "V")).toBe(true);
  });
});
