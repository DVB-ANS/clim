// Loaders and structural checks for every input the README and the deck consume.
import { readFileSync } from "node:fs";

export function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

// Spec language: "number" | "int" | "string" | "pair" ([number, number]) | [spec] (non-empty array) | {key: spec}
export function check(spec, value, where = "$") {
  const errors = [];
  walk(spec, value, where, errors);
  return errors;
}

function walk(spec, v, where, errors) {
  if (spec === "number") {
    if (typeof v !== "number" || !Number.isFinite(v)) errors.push(`${where}: expected number, got ${JSON.stringify(v)}`);
    return;
  }
  if (spec === "int") {
    if (!Number.isInteger(v)) errors.push(`${where}: expected integer, got ${JSON.stringify(v)}`);
    return;
  }
  if (spec === "string") {
    if (typeof v !== "string") errors.push(`${where}: expected string, got ${JSON.stringify(v)}`);
    return;
  }
  if (spec === "pair") {
    if (!Array.isArray(v) || v.length !== 2 || !v.every((x) => typeof x === "number")) {
      errors.push(`${where}: expected [number, number], got ${JSON.stringify(v)}`);
    }
    return;
  }
  if (Array.isArray(spec)) {
    if (!Array.isArray(v) || v.length === 0) {
      errors.push(`${where}: expected non-empty array`);
      return;
    }
    v.forEach((item, i) => walk(spec[0], item, `${where}[${i}]`, errors));
    return;
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    errors.push(`${where}: expected object`);
    return;
  }
  for (const [k, sub] of Object.entries(spec)) walk(sub, v[k], `${where}.${k}`, errors);
}

export const PARAMS_SPEC = {
  pStar: "number",
  etaE4: "int",
  sqrtHalfDtE6: "int",
  feeMinPips: "int",
  feeMaxPips: "int",
  feeSafePips: "int",
  tauKillSec: "int",
  decidedBy: "string",
};

// Plan 04 commits a bootstrap params.json whose decidedBy starts with PROVISIONAL until the lab decides P*.
export function provisionalErrors(params) {
  return String(params?.decidedBy ?? "").startsWith("PROVISIONAL") ? ["params.decidedBy is PROVISIONAL: the lab has not decided P* yet"] : [];
}

// Lab outputs: the schemas plan 03 writes (its "Output contracts"), including the fields marked "plan 06" in backtest.
export const BACKTEST_SCHEMA = "clim.lab.backtest/1";
export const REPLAY_SCHEMA = "clim.lab.replay/1";
export const VALIDATION_SCHEMA = "clim.lab.validation/1";

export const BACKTEST_SPEC = {
  schema: "string",
  generatedAt: "string",
  pStar: "number",
  feeMinBp: "number",
  periods: [
    {
      id: "string",
      label: "string",
      source: "string",
      blocks: "int",
      equalTimeAvgFee: { staticFeeBp: "number", dynMeanFeeBp: "number", arbChangePct: "number" },
      equalTraderCost: { staticFeeBp: "number", dynVolWeightedFeeBp: "number", arbChangePct: "number" },
      pTrade: { observed: "number", predicted: "number" },
      arbOverLvr: { observed: "number", model: "number" },
    },
  ],
  replayWindows: [{ id: "string", label: "string", arbChangePct: "number" }],
  replayWindowsMedianPct: "number", // median of the rolling 4 h windows (plan 03 Task 17)
  replayWindowsBetterCount: "int", // windows whose ARB is below the static pool's
  lpGainPctPerYear: { low: "number", high: "number", note: "string", volatileAssetHigh: "number", top5WeeksSharePct: "number" }, // last two: plan 06
  inPoolVolGainSharePct: { low: "number", high: "number" }, // plan 06
};

export const REPLAY_SPEC = {
  schema: "string",
  generatedAt: "string",
  window: { id: "string", label: "string", startUtc: "string", endUtc: "string", source: "string" },
  params: { pStar: "number", etaE4: "int", sqrtHalfDtE6: "int", feeMinPips: "int", feeMaxPips: "int", staticFeePips: "int" },
  units: { arb: "string" },
  points: [{ t: "int", price: "number", sigmaAnnualPct: "number", feeVBp: "number", feeSBp: "number", cumArbV: "number", cumArbS: "number" }],
  summary: { meanFeeVBp: "number", meanFeeSBp: "number", arbV: "number", arbS: "number", arbChangePct: "number", pTradeObsV: "number", pTradePredV: "number", pTradeObsS: "number" },
};

// lab/out/validation.json (plan 03 Task 19): the model check on the two 1 s windows, with simulated alert zones.
export const VALIDATION_SPEC = {
  schema: "string",
  pStar: "number",
  windowBlocks: "int",
  nSimsTotal: "int",
  samples: [
    {
      name: "string",
      blocks: "int",
      pTradeObserved: "number",
      pTradePredicted: "number",
      simPValueTwoSided: "number",
      zones: { simulated: { green: "int", yellow: "int", red: "int" } },
    },
  ],
};

export function schemaErrors(obj, expected) {
  return obj?.schema === expected ? [] : [`schema must be "${expected}", got ${JSON.stringify(obj?.schema)}`];
}

export const TEAM_SPEC = [{ name: "string", github: "string", role: "string" }];

// Optional: `liveMockData: true` while the deployed dashboard still serves fixture data (the README says so next to the link).
export const LINKS_SPEC = { repoUrl: "string", liveUrl: "string", deckUrl: "string", videoUrl: "string" };

export function linkErrors(links, { final }) {
  if (!final) return [];
  return [
    ...Object.keys(LINKS_SPEC)
      .filter((k) => typeof links?.[k] !== "string" || !links[k].startsWith("https://"))
      .map((k) => `links.${k}: must be an https:// URL before submission, got ${JSON.stringify(links?.[k])}`),
    ...(links?.liveMockData ? ["links.liveMockData: the dashboard still serves mock data; wire it to Sepolia (master Task 14) and remove the flag"] : []),
  ];
}

export const REPORT_SPEC = {
  seq: "int",
  txHash: "string",
  blockNumber: "int",
  tObs: "int",
  sigmaApplied: "int",
  sigmaReported: "int",
  nSources: "int",
  dispBp: "int",
};

export const EVIDENCE_SPEC = {
  chainId: "int",
  collectedAt: "string",
  fromBlock: "int",
  toBlock: "int",
  desks: [{ label: "string", address: "string", reports: [REPORT_SPEC] }],
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const ZERO_ADDRESS = /^0x0{40}$/; // e.g. a static pool's `hooks`: not a deployed contract

// Walks any JSON shape. Returns every 20-byte hex value (first label wins per address)
// and every 32-byte hex value stored under a key that contains "poolId".
export function collectAddresses(deployments) {
  const addresses = [];
  const poolIds = [];
  const seen = new Set();
  const visit = (node, segs) => {
    if (typeof node === "string") {
      const label = segs.join(".");
      if (ADDRESS.test(node) && !ZERO_ADDRESS.test(node) && !seen.has(node.toLowerCase())) {
        seen.add(node.toLowerCase());
        addresses.push({ label, address: node });
      } else if (BYTES32.test(node) && /poolid/i.test(String(segs[segs.length - 1]))) {
        poolIds.push({ label: segs.slice(0, -1).join(".") || label, poolId: node });
      }
      return;
    }
    if (Array.isArray(node)) node.forEach((x, i) => visit(x, [...segs, `[${i}]`]));
    else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) visit(v, [...segs, k]);
  };
  visit(deployments, []);
  return { addresses, poolIds };
}

export function deskAddresses(deployments) {
  return collectAddresses(deployments).addresses.filter((a) => /desk/i.test(a.label));
}
