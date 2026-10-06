import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../src/inputs.mjs";
import { replayStats, severityRange, validationFacts, usdPerMillion, replayChoiceNote, mainScenarioGainPct } from "../src/lab.mjs";

const fx = (name) => readJson(new URL(`./fixtures/${name}`, import.meta.url));

test("replayStats summarizes the replay window and its place among the rolling windows", () => {
  assert.deepEqual(replayStats(fx("replay.json"), fx("backtest-summary.json")), {
    window: "2026-02-04 12:00 to 16:00 UTC",
    sigmaMinPct: 74,
    sigmaMaxPct: 225,
    feeVMinBp: 12,
    feeVMaxBp: 128,
    feeSBp: 55.7,
    arbChangePct: -25,
    arbChangeRangePct: [-25, -8],
    windowsCount: 2,
    windowsMedianPct: -16.5,
    windowsBetterCount: 2,
    windowsBeatingChosen: 0,
    pTradePredicted: 0.092,
    pTradeObserved: 0.069,
    arbUnit: "USD per $1M of liquidity",
  });
});

test("severityRange divides observed by model per period, to 2 decimals", () => {
  assert.deepEqual(severityRange(fx("backtest-summary.json")), [1.29, 1.33]);
});

test("validationFacts: largest P_trade gap rounded up, simulated zones, significance", () => {
  assert.deepEqual(validationFacts(fx("validation.json")), {
    maxGapPct: 10,
    zones: [
      { name: "feb", green: 94, yellow: 1, red: 0, windows: 95 },
      { name: "oct", green: 62, yellow: 7, red: 2, windows: 71 },
    ],
    significant: true,
    pText: "p < 0.0005",
  });
});

test("usdPerMillion turns % of capital per year into dollars per $1M", () => {
  assert.equal(usdPerMillion(0.39), "$3,900");
  assert.equal(usdPerMillion(-0.0981486), "-$981");
  assert.equal(usdPerMillion(0.70240233), "$7,024");
});

test("replayChoiceNote compares the replay window with the rolling windows, never ranks it among them", () => {
  const stats = replayStats(fx("replay.json"), fx("backtest-summary.json"));
  assert.equal(
    replayChoiceNote(stats, 0.3),
    "The window was picked during design, at an earlier setting, around the sharpest rise in volatility of the storm, after comparing three candidate windows (lab/scratch/replay_pick*.py). At P* = 30% no rolling 4 h window of the storm does better (best -25.0%): the worst of the 2 is -8.0%, the median -16.5%, and 2 of 2 beat the fixed pool.",
  );
  assert.match(replayChoiceNote({ ...stats, windowsBeatingChosen: 1 }, 0.3), /At P\* = 30% 1 of the 2 rolling 4 h windows of the storm does better \(best -25\.0%\)/);
  assert.match(replayChoiceNote({ ...stats, windowsBeatingChosen: 2 }, 0.3), /2 of the 2 rolling 4 h windows of the storm do better/);
});

test("mainScenarioGainPct reads the year attribution at the deployed P*, in % of capital per year", () => {
  assert.equal(mainScenarioGainPct(fx("backtest-summary.json")), 0.39110205);
  assert.equal(mainScenarioGainPct({ ...fx("backtest-summary.json"), pStar: 0.3 }), null);
  assert.equal(mainScenarioGainPct({ pStar: 0.1 }), null);
});
