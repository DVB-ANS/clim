// Renders the generated blocks of README.md. Every number shown to judges comes from a JSON input, never typed by hand.
import { collectAddresses } from "./inputs.mjs";
import { feePips, sigmaE9FromAnnual, pipsToBp, floorCrossoverAnnual, annualFromSigmaE9 } from "./fee.mjs";
import { replayStats, severityRange, validationFacts, usdPerMillion, replayChoiceNote, mainScenarioGainPct } from "./lab.mjs";

export const ETHERSCAN = "https://sepolia.etherscan.io";
export const SOURCIFY_REPO = "https://repo.sourcify.dev/11155111";
const SCHEDULE_SIGMAS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.25];

const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const signedPct = (x) => `${x > 0 ? "+" : ""}${x.toFixed(1)}%`;
const signedPct2 = (x) => `${x > 0 ? "+" : ""}${x.toFixed(2)}%`;
const bp = (pips) => `${pipsToBp(pips).toFixed(2)} bp`;
const short = (hex) => `${hex.slice(0, 6)}…${hex.slice(-4)}`;
const shortHex = (hex) => `${hex.slice(0, 10)}…${hex.slice(-4)}`;
const utc = (unix) => new Date(unix * 1000).toISOString().slice(0, 19).replace("T", " ");

export function pending(source) {
  return `_Pending: generated from \`${source}\` at submission._`;
}

export function link(url, text) {
  return url ? `**[${text}](${url})**` : `**${text}** _(added at submission)_`;
}

// Until docs/evidence/ exists (plan 06 Task 13), "CRE evidence" points to the evidence section of cre/README.md.
export function renderLinks(links, { evidenceReady = false } = {}) {
  return [
    link(links.liveUrl, "Open the dashboard"),
    link(links.videoUrl, "Video demo"),
    link(links.deckUrl, "Deck"),
    link(evidenceReady ? "docs/evidence/" : "cre/README.md#evidence", "CRE evidence"),
    link("docs/feedback/cre-devex-report.md", "CRE DevEx report"),
    link("docs/feedback/cre-friction-log.md", "CRE friction log"),
  ].join(" · ");
}

// Human labels for the keys of shared/deployments/sepolia.json, grouped and in display order: [key, label, role].
// An address under a key not listed here is still shown, under "Other", with its raw key.
const DEPLOYMENT_GROUPS = [
  ["clim", [
    ["riskDesks.live", "`RiskDesk` (live)", "receives the CRE report every 30 s"],
    ["hooks.live", "`ClimHook` (live)", "prices every swap of the live clim pool from the live desk"],
    ["riskDesks.replay", "`RiskDesk` (replay)", "received the CRE reports of the 4 February 2026 storm, replayed (459 reports, the last at 20:58 UTC on 2026-10-06); flagged REPLAY"],
    ["hooks.replay", "`ClimHook` (replay)", "prices every swap of the replay clim pool from the replay desk"],
    ["riskDesks.don", "`RiskDesk` (DON)", "for reports from a CRE DON through the `KeystoneForwarder`"],
  ]],
  ["Uniswap v4", [
    ["uniswap.poolManager", "`PoolManager`", "the v4 singleton; calls the hook on every swap"],
    ["uniswap.stateView", "`StateView`", "pool state reads"],
    ["uniswap.poolSwapTest", "`PoolSwapTest`", "test swap router, used by the retail bot"],
    ["uniswap.poolModifyLiquidityTest", "`PoolModifyLiquidityTest`", "test liquidity router"],
  ]],
  ["Chainlink", [
    ["cre.mockForwarder", "`MockKeystoneForwarder`", "delivers `cre workflow simulate --broadcast` reports; checks no signature"],
    ["cre.keystoneForwarder", "`KeystoneForwarder`", "delivers DON reports; checks the DON's signatures"],
  ]],
  ["Test tokens and bots", [
    ["tokens.tETH.address", "`tETH`", "test ETH with a public faucet"],
    ["tokens.tUSD.address", "`tUSD`", "test USD with a public faucet"],
    ["routers.arb", "`PoolSwapTest` (arbitrage)", "the arbitrage bot's own router, so its swaps can be told apart"],
    ["deployer", "Operator", "deployer, owner of both desks, the live desk's `simOperator` (the only accepted sender of its simulated reports), test-token owner"],
  ]],
];

const POOL_LABELS = {
  "pools.liveV": "clim pool (live)",
  "pools.liveS": "fixed-fee twin (live)",
  "pools.replayV": "clim pool (replay)",
  "pools.replayS": "fixed-fee twin (replay)",
};
const DYNAMIC_FEE_FLAG = 0x800000;

// clim's own contracts whose source is verified on Sourcify, at the level "match" (partial: metadata hash differs),
// checked with https://sourcify.dev/server/v2/contract/11155111/<address> on 2026-10-06. The Uniswap and Chainlink
// contracts are their authors' deployments; the arbitrage router (Uniswap's unmodified PoolSwapTest, not verified)
// and the operator have no Sourcify link.
const SOURCIFY_VERIFIED = new Set(["riskDesks.live", "hooks.live", "riskDesks.replay", "hooks.replay", "tokens.tETH.address", "tokens.tUSD.address"]);

export function renderDeployments(deployments) {
  const { addresses, poolIds } = collectAddresses(deployments);
  const byKey = new Map(addresses.map((a) => [a.label, a.address]));
  const known = new Set();
  const groups = DEPLOYMENT_GROUPS.map(([group, entries]) => [
    group,
    entries.flatMap(([key, label, role]) => {
      known.add(key);
      return byKey.has(key) ? [{ label, address: byKey.get(key), role, verified: SOURCIFY_VERIFIED.has(key) }] : [];
    }),
  ]);
  groups.push(["Other", addresses.filter((a) => !known.has(a.label)).map((a) => ({ label: `\`${a.label}\``, address: a.address, role: "", verified: false }))]);
  const rows = groups.flatMap(([group, items]) =>
    items.map((x, i) => `| ${i === 0 ? `**${group}**` : ""} | ${x.label} | [\`${shortHex(x.address)}\`](${ETHERSCAN}/address/${x.address}) | ${x.verified ? `[Sourcify](${SOURCIFY_REPO}/${x.address})` : ""} | ${x.role} |`),
  );
  const chain = deployments.chainId ? ` (chain id ${deployments.chainId})` : "";
  const out = [
    `Everything runs on Ethereum Sepolia${chain}. Each address links to Etherscan. The source of clim's own contracts (both desks, both hooks, tETH and tUSD) is verified on Sourcify; the arbitrage router is Uniswap's unmodified \`PoolSwapTest\`.`,
    "",
    "| | Contract | Address | Source | Role |",
    "|---|---|---|---|---|",
    ...rows,
  ];
  if (poolIds.length) {
    const at = (path) => path.split(".").reduce((o, k) => o?.[k], deployments);
    const feeOf = (fee) => (fee === DYNAMIC_FEE_FLAG ? "dynamic: set by `ClimHook` on every swap" : Number.isInteger(fee) ? `${bp(fee)}, fixed` : "-");
    out.push(
      "",
      "| Pool | LP fee | PoolId |",
      "|---|---|---|",
      ...poolIds.map((p) => `| ${POOL_LABELS[p.label] ?? `\`${p.label}\``} | ${feeOf(at(p.label)?.key?.fee)} | \`${shortHex(p.poolId)}\` |`),
    );
  }
  out.push("", "The canonical set, with full addresses, pool keys and pool ids, lives in [`shared/deployments/sepolia.json`](shared/deployments/sepolia.json).");
  return out.join("\n");
}

export function renderParams(params) {
  return [
    "| Parameter | Value | Meaning |",
    "|---|---|---|",
    `| P* | ${pct(params.pStar, 0)} | Target share of blocks that get arbitraged once the fee is above the floor |`,
    `| eta (\`etaE4\`) | ${(params.etaE4 / 1e4).toFixed(4)} (\`${params.etaE4}\`) | Fee in standard deviations of the half-block price move: 1/P* - 0.824 |`,
    `| sqrt(blockTime/2) (\`sqrtHalfDtE6\`) | ${(params.sqrtHalfDtE6 / 1e6).toFixed(6)} (\`${params.sqrtHalfDtE6}\`) | Sepolia, 12 s blocks |`,
    `| Floor (\`feeMinPips\`) | ${bp(params.feeMinPips)} (\`${params.feeMinPips}\`) | The pair's market fee tier |`,
    `| Cap (\`feeMaxPips\`) | ${bp(params.feeMaxPips)} (\`${params.feeMaxPips}\`) | Hard ceiling |`,
    `| Safe fee (\`feeSafePips\`) | ${bp(params.feeSafePips)} (\`${params.feeSafePips}\`) | Minimum fee when the desk is blind or degraded |`,
    `| Kill delay (\`tauKillSec\`) | ${params.tauKillSec} s | A desk silent for longer than this is treated as blind |`,
    "",
    `Decided by: ${params.decidedBy}. These values are immutable constructor arguments of the deployed hook.`,
  ].join("\n");
}

export function renderFeeSchedule(params) {
  const rows = SCHEDULE_SIGMAS.map((s) => {
    const fee = feePips(sigmaE9FromAnnual(s), params.etaE4, params.sqrtHalfDtE6, 10_000, params.feeMinPips, params.feeMaxPips);
    return `| ${pct(s, 0)} | ${bp(fee)} |`;
  });
  return [
    "| ETH volatility (annualized) | Fee charged on every swap (healthy desk, k = 1) |",
    "|---|---|",
    ...rows,
    "",
    `The fee sits at the ${bp(params.feeMinPips)} floor up to about ${pct(floorCrossoverAnnual(params), 0)} annualized volatility, then rises in proportion to volatility. If the desk is blind (silent for more than ${params.tauKillSec} s) or degraded (venues disagree by more than 25 bp), the fee is at least ${bp(params.feeSafePips)}.`,
  ].join("\n");
}

export function renderResults(backtest, replay, validation) {
  const periods = backtest.periods;
  const r = replayStats(replay, backtest);
  const g = backtest.lpGainPctPerYear;
  const main = mainScenarioGainPct(backtest);
  const sev = severityRange(backtest);
  const share = backtest.inPoolVolGainSharePct;
  const row = (label, fmt) => `| ${label} | ${periods.map(fmt).join(" | ")} |`;
  const model = validation
    ? (() => {
        const v = validationFacts(validation);
        return ` In the two 1 s windows the observed share of arbitraged blocks lands within ${v.maxGapPct}% of the prediction, but the gap is statistically significant (${v.pText}, thresholds simulated from the model because arbitrage comes in clusters).`;
      })()
    : "";
  return [
    `Numbers computed by the lab at P* = ${pct(backtest.pStar, 0)}, floor ${backtest.feeMinBp} bp (lab output generated ${backtest.generatedAt}).`,
    "",
    `| | ${periods.map((x) => x.label).join(" | ")} |`,
    `|---|${periods.map(() => "---").join("|")}|`,
    row("LP losses to arbitrage vs a fixed-fee pool, **same average fee**", (x) => signedPct(x.equalTimeAvgFee.arbChangePct)),
    row("LP losses to arbitrage vs a fixed-fee pool, **same cost to traders**", (x) => signedPct(x.equalTraderCost.arbChangePct)),
    row("Share of blocks arbitraged, predicted / observed", (x) => `${pct(x.pTrade.predicted)} / ${pct(x.pTrade.observed)}`),
    "",
    `**Replay of the 4 February 2026 storm** (${r.window}): volatility ${r.sigmaMinPct}% → ${r.sigmaMaxPct}%, clim's fee ${r.feeVMinBp} → ${r.feeVMaxBp} bp, LP losses to arbitrage ${signedPct(r.arbChangePct)} against a fixed ${r.feeSBp} bp pool with the same average fee; share of the clim pool's blocks arbitraged, predicted / observed: ${pct(r.pTradePredicted)} / ${pct(r.pTradeObserved)}. ${replayChoiceNote(r, backtest.pStar)}`,
    "",
    `**LP gain in the lab's one-year backtest (not a forecast):** ${signedPct2(g.low)} to ${signedPct2(g.high)} of capital per year (${usdPerMillion(g.low)} to ${usdPerMillion(g.high)} a year per $1M of liquidity; ${g.note}). In the main scenario (an aggregator routes retail between clim and a deeper 5 bp pool), ${main === null ? `about ${Math.round(g.top5WeeksSharePct)}% of ETH's gain` : `ETH gains ${signedPct2(main)} a year, about ${Math.round(g.top5WeeksSharePct)}% of it`} earned in the five stormiest weeks of the year; the same scenario on an asset twice as volatile (the same year with every return doubled) gains ${signedPct2(g.volatileAssetHigh)}. It is insurance, not a steady yield.`,
    "",
    `**Where the model is weak:** it predicts how often arbitrage happens, not how much it costs: in the lab's backtests, losses to arbitrage run ${sev[0].toFixed(2)} to ${sev[1].toFixed(2)} times the model's estimate.${model} A volatility measured inside the pool itself would capture ${Math.round(share.low)}% to ${Math.round(share.high)}% of the same gain (see "Why Chainlink CRE"${share.high > 100 ? "; above 100% means the in-pool estimate did slightly better in one sample" : ""}).`,
  ].join("\n");
}

export function renderEvidence(evidence) {
  const out = [`Collected ${evidence.collectedAt} from Sepolia blocks ${evidence.fromBlock} to ${evidence.toBlock} (\`RiskReported\` events).`];
  for (const desk of evidence.desks) {
    const latest = [...desk.reports].sort((a, b) => b.seq - a.seq).slice(0, 5);
    out.push(
      "",
      `**\`${desk.label}\`** [\`${desk.address}\`](${ETHERSCAN}/address/${desk.address}): ${desk.reports.length} reports written by the CRE workflow. Latest ${latest.length}:`,
      "",
      "| seq | Observed (UTC) | Volatility applied (annualized) | Venues | Dispersion | Transaction |",
      "|---|---|---|---|---|---|",
      ...latest.map((x) => `| ${x.seq} | ${utc(x.tObs)} | ${pct(annualFromSigmaE9(x.sigmaApplied))} | ${x.nSources} | ${x.dispBp} bp | [\`${short(x.txHash)}\`](${ETHERSCAN}/tx/${x.txHash}) |`),
    );
  }
  out.push("", "Raw `cre workflow simulate` transcripts are in [docs/evidence](docs/evidence/).");
  return out.join("\n");
}

export function renderTeam(team) {
  const profiles = (m) => [m.github && `[GitHub](https://github.com/${m.github})`, m.linkedin && `[LinkedIn](${m.linkedin})`].filter(Boolean).join(" · ") || "-";
  return ["| | Role | |", "|---|---|---|", ...team.map((m) => `| **${m.name}** | ${m.role} | ${profiles(m)} |`)].join("\n");
}

const SOURCES = {
  links: "docs/submission/links.json",
  results: "lab/out/backtest-summary.json, lab/out/replay-2026-02-04.json and lab/out/validation.json",
  params: "shared/params.json",
  "fee-schedule": "shared/params.json",
  deployments: "shared/deployments/sepolia.json",
  evidence: "docs/evidence/cre-reports-sepolia.json",
  team: "docs/submission/team.json",
};

export function renderAll({ deployments, params, backtest, replay, validation, links, evidence, team }) {
  return {
    links: links ? renderLinks(links, { evidenceReady: Boolean(evidence) }) : pending(SOURCES.links),
    results: backtest && replay ? renderResults(backtest, replay, validation) : pending(SOURCES.results),
    params: params ? renderParams(params) : pending(SOURCES.params),
    "fee-schedule": params ? renderFeeSchedule(params) : pending(SOURCES["fee-schedule"]),
    deployments: deployments ? renderDeployments(deployments) : pending(SOURCES.deployments),
    evidence: evidence ? renderEvidence(evidence) : pending(SOURCES.evidence),
    team: team ? renderTeam(team) : pending(SOURCES.team),
  };
}

export function replaceBlock(text, name, body) {
  const begin = `<!-- clim:begin ${name} -->`;
  const end = `<!-- clim:end ${name} -->`;
  const i = text.indexOf(begin);
  const j = text.indexOf(end);
  if (i < 0 || j < i) throw new Error(`README is missing the markers for block "${name}"`);
  return `${text.slice(0, i + begin.length)}\n${body}\n${text.slice(j)}`;
}
