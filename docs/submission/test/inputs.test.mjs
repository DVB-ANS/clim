import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson, check, schemaErrors, provisionalErrors, PARAMS_SPEC, BACKTEST_SPEC, BACKTEST_SCHEMA, REPLAY_SPEC, REPLAY_SCHEMA, VALIDATION_SPEC, VALIDATION_SCHEMA, LINKS_SPEC, TEAM_SPEC, EVIDENCE_SPEC, linkErrors, collectAddresses, deskAddresses } from "../src/inputs.mjs";

const fx = (name) => readJson(new URL(`./fixtures/${name}`, import.meta.url));

test("fixtures satisfy every spec", () => {
  assert.deepEqual(check(PARAMS_SPEC, fx("params.json")), []);
  assert.deepEqual(check(BACKTEST_SPEC, fx("backtest-summary.json")), []);
  assert.deepEqual(schemaErrors(fx("backtest-summary.json"), BACKTEST_SCHEMA), []);
  assert.deepEqual(check(REPLAY_SPEC, fx("replay.json")), []);
  assert.deepEqual(schemaErrors(fx("replay.json"), REPLAY_SCHEMA), []);
  assert.deepEqual(check(VALIDATION_SPEC, fx("validation.json")), []);
  assert.deepEqual(schemaErrors(fx("validation.json"), VALIDATION_SCHEMA), []);
  assert.deepEqual(check(LINKS_SPEC, fx("links.json")), []);
  assert.deepEqual(check(EVIDENCE_SPEC, fx("evidence.json")), []);
  assert.deepEqual(check(TEAM_SPEC, fx("team.json")), []);
});

test("check reports the exact path of a wrong field", () => {
  const bad = { ...fx("params.json"), etaE4: 2.5 };
  assert.deepEqual(check(PARAMS_SPEC, bad), ["$.etaE4: expected integer, got 2.5"]);
});

test("the two fields plan 06 adds to the backtest summary are required", () => {
  const bad = fx("backtest-summary.json");
  delete bad.inPoolVolGainSharePct;
  assert.deepEqual(check(BACKTEST_SPEC, bad), ["$.inPoolVolGainSharePct: expected object"]);
});

test("provisional parameters are refused", () => {
  assert.deepEqual(provisionalErrors(fx("params.json")), []);
  assert.deepEqual(provisionalErrors({ ...fx("params.json"), decidedBy: "PROVISIONAL: bootstrap" }), ["params.decidedBy is PROVISIONAL: the lab has not decided P* yet"]);
});

test("schemaErrors names the expected schema", () => {
  assert.deepEqual(schemaErrors({ schema: "x" }, REPLAY_SCHEMA), ['schema must be "clim.lab.replay/1", got "x"']);
});

test("final link check requires https URLs", () => {
  assert.deepEqual(linkErrors(fx("links.json"), { final: false }), []);
  assert.equal(linkErrors(fx("links.json"), { final: true }).length, 3);
});

test("collectAddresses walks any shape, dedupes addresses, finds pool ids", () => {
  const { addresses, poolIds } = collectAddresses(fx("sepolia.json"));
  assert.deepEqual(addresses.map((a) => a.label), [
    "uniswap.poolManager",
    "uniswap.stateView",
    "cre.mockForwarder",
    "cre.keystoneForwarder",
    "tokens.tETH.address",
    "tokens.tUSD.address",
    "riskDesks.live",
    "hooks.live",
  ]);
  assert.deepEqual(poolIds, [{ label: "pools.liveV", poolId: "0x" + "a".repeat(64) }]);
});

test("deskAddresses keeps labels that contain desk", () => {
  assert.deepEqual(deskAddresses(fx("sepolia.json")), [
    { label: "riskDesks.live", address: "0x3333333333333333333333333333333333333333" },
  ]);
});
