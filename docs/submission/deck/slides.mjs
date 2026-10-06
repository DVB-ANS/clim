// Slide-by-slide content of the clim deck. Every number comes from the data object (lab, params, links), never typed here.
import { C, FONT, W, M, card, stat, badge, arrow, note, chartBase } from "./style.mjs";
import { usdPerMillion } from "../src/lab.mjs";

const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const signed = (x) => `${x > 0 ? "+" : ""}${x.toFixed(1)}%`;
const signed2 = (x) => `${x > 0 ? "+" : ""}${x.toFixed(2)}%`;
const bp = (pips) => `${(pips / 100).toFixed(0)} bp`;

function content(pres, section, heading) {
  const slide = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
  slide.addText(heading, { placeholder: "title" });
  return slide;
}

function videoOrMissing(pres, slide, { path, cover, x, y, w, h, name }) {
  if (path) {
    slide.addMedia({ type: "video", path, cover: cover ?? undefined, x, y, w, h, objectName: name });
    return;
  }
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: C.surface }, line: { color: C.bad, width: 2 }, objectName: `${name}-missing` });
  slide.addText("VIDEO MISSING: run scripts/build-video.sh, then rebuild the deck", { x, y, w, h, align: "center", valign: "middle", fontFace: FONT, fontSize: 20, color: C.bad, isTextBox: true, objectName: `${name}-missing-text` });
}

export const PITCH_30S =
  "Liquidity providers are insurers. When ETH jumps on Binance, bots buy from the pool at the old price and the LP pays the gap. " +
  "That loss is small when the market is calm and large in a storm, yet pools charge the same fee in both. " +
  "clim is storm insurance. Four exchanges, like four weather stations that must agree, are read every 30 seconds by a Chainlink workflow. " +
  "A Uniswap hook turns that weather into the fee: the market price when it is calm, a rising premium in the storm.";

export function addSlides(pres, d) {
  const { backtest: bt, params: p, links, team, series, schedule, video, stats: r, severity, model } = d;

  // 1. Hook
  pres.addSection({ title: "Pitch" });
  const s1 = pres.addSlide({ masterName: "TITLE", sectionTitle: "Pitch" });
  s1.addText("clim", { placeholder: "title" });
  s1.addText("Storm insurance for Uniswap liquidity providers", { placeholder: "body" });
  note(s1, { x: M, y: 4.85, w: 11, h: 0.9, size: 18, name: "s1-tagline", text: "A fee at market price when it is calm, a premium that rises with the storm, measured by a Chainlink CRE risk desk." });
  note(s1, { x: M, y: 6.6, w: 8, h: 0.4, size: 12, name: "s1-footer", text: "TOKEN2049 Origins · Singapore · October 2026 · github.com/DVB-ANS/clim" });
  s1.addNotes(`30-second pitch: ${PITCH_30S}`);

  // 2. Problem
  const s2 = content(pres, "Pitch", "Every time the market moves, the LP pays");
  const steps = [
    ["1 · ETH jumps on exchanges", "Binance and Coinbase reprice in milliseconds."],
    ["2 · The pool lags", "An AMM price only moves when someone trades, at most once per block."],
    ["3 · A bot takes the gap", "It buys from the pool at the stale price and sells on the exchange. The LP pays the difference."],
  ];
  steps.forEach(([h, b], i) => {
    card(pres, s2, { x: M + i * 4.15, y: 1.55, w: 3.7, h: 1.85, heading: h, body: b, color: i === 2 ? C.bad : C.sky, name: `s2-step${i + 1}` });
    if (i < 2) arrow(pres, s2, { x: M + i * 4.15 + 3.75, y: 2.47, w: 0.35, name: `s2-arrow${i + 1}` });
  });
  stat(s2, { x: M, y: 3.95, w: 5.6, value: "$260M vs $199M", label: "impermanent loss vs fees earned, 17 largest Uniswap v3 pools, first months after launch (Loesch et al., 2021)", color: C.bad, valueSize: 40, name: "s2-stat" });
  card(pres, s2, { x: 6.9, y: 3.9, w: 5.83, h: 1.9, heading: "One fee for all weather", body: "Too high when it is calm: traders go to the pool next door. Too low in a storm: LPs get picked off.", color: C.amber, name: "s2-onefee" });
  s2.addNotes(
    "This loss has a name: loss-versus-rebalancing (Milionis et al. 2022). It grows with the square of volatility, so it is mostly a storm problem. " +
      "Before the hackathon we measured one live L2 pool (Fables ETH/USDG on Robinhood Chain, September 2026): arbitrage losses were 75 to 105% of the fees earned.",
  );

  // 3. Idea
  const s3 = content(pres, "Pitch", "clim is storm insurance");
  card(pres, s3, { x: M, y: 1.55, w: 6.0, h: 2.35, heading: "Calm", body: `Fee = the pair's market tier (${bp(p.feeMinPips)} for ETH/USDC). Same price as the pool next door, so traders stay.`, color: C.good, name: "s3-calm" });
  card(pres, s3, { x: M, y: 4.15, w: 6.0, h: 2.35, heading: "Storm", body: "Fee = a premium that rises with volatility. The LP is paid for the risk it carries.", color: C.amber, name: "s3-storm" });
  const rows = [
    ["Liquidity provider", "insurer"],
    ["Fee", "premium"],
    ["Volatility", "weather"],
    ["Chainlink CRE", "4 weather stations that must agree"],
  ];
  s3.addTable(
    rows.map(([a, b]) => [
      { text: a, options: { color: C.muted, fontSize: 18 } },
      { text: b, options: { color: C.ink, fontSize: 18, bold: true } },
    ]),
    { x: 7.0, y: 1.75, w: 5.73, colW: [2.4, 3.33], rowH: 0.9, fontFace: FONT, fill: { color: C.night }, border: { type: "solid", pt: 0.75, color: C.grid }, valign: "middle", objectName: "s3-metaphor" },
  );
  s3.addNotes("The shape of the fee, flat at the market tier and then rising with volatility, follows the threshold fee schedules studied by Campbell, Bergault, Milionis and Nutz (2025) for pools that compete with other venues.");

  // 4. How the fee is computed
  const s4 = content(pres, "Pitch", "The fee follows the weather, swap by swap");
  s4.addChart(pres.charts.LINE, [{ name: "ETH volatility (% per year)", labels: series.labels, values: series.sigma }], chartBase({ x: M, y: 1.4, w: 7.6, h: 2.4, chartColors: [C.sky], lineSize: 2, lineDataSymbol: "none", title: `ETH volatility, % per year (${r.window})`, catAxisLabelFrequency: "20", objectName: "s4-sigma" }));
  s4.addChart(
    pres.charts.LINE,
    [
      { name: "clim pool fee (bp)", labels: series.labels, values: series.feeV },
      { name: "fixed-fee pool, same average (bp)", labels: series.labels, values: series.feeS },
    ],
    chartBase({ x: M, y: 3.95, w: 7.6, h: 2.75, chartColors: [C.amber, C.grey], lineSize: 2, lineDataSymbol: "none", title: "LP fee, bp", showLegend: true, legendPos: "b", catAxisLabelFrequency: "20", objectName: "s4-fee" }),
  );
  card(pres, s4, {
    x: 8.55, y: 1.45, w: 4.18, h: 2.55,
    heading: "fee = max(floor, η · σ · √(Δt/2))",
    body: `σ: 15-min volatility from the desk, every 30 s.\n√(Δt/2): price noise in half a 12 s block.\nη: ${pct(p.pStar, 0)} of blocks arbitraged above the floor (fewer when calm).`,
    headSize: 18, bodySize: 14, name: "s4-formula",
  });
  card(pres, s4, {
    x: 8.55, y: 4.2, w: 4.18, h: 2.5,
    heading: "Nobody changes the fee",
    body: "Uniswap calls the hook inside every swap. The hook reads the desk and returns the fee for that swap only. No keeper, no admin, no fee transaction.",
    color: C.good, headSize: 18, bodySize: 14, name: "s4-nochange",
  });
  s4.addNotes(
    "Mentor question 1, how is the fee computed and changed: it is never changed by a transaction. On every swap the PoolManager calls ClimHook.beforeSwap; the hook reads RiskDesk.state() and returns the fee with OVERRIDE_FEE_FLAG. " +
      "The fee is in standard deviations of the price move over half a block, so a block gets arbitraged with a known probability P* (Milionis, Moallemi, Roughgarden 2023; Nezlobin and Tassy 2025).",
  );

  // 5. The CRE risk desk
  const s5 = content(pres, "Pitch", "The risk desk runs on Chainlink CRE");
  ["Coinbase", "Kraken", "Binance", "Hyperliquid"].forEach((v, i) => {
    s5.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 1.55 + i * 0.78, w: 1.9, h: 0.6, rectRadius: 0.1, fill: { color: C.surface2 }, line: { color: C.surface2 }, objectName: `s5-venue${i}-bg` });
    s5.addText(v, { x: M, y: 1.55 + i * 0.78, w: 1.9, h: 0.6, align: "center", valign: "middle", fontFace: FONT, fontSize: 15, color: C.ink, margin: 0, isTextBox: true, objectName: `s5-venue${i}` });
  });
  arrow(pres, s5, { x: 2.6, y: 2.95, w: 0.4, name: "s5-a1" });
  card(pres, s5, { x: 3.1, y: 1.55, w: 2.95, h: 2.9, heading: "Every node, every 30 s", body: "USD prices, drop stale venues, need 3 of 4, 15-min volatility, venue dispersion.", color: C.sky, headSize: 17, bodySize: 14, name: "s5-node" });
  arrow(pres, s5, { x: 6.1, y: 2.95, w: 0.4, name: "s5-a2" });
  card(pres, s5, { x: 6.6, y: 1.55, w: 2.75, h: 2.9, heading: "DON consensus", body: "Median of each field across nodes, one signed report.", color: C.sky, headSize: 17, bodySize: 14, name: "s5-don" });
  arrow(pres, s5, { x: 9.4, y: 2.95, w: 0.4, name: "s5-a3" });
  card(pres, s5, { x: 9.9, y: 1.55, w: 2.83, h: 2.9, heading: "RiskDesk.sol", body: "Rejects early, future or thin reports. Caps jumps: ×2 up, ×0.8 down. No setter for σ or the fee.", color: C.amber, headSize: 17, bodySize: 14, name: "s5-desk" });
  card(pres, s5, { x: M, y: 4.85, w: 5.9, h: 1.65, heading: "Blind mode", body: `Desk silent for more than ${p.tauKillSec} s: the hook quotes at least ${bp(p.feeSafePips)}.`, color: C.bad, headSize: 17, bodySize: 15, name: "s5-blind" });
  card(pres, s5, { x: 6.83, y: 4.85, w: 5.9, h: 1.65, heading: "Degraded mode", body: `Venues disagree by more than 25 bp: the hook quotes at least ${bp(p.feeSafePips)}.`, color: C.bad, headSize: 17, bodySize: 15, name: "s5-degraded" });
  s5.addNotes("CRE does the whole orchestration: six HTTP sources per node, normalization, quorum, estimation, consensus, a signed report and the on-chain write. The Data Feed (0.5% deviation, 1 h heartbeat) is too coarse, and a pull oracle would let the swapper pick its report.");

  // 6. Demo
  const s6 = content(pres, "Pitch", "Demo");
  videoOrMissing(pres, s6, { path: video.stage, cover: video.coverStage, x: 1.87, y: 1.35, w: 9.6, h: 5.4, name: "s6-video" });
  s6.addNotes("Stage cut of the screen recording: live Sepolia plumbing with the safety demos, the 4 February 2026 replay, the lab results. Talk over it, it has no sound.");

  // 7. Proof: replay
  pres.addSection({ title: "Proof" });
  const s7 = content(pres, "Proof", "4 February 2026: the storm test");
  stat(s7, { x: M, y: 1.5, w: 4.6, value: `${r.sigmaMinPct}% → ${r.sigmaMaxPct}%`, label: "ETH volatility, per year", color: C.sky, name: "s7-sigma" });
  stat(s7, { x: M, y: 3.15, w: 4.6, value: `${r.feeVMinBp} → ${r.feeVMaxBp} bp`, label: "clim's fee", color: C.amber, name: "s7-fee" });
  stat(s7, { x: M, y: 4.8, w: 4.6, value: signed(r.arbChangePct), label: `LP losses to arbitrage vs a fixed ${r.feeSBp} bp pool, same average fee`, color: C.good, name: "s7-arb" });
  s7.addChart(
    pres.charts.LINE,
    [
      { name: "clim pool", labels: series.labels, values: series.arbV },
      { name: "fixed-fee pool", labels: series.labels, values: series.arbS },
    ],
    chartBase({ x: 5.5, y: 1.45, w: 7.23, h: 4.6, chartColors: [C.amber, C.grey], lineSize: 2.5, lineDataSymbol: "none", title: `LP losses to arbitrage, cumulative (${r.arbUnit})`, showLegend: true, legendPos: "b", catAxisLabelFrequency: "20", valAxisLabelFormatCode: "#,##0", objectName: "s7-arb-chart" }),
  );
  const chosen = r.windowsBeatingChosen === 0 ? "this window is the most favorable one" : `${r.windowsBeatingChosen} windows did better than this one`;
  note(s7, { x: 5.5, y: 6.15, w: 7.23, h: 0.75, size: 11, name: "s7-range", text: `Over the ${r.windowsCount} rolling 4 h windows of the storm: ${signed(r.arbChangeRangePct[0])} to ${signed(r.arbChangeRangePct[1])}, median ${signed(r.windowsMedianPct)}; ${chosen} (picked during design, at an earlier setting). Predicted / observed arbitraged blocks: ${pct(r.pTradePredicted)} / ${pct(r.pTradeObserved)}.` });
  s7.addNotes("The replay feeds real Binance prices of the 4 February 2026 storm through the same desk and hook. Both pools have the same average fee, so the gain comes from charging at the right time, not from charging more. We picked this window during design, at the old setting, around the sharpest rise in volatility, after comparing three candidates; at the final setting it turns out to be the most favorable 4 h window of the storm, so the slide shows the range and the median of all the hourly windows next to it.");

  // 8. Proof: prediction
  const s8 = content(pres, "Proof", `How often the pool is arbitraged: predicted within ${model.maxGapPct}%`); // one line at 36 pt
  const periods = bt.periods.map((x) => x.label);
  s8.addChart(
    pres.charts.BAR,
    [
      { name: "predicted", labels: periods, values: bt.periods.map((x) => +(x.pTrade.predicted * 100).toFixed(1)) },
      { name: "observed", labels: periods, values: bt.periods.map((x) => +(x.pTrade.observed * 100).toFixed(1)) },
    ],
    chartBase({ x: M, y: 1.45, w: 6.2, h: 5.0, barDir: "col", barGrouping: "clustered", chartColors: [C.sky, C.amber], title: "Share of blocks arbitraged (%)", showLegend: true, legendPos: "b", showValue: true, dataLabelPosition: "outEnd", dataLabelColor: C.ink, dataLabelFontSize: 12, dataLabelFormatCode: "0.0", valAxisMinVal: 0, objectName: "s8-ptrade" }),
  );
  const head = (t) => ({ text: t, options: { bold: true, color: C.ink, fill: { color: C.surface2 } } });
  const cell = (t) => ({ text: t, options: { color: C.ink } });
  s8.addTable(
    [
      [head("Change in LP losses to arbitrage"), ...periods.map(head)],
      [cell("Same average fee"), ...bt.periods.map((x) => cell(signed(x.equalTimeAvgFee.arbChangePct)))],
      [cell("Same cost to traders"), ...bt.periods.map((x) => cell(signed(x.equalTraderCost.arbChangePct)))],
    ],
    { x: 7.1, y: 1.6, w: 5.63, colW: [2.63, ...periods.map(() => 3.0 / periods.length)], rowH: 0.6, fontFace: FONT, fontSize: 15, fill: { color: C.surface }, border: { type: "solid", pt: 0.75, color: C.grid }, valign: "middle", objectName: "s8-comparisons" },
  );
  note(s8, { x: 7.1, y: 4.0, w: 5.63, h: 1.6, size: 14, name: "s8-why", text: "Against a fixed-fee pool. We always show both: at the same average fee clim wins; when volume grows with volatility, the same cost to traders is the fairer test and the gain shrinks." });
  const periodLabel = (name) => bt.periods.find((x) => x.id.startsWith(name))?.label ?? name;
  const zoneText = model.zones.map((z) => `${periodLabel(z.name)}: ${z.red} red, ${z.yellow} yellow of ${z.windows}`).join("; ");
  note(s8, {
    x: 7.1, y: 5.65, w: 5.63, h: 0.95, size: 12, name: "s8-validation",
    text: `Simulated alert zones, 1 h windows: ${zoneText}. The gap is ${model.significant ? "statistically significant" : "not significant"} (${model.pText}); losses per arbitrage run ${severity[0].toFixed(2)} to ${severity[1].toFixed(2)} times the model.`,
  });
  s8.addNotes("The prediction is the share of arbitraged blocks. Above the floor the fee targets P*; at the floor fewer blocks are arbitraged, and the model predicts that too. It is falsifiable and we check it: within a few percent, but with years of blocks even a small gap is statistically significant. The one-year bar uses 1-minute data bridged to 12 s blocks, a weaker test than the two 1 s windows. Arbitrage comes in clusters, so our alert thresholds are simulated rather than taken from a textbook.");

  // 9. Not just another hook
  const s9 = content(pres, "Proof", "Not just another volatility hook");
  note(s9, { x: M, y: 1.4, w: 12, h: 0.5, size: 18, name: "s9-intro", text: "At least 15 hooks already raise fees with volatility. clim adds three things:" });
  [
    ["A falsifiable prediction", `Above the ${bp(p.feeMinPips)} floor the fee is set so that ${pct(p.pStar, 0)} of blocks get arbitraged (fewer when calm). We publish the prediction and measure it, live and on history.`],
    ["Model control", "Alert thresholds come from simulating the model, because arbitrage comes in clusters. A model-risk multiplier k (1 to 2) can only make the fee more prudent."],
    ["A desk with no fee setter", "Immutable parameters, bounded volatility jumps, a kill switch to a safe fee. The owner only picks the trusted forwarder, then renounces."],
  ].forEach(([h, b], i) => {
    badge(pres, s9, { x: M + i * 4.15, y: 2.15, text: String(i + 1), name: `s9-badge${i + 1}` });
    card(pres, s9, { x: M + i * 4.15, y: 2.85, w: 3.85, h: 2.7, heading: h, body: b, color: C.amber, name: `s9-card${i + 1}` });
  });
  s9.addNotes("We never pitch volatility fees as new. What is new is the closed-form, checked prediction and the multi-venue desk on Chainlink.");

  // 10. Competition
  const s10 = content(pres, "Proof", "Where clim sits");
  [
    ["Volatility fees", "Trader Joe Liquidity Book, Meteora DLMM, Bunni v2, 15+ v4 hooks (incl. LiquidMind on CRE).", "Same family. clim adds the multi-venue desk and the checked prediction.", C.sky],
    ["Auctions and ordering", "Angstrom, CoW AMM.", "Win arbitrage back by changing who trades first. Needs a new venue or sequencing. Complementary.", C.sky],
    ["Managed liquidity", "Arrakis.", "A professional manager runs the position. You trust the manager.", C.sky],
    ["clim", "A public risk desk any pool can read.", "A hook that prices every swap from it, and a prediction anyone can check.", C.amber],
  ].forEach(([h, who, what, color], i) => {
    card(pres, s10, { x: M + i * 3.1, y: 1.55, w: 2.9, h: 4.9, heading: h, body: `${who}\n\n${what}`, color, fill: i === 3 ? C.surface2 : C.surface, bodySize: 15, name: `s10-col${i + 1}` });
  });
  s10.addNotes("LiquidMind (github.com/Hebx/liquidmind-ai) uses CRE and Data Feeds for rebalancing and dynamic fees on Uniswap v4. Bunni v2 adds surge fees in volatile periods. Angstrom (Sorella) and CoW AMM change ordering or batch trades.");

  // 11. Why Chainlink
  const s11 = content(pres, "Proof", "Why Chainlink CRE");
  stat(s11, { x: M, y: 1.6, w: 4.6, value: `${Math.round(bt.inPoolVolGainSharePct.low)}–${Math.round(bt.inPoolVolGainSharePct.high)}%`, label: "of the desk's gain is also captured by a volatility measured inside the pool (our lab). So CRE is about trust, not about the number.", color: C.sky, valueSize: 54, name: "s11-honest" });
  [
    ["Four exchanges must agree", "Nobody moves the fee with fake trades on the pool."],
    ["One signed report", "Delivered through the Chainlink forwarder, not a keeper key."],
    ["One figure, many pools and chains", "CRE writes to EVM chains and to Solana."],
    ["Model control off-chain", "The desk checks its own prediction and can raise k."],
  ].forEach(([h, b], i) => {
    card(pres, s11, { x: 5.7, y: 1.5 + i * 1.28, w: 7.03, h: 1.13, heading: h, body: b, color: C.amber, headSize: 17, bodySize: 14, name: `s11-row${i + 1}` });
  });
  s11.addNotes("Honest answer first, then robustness. This is the answer to 'why not compute volatility on-chain?'. Above 100% means the in-pool estimate did slightly better in one sample (the February storm).");

  // 12. Limits
  const s12 = content(pres, "Proof", "Limits we know about");
  const g = bt.lpGainPctPerYear;
  [
    ["Latency", "At least 30 s plus inclusion. The first move of a jump is still arbitraged at the old fee."],
    ["Modest average gain", `${signed2(g.low)} to ${signed2(g.high)} of capital per year (${usdPerMillion(g.low)} to ${usdPerMillion(g.high)} per $1M), about ${Math.round(g.top5WeeksSharePct)}% of it in the 5 stormiest weeks.`],
    ["Severity", `Arbitrage costs ${severity[0].toFixed(2)} to ${severity[1].toFixed(2)} times more than the model says. Only the frequency is predicted well (within ${model.maxGapPct}%).`],
    ["Simulation", "One CRE node and a mock forwarder without signatures. RiskDesk accepts simulated reports only from our operator key."],
    ["Our own bots", "Sepolia proves the plumbing, not the market. No mainnet pool yet."],
    ["Immutable parameters", "A different P* means a new hook and a new pool."],
  ].forEach(([h, b], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    card(pres, s12, { x: M + col * 6.13, y: 1.5 + row * 1.7, w: 5.93, h: 1.55, heading: h, body: b, color: C.bad, headSize: 17, bodySize: 14, name: `s12-limit${i + 1}` });
  });
  s12.addNotes("We show the limits on purpose: the value of clim is a model you can check, so we check ourselves first.");

  // 13. After the hackathon
  pres.addSection({ title: "Next" });
  const s13 = content(pres, "Next", "After the hackathon: a risk desk as a service");
  note(s13, { x: M, y: 1.4, w: 12, h: 0.5, size: 18, name: "s13-intro", text: "Not a startup as a hook fee: DEXs build fees in-house. The desk is the product." });
  [
    ["Shadow mode", "Publish volatility and a recommended fee next to a live DEX's keeper. First conversation: Fables."],
    ["Signal", "They plug the number in, pay for a pilot or co-sign a study."],
    ["Otherwise", "Publish the work: paper, Uniswap Foundation or Chainlink grant."],
  ].forEach(([h, b], i) => {
    badge(pres, s13, { x: M + i * 4.15, y: 2.15, text: String(i + 1), color: C.sky, name: `s13-badge${i + 1}` });
    card(pres, s13, { x: M + i * 4.15, y: 2.85, w: 3.85, h: 2.1, heading: h, body: b, color: C.sky, name: `s13-step${i + 1}` });
  });
  note(s13, { x: M, y: 5.35, w: 12, h: 0.8, size: 15, name: "s13-next", text: "Next markets: memecoins, where arbitrage exceeds fees; tokenized stocks around the open and close. One desk, many chains." });
  s13.addNotes("The audit was clear: as a hook fee this is at most a few hundred thousand dollars a year. As a risk desk that measures LVR, recommends fees and checks the model, it is a service DEXs could buy.");

  // 14. Team and links
  const s14 = content(pres, "Next", "Team and links");
  team.forEach((m, i) => {
    card(pres, s14, { x: M, y: 1.5 + i * 1.35, w: 5.6, h: 1.2, heading: m.name, body: `${m.github ? `@${m.github} · ` : ""}${m.role}`, color: C.amber, headSize: 18, bodySize: 14, name: `s14-member${i + 1}` });
  });
  const linkRows = [
    ["Code", links.repoUrl],
    ["Live dashboard", links.liveUrl || "added at submission"],
    ["CRE evidence", `${links.repoUrl}/tree/main/docs/evidence`],
  ];
  s14.addTable(
    linkRows.map(([a, b]) => [
      { text: a, options: { color: C.muted, fontSize: 15 } },
      { text: b.replace("https://", ""), options: { color: C.ink, fontSize: 14, hyperlink: b.startsWith("https://") ? { url: b } : undefined } },
    ]),
    { x: 6.5, y: 1.5, w: 6.23, colW: [1.7, 4.53], rowH: 0.7, fontFace: FONT, fill: { color: C.night }, border: { type: "solid", pt: 0.75, color: C.grid }, valign: "middle", objectName: "s14-links" },
  );
  note(s14, { x: 6.5, y: 4.0, w: 6.23, h: 0.8, size: 15, name: "s14-built", text: "Built in 36 hours at TOKEN2049 Origins, for the main track and Chainlink's Best workflow with CRE." });
  s14.addNotes("Thank you. Questions: the answer bank is in the plan and docs/faq.md.");

  // Appendix
  pres.addSection({ title: "Appendix" });
  const a0 = pres.addSlide({ masterName: "SECTION", sectionTitle: "Appendix" });
  a0.addText("Appendix", { placeholder: "title" });

  const aLive = content(pres, "Appendix", "Can a pool that is already live switch to clim?");
  [
    ["Static-fee v4 pool: no", "Fee mode and hook are part of the PoolKey, the pool's identity. Open a new pool with the dynamic-fee flag and clim's hook; LPs move their liquidity.", C.bad],
    ["Dynamic-fee v4 pool: through its hook", "Its hook sets the fee per swap (beforeSwap + OVERRIDE_FEE_FLAG) or stores it (updateDynamicLPFee, hook only). If that hook or its keeper can read RiskDesk.state(), no migration.", C.amber],
    ["Any DEX with a keeper-set fee", "The keeper reads RiskDesk.state(), or CRE writes the same report to its chain. Start in shadow mode: publish the recommended fee next to the live one.", C.sky],
    ["clim's own pools: immutable", "P*, floor, cap, safe fee and kill delay are constructor arguments. A new profile means a new hook and a new pool, so no owner can change the rule.", C.good],
  ].forEach(([h, b, color], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    card(pres, aLive, { x: M + col * 6.13, y: 1.5 + row * 2.55, w: 5.93, h: 2.35, heading: h, body: b, color, headSize: 18, bodySize: 15, name: `alive-${i + 1}` });
  });
  aLive.addNotes("Mentor question 2. Sources: v4-core PoolKey, LPFeeLibrary (DYNAMIC_FEE_FLAG 0x800000, OVERRIDE_FEE_FLAG 0x400000), PoolManager.updateDynamicLPFee (reverts unless msg.sender is the pool's hook). Full answer in docs/faq.md.");

  const aLimits = content(pres, "Appendix", "More limits");
  [
    ["DVOL", "A single source with little short-term information: published as a diagnostic, never used in the fee."],
    ["Sources", "Binance answers HTTP 451 to US IPs, and where DON nodes run is unknown. A quorum of 3 of 4 survives one missing venue, not two."],
    ["Fast chains", "With sub-second blocks the formula sits at the floor until an effective Δt, the arbitrageurs' reaction time, is calibrated."],
    ["Cost on Ethereum mainnet", "A report every 30 s would cost an estimated $60k to $110k a year in gas. Production would publish on deviation plus a heartbeat, or on an L2."],
    ["Governance, not audited", "Immutable parameters: a new profile needs a new pool. The desk owner is a trust assumption until it renounces. Testnet code, not audited."],
  ].forEach(([h, b], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    card(pres, aLimits, { x: M + col * 6.13, y: 1.5 + row * 1.7, w: 5.93, h: 1.55, heading: h, body: b, color: C.bad, headSize: 17, bodySize: 14, name: `alimits-${i + 1}` });
  });
  aLimits.addNotes("Spec section 10, items 6 to 10. The mainnet gas figure is the design audit's estimate, not a lab output.");

  const a1 = content(pres, "Appendix", "The maths");
  const maths = [
    "Price noise over half a block: â = σ·√(Δt/2), with σ per √second = σ_year / √31,536,000.",
    "Arbitrage probability per block (Milionis, Moallemi, Roughgarden 2023): P = 1/(1 + η), with η = fee / â.",
    "Fixed block times (Nezlobin, Tassy 2025): P ≈ 1/(η + 0.824), where 0.824 ≈ |ζ(1/2)|/√π.",
    "Policy: η* = 1/P* − 0.824, fee = clamp(⌈η*·k·σ·√(Δt/2)⌉, floor, cap).",
    "On-chain integers: fee_pips = ⌈sigmaE9 · etaE4 · sqrtHalfDtE6 · kE4 / 10^17⌉, 1 bp = 100 pips.",
    "Desk estimator: p_t = median of venue closes (USD, 1 min); σ̂ = √(Σ r_i² / 900 s) over 15 returns.",
    "Envelope: σ_applied = clamp(σ_report, max(σ_min, 0.8·σ_prev), min(σ_max, 2·σ_prev)).",
    "Gain vs a fixed fee at the same average fee: ARB(f ∝ σ) / ARB(fixed) = E[σ]·E[σ²] / E[σ³] ≤ 1.",
  ];
  a1.addText(
    maths.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < maths.length - 1 } })),
    { x: M, y: 1.45, w: 12.1, h: 5.2, fontFace: FONT, fontSize: 16, color: C.ink, paraSpaceAfter: 10, valign: "top", margin: 0, isTextBox: true, objectName: "a1-maths" },
  );

  const a2 = content(pres, "Appendix", "Parameters and fee schedule");
  const prow = (a, b) => [{ text: a, options: { color: C.muted } }, { text: b, options: { color: C.ink, bold: true } }];
  a2.addTable(
    [
      prow("P* (target share of arbitraged blocks)", pct(p.pStar, 0)),
      prow("etaE4", String(p.etaE4)),
      prow("sqrtHalfDtE6 (12 s blocks)", String(p.sqrtHalfDtE6)),
      prow("Floor / cap / safe fee", `${bp(p.feeMinPips)} / ${bp(p.feeMaxPips)} / ${bp(p.feeSafePips)}`),
      prow("Kill delay", `${p.tauKillSec} s`),
      prow("Decided by", p.decidedBy),
    ],
    { x: M, y: 1.5, w: 6.3, colW: [3.6, 2.7], rowH: 0.62, fontFace: FONT, fontSize: 14, fill: { color: C.surface }, border: { type: "solid", pt: 0.75, color: C.grid }, valign: "middle", objectName: "a2-params" },
  );
  a2.addTable(
    [
      [{ text: "Volatility (per year)", options: { bold: true, color: C.ink, fill: { color: C.surface2 } } }, { text: "Fee (healthy desk)", options: { bold: true, color: C.ink, fill: { color: C.surface2 } } }],
      ...schedule.map((x) => [{ text: `${x.sigmaPct}%`, options: { color: C.ink } }, { text: `${x.feeBp.toFixed(2)} bp`, options: { color: C.amber, bold: true } }]),
    ],
    { x: 7.4, y: 1.5, w: 5.33, colW: [2.8, 2.53], rowH: 0.55, fontFace: FONT, fontSize: 14, fill: { color: C.surface }, border: { type: "solid", pt: 0.75, color: C.grid }, valign: "middle", objectName: "a2-schedule" },
  );

  const a3 = content(pres, "Appendix", "Model control");
  const ctrl = [
    "Count X arbitraged blocks out of N; under the model X follows a binomial law with probability P*.",
    "Kupiec (1995) test: LR = −2·ln[(1−P*)^(N−X)·P*^X] + 2·ln[(1−p̂)^(N−X)·p̂^X], compared with χ²(1).",
    "Arbitrage arrives in clusters: after an arbitraged block, the next one is arbitraged far more often. Textbook Basel traffic-light zones (BCBS, January 1996) assume independent exceptions, so they flag a correct model too often.",
    "Our alert thresholds are computed by simulating the model, and a severity check compares realized losses per arbitrage with the model.",
    "In red, the desk raises the model-risk multiplier k = clamp(σ_arb / σ̂, 1, 2): it can only make the fee more prudent.",
  ];
  a3.addText(
    ctrl.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < ctrl.length - 1 } })),
    { x: M, y: 1.45, w: 12.1, h: 5.2, fontFace: FONT, fontSize: 17, color: C.ink, paraSpaceAfter: 12, valign: "top", margin: 0, isTextBox: true, objectName: "a3-control" },
  );

  const a4 = content(pres, "Appendix", "Full demo (3 minutes)");
  videoOrMissing(pres, a4, { path: video.full, cover: video.coverFull, x: 1.87, y: 1.35, w: 9.6, h: 5.4, name: "a4-video" });

  const a5 = content(pres, "Appendix", "References");
  const refs = [
    "Milionis, Moallemi, Roughgarden, Zhang (2022). Automated Market Making and Loss-Versus-Rebalancing. arXiv:2208.06046.",
    "Milionis, Moallemi, Roughgarden (2023). Automated Market Making and Arbitrage Profits in the Presence of Fees. arXiv:2305.14604.",
    "Nezlobin, Tassy (2025). Loss-Versus-Rebalancing under Deterministic and Generalized Block-Times. arXiv:2505.05113.",
    "Campbell, Bergault, Milionis, Nutz (2025). Optimal Fees for Liquidity Provision in Automated Market Makers. arXiv:2508.08152.",
    "Loesch, Hindman, Richardson, Welch (2021). Impermanent Loss in Uniswap v3. arXiv:2111.09192.",
    "Kupiec (1995). Techniques for Verifying the Accuracy of Risk Measurement Models. Journal of Derivatives 3(2), 73-84.",
    "Basel Committee (1996). Supervisory framework for the use of backtesting in conjunction with the internal models approach.",
    "Uniswap v4 core (LPFeeLibrary, PoolManager); OpenZeppelin uniswap-hooks (BaseOverrideFee); Chainlink CRE docs and cre-templates.",
  ];
  a5.addText(
    refs.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < refs.length - 1 } })),
    { x: M, y: 1.45, w: 12.1, h: 5.2, fontFace: FONT, fontSize: 14, color: C.ink, paraSpaceAfter: 8, valign: "top", margin: 0, isTextBox: true, objectName: "a5-refs" },
  );
}
