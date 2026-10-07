// Rewrites the generated blocks of README.md from the JSON inputs. Usage: node src/update-readme.mjs [--allow-missing]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { P } from "./paths.mjs";
import { readJson, check, schemaErrors, provisionalErrors, PARAMS_SPEC, BACKTEST_SPEC, BACKTEST_SCHEMA, REPLAY_SPEC, REPLAY_SCHEMA, VALIDATION_SPEC, VALIDATION_SCHEMA, LINKS_SPEC, TEAM_SPEC, EVIDENCE_SPEC } from "./inputs.mjs";
import { renderAll, replaceBlock } from "./readme-blocks.mjs";

const allowMissing = process.argv.includes("--allow-missing");
const load = (file) => (existsSync(file) ? readJson(file) : null);
const inputs = {
  deployments: load(P.deployments),
  params: load(P.params),
  backtest: load(P.backtest),
  replay: load(P.replay),
  validation: load(P.validation),
  links: load(P.links),
  evidence: load(P.evidence),
  team: load(P.team),
  replayDesk: load(P.replayDesk),
};

if (inputs.params && provisionalErrors(inputs.params).length) {
  if (!allowMissing) {
    console.error(provisionalErrors(inputs.params)[0]);
    process.exit(1);
  }
  inputs.params = null; // a draft shows the parameters as pending rather than provisional values
}
const missing = Object.entries(inputs).filter(([, v]) => v === null).map(([k]) => k);
if (missing.length && !allowMissing) {
  console.error(`Missing inputs: ${missing.join(", ")}. Run "npm run check" for the file list, or pass --allow-missing for a draft.`);
  process.exit(1);
}
const specs = { params: PARAMS_SPEC, backtest: BACKTEST_SPEC, replay: REPLAY_SPEC, validation: VALIDATION_SPEC, links: LINKS_SPEC, evidence: EVIDENCE_SPEC, team: TEAM_SPEC };
const invalid = [
  ...Object.entries(specs).flatMap(([k, spec]) => (inputs[k] ? check(spec, inputs[k], k) : [])),
  ...(inputs.backtest ? schemaErrors(inputs.backtest, BACKTEST_SCHEMA) : []),
  ...(inputs.replay ? schemaErrors(inputs.replay, REPLAY_SCHEMA) : []),
  ...(inputs.validation ? schemaErrors(inputs.validation, VALIDATION_SCHEMA) : []),
];
if (invalid.length) {
  console.error(`Invalid inputs:\n  - ${invalid.join("\n  - ")}`);
  process.exit(1);
}

let readme = readFileSync(P.readme, "utf8");
const blocks = renderAll(inputs);
for (const [name, body] of Object.entries(blocks)) readme = replaceBlock(readme, name, body);
writeFileSync(P.readme, readme);
console.log(`README.md updated: ${Object.keys(blocks).join(", ")}${missing.length ? ` (pending: ${missing.join(", ")})` : ""}`);
