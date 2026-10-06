import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../src/inputs.mjs";
import { renderLinks, renderDeployments, renderParams, renderFeeSchedule, renderResults, renderEvidence, renderTeam, renderAll, replaceBlock } from "../src/readme-blocks.mjs";

const fx = (name) => readJson(new URL(`./fixtures/${name}`, import.meta.url));

test("links: one bold row, empty URLs marked, the CRE documents linked", () => {
  const out = renderLinks({ ...fx("links.json"), liveUrl: "https://clim.example" });
  assert.equal(out.split("\n").length, 1);
  assert.match(out, /^\*\*\[Open the dashboard\]\(https:\/\/clim\.example\)\*\* · /);
  assert.match(out, / · \*\*Video demo\*\* _\(added at submission\)_ · \*\*Deck\*\* _\(added at submission\)_ · /);
  assert.match(out, /\*\*\[CRE evidence\]\(docs\/evidence\/\)\*\*/);
  assert.match(out, /\*\*\[CRE DevEx report\]\(docs\/feedback\/cre-devex-report\.md\)\*\*/);
  assert.match(out, /\*\*\[CRE friction log\]\(docs\/feedback\/cre-friction-log\.md\)\*\*$/);
});

test("deployments: human labels, grouped, truncated Etherscan links, pools with their fee", () => {
  const out = renderDeployments(fx("sepolia.json"));
  assert.match(out, /^Everything runs on Ethereum Sepolia \(chain id 11155111\)\./);
  assert.match(out, /\| \*\*clim\*\* \| `RiskDesk` \(live\) \| \[`0x33333333…3333`\]\(https:\/\/sepolia\.etherscan\.io\/address\/0x3333333333333333333333333333333333333333\) \|/);
  assert.match(out, /\| \*\*Uniswap v4\*\* \| `PoolManager` \| \[`0xE03A1074…3543`\]\(https:\/\/sepolia\.etherscan\.io\/address\/0xE03A1074c86CFeDd5C142C4F04F1a1536e203543\) \|/);
  assert.match(out, /\|  \| `StateView` \|/);
  const order = ["**clim**", "**Uniswap v4**", "**Chainlink**", "**Test tokens and bots**"].map((g) => out.indexOf(g));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), `groups out of order: ${order}`);
  assert.equal(out.split("\n").filter((l) => l.includes("etherscan")).length, 8);
  assert.doesNotMatch(out, /\*\*Other\*\*|riskDesks\.|tokens\./);
  assert.match(out, /\| clim pool \(live\) \| dynamic: set by `ClimHook` on every swap \| `0xaaaaaaaa…aaaa` \|/);
  assert.match(out, /lives in \[`shared\/deployments\/sepolia\.json`\]\(shared\/deployments\/sepolia\.json\)\.$/);
});

test("deployments: unknown keys still listed, fixed-fee twins show their fee", () => {
  const d = fx("sepolia.json");
  d.deployer = "0x5555555555555555555555555555555555555555";
  d.extra = { thing: "0x6666666666666666666666666666666666666666" };
  d.pools.liveS = { key: { ...d.pools.liveV.key, hooks: "0x0000000000000000000000000000000000000000", fee: 511 }, poolId: "0x" + "b".repeat(64) };
  const out = renderDeployments(d);
  assert.match(out, /\| Operator \| \[`0x55555555…5555`\]/);
  assert.match(out, /\| \*\*Other\*\* \| `extra\.thing` \| \[`0x66666666…6666`\]/);
  assert.ok(out.indexOf("**Other**") > out.indexOf("**Test tokens and bots**"));
  assert.match(out, /\| fixed-fee twin \(live\) \| 5\.11 bp, fixed \| `0xbbbbbbbb…bbbb` \|/);
  assert.doesNotMatch(out, /0x0000000000/);
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
  assert.match(out, /\+0\.10% to \+0\.50% of capital per year \(\$1,000 to \$5,000 a year per \$1M of liquidity; full-range ETH LP\), and \+1\.00% in the main scenario on an asset twice as volatile \(the same year with every return doubled\)/);
  assert.match(out, /with about 53% of it earned/);
  assert.match(out, /1\.29 to 1\.33 times above the model/);
  assert.match(out, /lands within 10% of the prediction, but the gap is statistically significant \(p < 0\.0005/);
  assert.match(out, /capture 54% to 103% of the same gain \(see "Why Chainlink CRE"; above 100% means the in-pool estimate did slightly better in one sample\)/);
  assert.doesNotMatch(out, /\d\.\d{3,}%/);
});

test("team table: bold names, role, GitHub and LinkedIn when known", () => {
  const out = renderTeam([
    ...fx("team.json"),
    { name: "Second Member", github: "second", linkedin: "https://www.linkedin.com/in/second/", role: "Lab" },
    { name: "No Handle", github: "", role: "Design" },
  ]);
  assert.match(out, /^\| \| Role \| \|\n\|---\|---\|---\|/);
  assert.match(out, /\| \*\*Test Member\*\* \| Design, contracts, CRE workflow, lab, dashboard \| \[GitHub\]\(https:\/\/github\.com\/test-member\) \|/);
  assert.match(out, /\| \*\*Second Member\*\* \| Lab \| \[GitHub\]\(https:\/\/github\.com\/second\) · \[LinkedIn\]\(https:\/\/www\.linkedin\.com\/in\/second\/\) \|/);
  assert.match(out, /\| \*\*No Handle\*\* \| Design \| - \|$/);
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
