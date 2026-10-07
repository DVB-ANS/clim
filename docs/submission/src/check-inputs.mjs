// Prints OK / MISSING / INVALID for every input of the README generator (deck v2 is checked by deck/build-deck.mjs, which reads deck/v2/slides.json and live.json). Usage: node src/check-inputs.mjs [--final]
import { existsSync } from "node:fs";
import path from "node:path";
import { P, REPO_ROOT } from "./paths.mjs";
import { readJson, check, schemaErrors, provisionalErrors, PARAMS_SPEC, BACKTEST_SPEC, BACKTEST_SCHEMA, REPLAY_SPEC, REPLAY_SCHEMA, VALIDATION_SPEC, VALIDATION_SCHEMA, LINKS_SPEC, TEAM_SPEC, EVIDENCE_SPEC, linkErrors, collectAddresses, deskAddresses } from "./inputs.mjs";

const final = process.argv.includes("--final");
const items = [
  [P.deployments, (d) => [
    ...(collectAddresses(d).addresses.length ? [] : ["no 0x address found"]),
    ...(deskAddresses(d).length ? [] : ["no address under a key containing 'desk'"]),
  ]],
  [P.replayDesk, (d) => (/^0x[0-9a-fA-F]{40}$/.test(d.simOperator ?? "") ? [] : ["simOperator: not a 0x address"])],
  [P.params, (d) => [...check(PARAMS_SPEC, d), ...provisionalErrors(d)]],
  [P.backtest, (d) => [...schemaErrors(d, BACKTEST_SCHEMA), ...check(BACKTEST_SPEC, d)]],
  [P.replay, (d) => [...schemaErrors(d, REPLAY_SCHEMA), ...check(REPLAY_SPEC, d)]],
  [P.validation, (d) => [...schemaErrors(d, VALIDATION_SCHEMA), ...check(VALIDATION_SPEC, d)]],
  [P.links, (d) => [...check(LINKS_SPEC, d), ...linkErrors(d, { final })]],
  [P.team, (d) => check(TEAM_SPEC, d)],
  [P.evidence, (d) => check(EVIDENCE_SPEC, d)],
];

let bad = 0;
for (const [file, validate] of items) {
  const name = path.relative(REPO_ROOT, file);
  if (!existsSync(file)) {
    bad++;
    console.log(`MISSING ${name}`);
    continue;
  }
  let errors;
  try {
    errors = validate(readJson(file));
  } catch (e) {
    errors = [`cannot parse: ${e.message}`];
  }
  if (errors.length) {
    bad++;
    console.log(`INVALID ${name}`);
    for (const e of errors) console.log(`  - ${e}`);
  } else {
    console.log(`OK      ${name}`);
  }
}
process.exit(bad ? 1 : 0);
