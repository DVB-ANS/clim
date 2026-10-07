// Facts derived from the lab outputs (lab/out/backtest-summary.json, lab/out/replay-2026-02-04.json and
// lab/out/validation.json), rounded for judges: the lab writes 8 significant digits.
const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;

export function replayStats(replay, backtest) {
  const sigma = replay.points.map((x) => x.sigmaAnnualPct);
  const fee = replay.points.map((x) => x.feeVBp);
  const windows = backtest.replayWindows.map((w) => w.arbChangePct);
  return {
    window: `${replay.window.startUtc.slice(0, 16).replace("T", " ")} to ${replay.window.endUtc.slice(11, 16)} UTC`,
    sigmaMinPct: Math.round(Math.min(...sigma)),
    sigmaMaxPct: Math.round(Math.max(...sigma)),
    feeVMinBp: round1(Math.min(...fee)),
    feeVMaxBp: round1(Math.max(...fee)),
    feeSBp: round1(replay.params.staticFeePips / 100),
    arbChangePct: replay.summary.arbChangePct,
    arbChangeRangePct: [Math.min(...windows), Math.max(...windows)],
    windowsCount: windows.length,
    windowsMedianPct: backtest.replayWindowsMedianPct,
    windowsBetterCount: backtest.replayWindowsBetterCount,
    windowsBeatingChosen: windows.filter((w) => w < replay.summary.arbChangePct).length,
    pTradePredicted: replay.summary.pTradePredV,
    pTradeObserved: replay.summary.pTradeObsV,
    arbUnit: replay.units.arb,
  };
}

// How many times realized arbitrage losses exceed the model, lowest and highest period, to 2 decimals.
export function severityRange(backtest) {
  const ratios = backtest.periods.map((p) => p.arbOverLvr.observed / p.arbOverLvr.model);
  return [round2(Math.min(...ratios)), round2(Math.max(...ratios))];
}

// The model check on the 1 s windows: the largest relative gap between observed and predicted P_trade (whole
// percent, rounded up), the simulated alert zones per window, and whether the gap is statistically significant.
export function validationFacts(validation) {
  const gaps = validation.samples.map((s) => Math.abs(s.pTradeObserved / s.pTradePredicted - 1));
  const maxP = Math.max(...validation.samples.map((s) => s.simPValueTwoSided));
  return {
    maxGapPct: Math.ceil(Math.max(...gaps) * 100),
    zones: validation.samples.map((s) => {
      const z = s.zones.simulated;
      return { name: s.name, green: z.green, yellow: z.yellow, red: z.red, windows: z.green + z.yellow + z.red };
    }),
    significant: maxP < 0.01,
    pText: maxP === 0 ? `p < ${1 / validation.nSimsTotal}` : `p = ${maxP}`,
  };
}

// A gain in % of capital per year, in dollars per year per $1M of liquidity (1% of $1M = $10,000).
export function usdPerMillion(pctPerYear) {
  const usd = Math.round(Math.abs(pctPerYear) * 10_000);
  return `${pctPerYear < 0 ? "-" : ""}$${usd.toLocaleString("en-US")}`;
}

// The replay window against the rolling windows, said the same way in the README (deck v2's slides.json carries its text by hand). The 4 February
// 12:00-16:00 window is not one of the rolling windows (those start at :16 past each hour): it is compared with
// them, never ranked among them.
export function replayChoiceNote(stats, pStar) {
  const sign = (x) => `${x > 0 ? "+" : ""}${x.toFixed(1)}%`;
  const [best, worst] = stats.arbChangeRangePct;
  const n = stats.windowsBeatingChosen;
  const where = n === 0
    ? `no rolling 4 h window of the storm does better (best ${sign(best)})`
    : `${n} of the ${stats.windowsCount} rolling 4 h windows of the storm ${n === 1 ? "does" : "do"} better (best ${sign(best)})`;
  return `The window was picked during design, at an earlier setting, around the sharpest rise in volatility of the storm, after comparing three candidate windows (lab/scratch/replay_pick*.py). At P* = ${Math.round(pStar * 100)}% ${where}: the worst of the ${stats.windowsCount} is ${sign(worst)}, the median ${sign(stats.windowsMedianPct)}, and ${stats.windowsBetterCount} of ${stats.windowsCount} beat the fixed pool.`;
}

// The main (aggregator) scenario's year gain for ETH, in % of capital per year, from the lab's year attribution at the
// deployed P* (the share earned in the five stormiest weeks, top5WeeksSharePct, is a share of this gain). Null if absent.
export function mainScenarioGainPct(backtest) {
  const bpYr = backtest.yearAttribution?.[`clim_p${Math.round(backtest.pStar * 100)}`]?.gainVsStatic5BpYr;
  return typeof bpYr === "number" ? bpYr / 100 : null;
}
