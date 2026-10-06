import { test } from "node:test";
import assert from "node:assert/strict";
import { sigmaE9FromAnnual, annualFromSigmaE9, feePips, pipsToBp, floorCrossoverAnnual } from "../src/fee.mjs";

test("sigma conversions match the spec examples", () => {
  assert.equal(sigmaE9FromAnnual(0.48), 85475);
  assert.equal(sigmaE9FromAnnual(0.25), 44518);
  assert.equal(sigmaE9FromAnnual(0.10), 17807);
  assert.ok(Math.abs(annualFromSigmaE9(85475) - 0.48) < 1e-5);
});

test("feePips rounds up like ClimFeeMath", () => {
  // 85475 * 91761 * 2449490 * 10000 / 1e17 = 1921.2015 -> ceil 1922
  assert.equal(feePips(85475, 91761, 2449490, 10000, 0, 1_000_000), 1922);
  assert.equal(feePips(44518, 91761, 2449490, 10000, 0, 1_000_000), 1001);
});

test("feePips clamps to floor and cap", () => {
  assert.equal(feePips(17807, 25093, 2449490, 10000, 500, 15000), 500);
  assert.equal(feePips(1780730, 91761, 2449490, 20000, 500, 15000), 15000);
});

test("post-audit calibration: P* = 30% and P* = 20%", () => {
  assert.equal(feePips(sigmaE9FromAnnual(1.0), 25093, 2449490, 10000, 500, 15000), 1095);
  assert.equal(feePips(sigmaE9FromAnnual(2.25), 25093, 2449490, 10000, 500, 15000), 2463);
  assert.equal(feePips(sigmaE9FromAnnual(1.0), 41760, 2449490, 10000, 500, 15000), 1822);
  assert.equal(feePips(sigmaE9FromAnnual(2.25), 41760, 2449490, 10000, 500, 15000), 4099);
});

test("pipsToBp and floor crossover", () => {
  assert.equal(pipsToBp(1095), 10.95);
  assert.ok(Math.abs(floorCrossoverAnnual({ etaE4: 25093, sqrtHalfDtE6: 2449490, feeMinPips: 500 }) - 0.4568) < 0.001);
  assert.ok(Math.abs(floorCrossoverAnnual({ etaE4: 41760, sqrtHalfDtE6: 2449490, feeMinPips: 500 }) - 0.2745) < 0.001);
});
