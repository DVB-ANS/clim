// Loads and checks every deck input, and derives the chart series and the fee schedule.
import { existsSync, readFileSync } from "node:fs";
import { readJson, check, schemaErrors, provisionalErrors, PARAMS_SPEC, BACKTEST_SPEC, BACKTEST_SCHEMA, REPLAY_SPEC, REPLAY_SCHEMA, VALIDATION_SPEC, VALIDATION_SCHEMA, LINKS_SPEC, TEAM_SPEC } from "../src/inputs.mjs";
import { feePips, sigmaE9FromAnnual, pipsToBp } from "../src/fee.mjs";
import { replayStats, severityRange, validationFacts } from "../src/lab.mjs";

export const CHART_POINTS = 120;

export function downsample(values, n) {
  if (values.length <= n) return [...values];
  return Array.from({ length: n }, (_, i) => values[Math.round((i * (values.length - 1)) / (n - 1))]);
}

export function hhmm(unix) {
  return new Date(unix * 1000).toISOString().slice(11, 16);
}

export function feeSchedule(params) {
  return [0.25, 0.5, 0.75, 1.0, 1.5, 2.25].map((s) => ({
    sigmaPct: Math.round(s * 100),
    feeBp: pipsToBp(feePips(sigmaE9FromAnnual(s), params.etaE4, params.sqrtHalfDtE6, 10_000, params.feeMinPips, params.feeMaxPips)),
  }));
}

// files: { params, backtest, replay, validation, links, team, videoStage, videoFull, coverStage, coverFull } (paths)
export function loadDeckData(files) {
  const d = {
    params: readJson(files.params),
    backtest: readJson(files.backtest),
    replay: readJson(files.replay),
    validation: readJson(files.validation),
    links: readJson(files.links),
    team: readJson(files.team),
  };
  const errors = [
    ...check(PARAMS_SPEC, d.params, "params"),
    ...provisionalErrors(d.params),
    ...schemaErrors(d.backtest, BACKTEST_SCHEMA),
    ...check(BACKTEST_SPEC, d.backtest, "backtest"),
    ...schemaErrors(d.replay, REPLAY_SCHEMA),
    ...check(REPLAY_SPEC, d.replay, "replay"),
    ...schemaErrors(d.validation, VALIDATION_SCHEMA),
    ...check(VALIDATION_SPEC, d.validation, "validation"),
    ...check(LINKS_SPEC, d.links, "links"),
    ...check(TEAM_SPEC, d.team, "team"),
  ];
  if (errors.length) throw new Error(`deck inputs invalid:\n  - ${errors.join("\n  - ")}`);

  const pts = downsample(d.replay.points, CHART_POINTS);
  d.series = {
    labels: pts.map((x) => hhmm(x.t)),
    sigma: pts.map((x) => x.sigmaAnnualPct),
    feeV: pts.map((x) => x.feeVBp),
    feeS: pts.map((x) => x.feeSBp),
    arbV: pts.map((x) => x.cumArbV),
    arbS: pts.map((x) => x.cumArbS),
  };
  d.stats = replayStats(d.replay, d.backtest);
  d.severity = severityRange(d.backtest);
  d.model = validationFacts(d.validation);
  d.schedule = feeSchedule(d.params);
  const file = (p) => (p && existsSync(p) ? p : null);
  const png = (p) => (file(p) ? `image/png;base64,${readFileSync(p).toString("base64")}` : null);
  d.video = { stage: file(files.videoStage), full: file(files.videoFull), coverStage: png(files.coverStage), coverFull: png(files.coverFull) };
  return d;
}
