import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../src/inputs.mjs";
import { renderLinks, renderDeployments, renderParams, renderFeeSchedule, renderResults, renderEvidence, renderTeam, renderAll, replaceBlock } from "../src/readme-blocks.mjs";

const fx = (name) => readJson(new URL(`./fixtures/${name}`, import.meta.url));

test("links: empty URLs are marked, present URLs are linked", () => {
  const out = renderLinks({ ...fx("links.json"), liveUrl: "https://clim.example" });
  assert.match(out, /\*\*Live dashboard:\*\* \[open the dashboard\]\(https:\/\/clim\.example\)/);
  assert.match(out, /_watch the 3-minute demo: added at submission_/);
});

test("deployments: one Etherscan row per address and a pool id table", () => {
  const out = renderDeployments(fx("sepolia.json"));
  assert.match(out, /\| `uniswap\.poolManager` \| \[`0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`\]\(https:\/\/sepolia\.etherscan\.io\/address\/0xE03A1074c86CFeDd5C142C4F04F1a1536e203543\) \|/);
  assert.match(out, /\| `pools\.liveV` \| `0xa{64}` \|/);
  assert.equal(out.split("\n").filter((l) => l.includes("etherscan")).length, 8);
});

test("params and fee schedule at P* = 30%", () => {
  const p = fx("params.json");
  assert.match(renderParams(p), /\| P\* \| 30% \|/);
  const s = renderFeeSchedule(p);
  assert.match(s, /\| 25% \| 5\.00 bp \|/);
  assert.match(s, /\| 100% \| 10\.95 bp \|/);
  assert.match(s, /\| 225% \| 24\.63 bp \|/);
  assert.match(s, /floor up to about 46% annualized volatility/);
  assert.match(s, /at least 30\.00 bp/);
});

test("results show both comparisons, the replay and the weak spots, rounded", () => {
  const out = renderResults(fx("backtest-summary.json"), fx("replay.json"), fx("validation.json"));
  assert.match(out, /lab at P\* = 10%, floor 5 bp/);
  assert.match(out, /\| \| Feb 2026 \| Oct 2026 \|/);
  assert.match(out, /same average fee\*\* \| -20\.0% \| -24\.5% \|/);
  assert.match(out, /same cost to traders\*\* \| -14\.0% \| \+7\.0% \|/);
  assert.match(out, /predicted \/ observed \| 10\.0% \/ 8\.0% \| 9\.4% \/ 9\.7% \|/);
  assert.match(out, /\(2026-02-04 12:00 to 16:00 UTC\): volatility 74% → 225%, clim's fee 12 → 128 bp/);
  assert.match(out, /against a fixed 55\.7 bp pool/);
  assert.match(out, /range over the 2 rolling 4 h windows of the storm: -25\.0% to -8\.0%\)/);
  assert.match(out, /it is the most favorable of the 2 rolling 4 h windows of the storm \(median window -16\.5%, 2 of 2 better than the fixed pool\)/);
  assert.match(out, /\+0\.10% to \+0\.50% of capital per year \(\$1,000 to \$5,000 a year per \$1M of liquidity; full-range ETH LP\), up to \+1\.00%/);
  assert.match(out, /with about 53% of it earned/);
  assert.match(out, /1\.29 to 1\.33 times above the model/);
  assert.match(out, /lands within 10% of the prediction, but the gap is statistically significant \(p < 0\.0005/);
  assert.match(out, /capture 54% to 103% of the same gain \(see "Why Chainlink CRE"; above 100% means the in-pool estimate did slightly better in one sample\)/);
  assert.doesNotMatch(out, /\d\.\d{3,}%/);
});

test("team table links GitHub handles", () => {
  const out = renderTeam(fx("team.json"));
  assert.match(out, /\| Test Member \| \[@test-member\]\(https:\/\/github\.com\/test-member\) \|/);
});

test("evidence lists the latest reports newest first", () => {
  const out = renderEvidence(fx("evidence.json"));
  assert.match(out, /2 reports written by the CRE workflow\. Latest 2:/);
  const rows = out.split("\n").filter((l) => l.startsWith("| 2 ") || l.startsWith("| 1 "));
  assert.equal(rows[0].slice(0, 4), "| 2 ");
  assert.match(rows[0], /\| 30\.9% \| 3 \| 4 bp \|/);
});

test("renderAll marks missing inputs as pending", () => {
  const blocks = renderAll({ deployments: null, params: fx("params.json"), backtest: null, replay: null, links: fx("links.json"), evidence: null, team: null });
  assert.match(blocks.deployments, /_Pending: generated from `shared\/deployments\/sepolia\.json` at submission\._/);
  assert.match(blocks.params, /\| P\* \| 30% \|/);
});

test("replaceBlock swaps only the content between markers", () => {
  const text = "a\n<!-- clim:begin x -->\nold\n<!-- clim:end x -->\nb";
  assert.equal(replaceBlock(text, "x", "new"), "a\n<!-- clim:begin x -->\nnew\n<!-- clim:end x -->\nb");
  assert.throws(() => replaceBlock(text, "y", "new"), /missing the markers for block "y"/);
});
