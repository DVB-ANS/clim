# Chainlink CRE developer experience report: clim

From Sofiane Ben Taleb ([@gamween](https://github.com/gamween), DeVinci Blockchain), who built [clim](https://github.com/DVB-ANS/clim) solo at TOKEN2049 Origins (Singapore, October 2026). The report follows the format of Chainlink's hackathon template: what worked well, what was confusing or difficult, and what we suggest. The top asks come first. Every row number refers to the full [friction log](cre-friction-log.md).

| | |
|---|---|
| CRE CLI | v1.37.0 |
| TypeScript SDK | `@chainlink/cre-sdk` 1.23.0, Bun 1.3.9 |
| Host | macOS |
| Chain | Ethereum Sepolia, through `MockKeystoneForwarder` `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |
| Mode | Simulation only: `cre workflow simulate --broadcast` (single node, mock forwarder). DON deploy access was requested on 2026-10-06 at 22:56 SGT with `cre account access` and not granted during the hackathon (`cre whoami` still printed `Deploy Access: Not enabled` on 2026-10-07), so the DON deployment was cut (row 6). |
| AI tooling | We did not use the `cre-skills` skill, so this report has no feedback on it. |

**Context.** clim's risk desk is one CRE workflow (cron every 30 s, six HTTP sources per node, a quorum of 3 venues out of 4, median consensus on each field, a signed report, `EVMClient.writeReport`) that feeds a Uniswap v4 hook on Sepolia. In simulation, the operator key submits each report through `MockKeystoneForwarder`. On a DON, reports would come only through `KeystoneForwarder`: once the expected workflow ID is pinned, simulation disabled and ownership renounced, no single key can write the desk.

- From 16:33 to 19:37 UTC on 2026-10-06, our loop recorded 637 `simulate --broadcast` runs on two desks (334 live, 303 replay).
- 630 runs landed: the forwarder's `ReportProcessed` was true and the desk's `RiskReported` was in the same receipt. That is 621 runs recorded with their receipt, plus 9 runs recorded without a receipt, whose receipts we re-read (they lost their last log line, row 22).
- The other 7: 5 credential failures (row 24), 1 run with a quorum of 2 venues out of 4 and no report, and 1 run lost to our own network.
- At 20:32 UTC on 2026-10-06, the live desk had 451 reports (`RiskDesk.state().seq` on `0xCDbfd6b9C0b97A8eE31706c6CDE5E54B4954334F`, read with `cast`).
- Transaction lists and CLI excerpts: [cre-loop-evidence.md](cre-loop-evidence.md). The run log, [`bots/out/cre-runs.jsonl`](../../bots/out/cre-runs.jsonl), is committed with the evidence (plan 06 Task 13), with the workflow's own log lines (`[USER LOG]`) from a few `simulate` runs in [`docs/evidence/`](../evidence/); the CLI's full output stays local.

## What worked well

1. **Installing and setting up CRE.** In the builder's own words, the whole install and setup flow is well done and the docs are complete: the CLI installer, `cre login`, `cre templates list` and the cre-templates starters (our `ReceiverTemplate` is the circuit-breaker starter's copy) took us to a first dry run on day one, with every step we needed in the docs. The few setup gaps are small and logged: the installer prints the wrong binary path (row 18), the Markdown export and `llms-full.txt` leave the version string empty (row 15), and `cre init`, simulation and the access request need a prior `cre login` (rows 13, 16 and 17). Our project follows the layout `cre init -t hello-world-ts` produces, written by hand because we scaffolded before logging in (row 13). The pages that disagree with the CLI further on, in simulation and listen mode, are ask 5.
2. **The consensus API worked the first time.** `ConsensusAggregationByFields` with `median` on each of the seven observation fields is the whole consensus step (`cre/risk-desk/workflow.ts`). `workflow.ts` has a single commit (`dfda1e3`): the first dry run passed on both handlers (cron and HTTP), and the same code then landed 630 of the 637 recorded runs. In simulation the aggregation runs on one node; it has not run on a DON yet.
3. **`simulate --broadcast` gave us a live product without a DON.** It writes real Sepolia transactions through the `MockKeystoneForwarder` already deployed there, so a 30 s loop (`cre/scripts/sim-loop.sh`) fed two `RiskDesk` contracts that a Uniswap v4 hook reads on every swap. First report: tx [`0x6046552302b7711c4987ee7706d957538dc11ee77ca557b18c92261154e21cb6`](https://sepolia.etherscan.io/tx/0x6046552302b7711c4987ee7706d957538dc11ee77ca557b18c92261154e21cb6), 272,704 gas under the workflow's 500,000 `gasLimit`; the hook left blind mode on the next quote (`quoteFee()` 500 pips).
4. **Build once, then `simulate --wasm`.** The loop never recompiles: a dry run takes 2 to 4 s from start to `Execution finished`, against 6.7 s for our first dry run, WASM compilation included (session log of 2026-10-06). `cre workflow build` also works without `cre login`.
5. **The HTTP capability.** `sendRequest` hands back a pending result, so the workflow sends its six requests per node before it reads any reply (`sendAll` in `cre/risk-desk/venues.ts`): a dry run with one source stuck on our 8 s timeout still took 9 s. In simulation it also reached our local replay server with no tunnel, so the same workflow replayed the 4 February 2026 storm to a second desk (303 of the 637 runs).
6. **`ReceiverTemplate`.** `RiskDesk` inherits the circuit-breaker starter's copy (cre-templates `d0223f3`, MIT), so the forwarder check, the optional workflow identity checks and their owner setters came ready-made. `setForwarderAddress` moves the desk from the mock forwarder to `KeystoneForwarder` without a redeploy (`test_OwnerCanRotateTheForwarder` in `contracts/test/RiskDesk.t.sol`).
7. **The SDK test runtime and capability mocks.** `@chainlink/cre-sdk/test` (`newTestRuntime` with a `timeProvider`, `HttpActionsMock`, `EvmMock`) runs the whole `onTick` offline on captured responses of the six sources, including a dry run, a REVERTED receiver status and a failed quorum. 8 of the 39 tests in `cre/risk-desk` use it; `bun test` passes 39 of 39.

## Top 5 asks

### 1. A rejected report looks like a success (rows 9 and 10)

- **Problem.** With `--broadcast`, `WriteReportReply.receiverContractExecutionStatus` is SUCCESS whenever the forwarder transaction is mined, so the workflow cannot tell an accepted report from a rejected one. The docs already say the status is always SUCCESS in simulation, but the reason they give is not what happens.
  - The "Simulation vs production" note of the [Onchain Write overview](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/overview-ts) (TypeScript and Go versions, last updated 2026-09-18) says: "`cre workflow simulate` uses a **MockForwarder** that records the report but does **not** call your consumer contract's `onReport()`. As a result, `receiverContractExecutionStatus` is always `SUCCESS` in simulation."
  - The mock does call `onReport` (chainlink-evm `contracts/cre/src/dev/MockKeystoneForwarder.sol`, `route`; our Sepolia fork test). When the consumer reverts, the mock does not revert: it emits `ReportProcessed(..., false)`. The outcome is in the receipt, so the simulator could return REVERTED at little cost.
  - The note's advice is to deploy with `cre workflow deploy` to observe real reverts. That needs deploy access, which was not granted to us during the hackathon (row 6).
  - The dry run has the same blind spot, and the note does not mention it: it `eth_call`s the mock forwarder, which swallows the consumer's revert.
  - cre-cli issue [#393](https://github.com/smartcontractkit/cre-cli/issues/393), "Auto-deploy MockKeystoneForwarder for experimental chains during simulation", hit the same blind spot from another side: a simulation that "appeared to succeed (returned a tx hash)" while delivery silently failed, found only by inspecting `ReportProcessed`.
- **Repro (cre v1.37.0, Sepolia).**
  - Forwarder side: call `MockKeystoneForwarder.report(<consumer>, <rawReport>, 0x, [])` with a report the consumer rejects. In clim, `cd bots && bun run forge-report --pair live` does this from a key that `RiskDesk` refuses. The receipt has status 1 and `ReportProcessed` false.
  - Dry run: `cre workflow simulate risk-desk --non-interactive --trigger-index 0 --target staging-settings` with the receiver set to `0x000000000000000000000000000000000000dEaD`, which has no code on Sepolia. The reply has `txStatus` SUCCESS, receiver status SUCCESS and no tx hash (`dryRunWriteReport` in chainlink `core/capabilities/fakes/evm_chain.go` at `aa2a70309776`, the version cre-cli v1.37.0 pins; `tx_hash` is optional in the SDK). clim prints its own zero default (`reply.txHash ?? new Uint8Array(32)`) in its log line `Write report transaction succeeded: 0x000…000` (`cre/risk-desk/workflow.ts`, in the format the CRE docs and templates use).
- **Evidence.**
  - Forged report from a throwaway key: tx [`0x34ee46a6947d2831fdb3e5a09f831008589efd9cf099f61dca86dc4cdadc53d9`](https://sepolia.etherscan.io/tx/0x34ee46a6947d2831fdb3e5a09f831008589efd9cf099f61dca86dc4cdadc53d9). Status 1, `ReportProcessed` false, no `RiskReported`, desk unchanged.
  - `forge-report` demo: tx [`0xadc28d17bde52a6b38627ed734783924876454005b6a7c5e7b3fda49f1fa6c02`](https://sepolia.etherscan.io/tx/0xadc28d17bde52a6b38627ed734783924876454005b6a7c5e7b3fda49f1fa6c02), recorded as `txStatus` success, `forwarderResult` false, `riskReportedInTx` 0.
  - The same behavior on a Sepolia fork: `contracts/test/fork/MockForwarder.fork.t.sol`.
  - What our workaround costs: 36 of the 637 runs logged `NOT APPLIED`, yet each receipt shows `ReportProcessed` true and a `RiskReported` event (list in [cre-loop-evidence.md](cre-loop-evidence.md)). The workflow's read-back of `RiskDesk.state()` at `latest` had hit a lagging node of a load-balanced public RPC.
- **Ask.**
  - Decode `ReportProcessed` in the simulator's EVM chain and return REVERTED when its result is false.
  - Let the dry run call the consumer itself, or `eth_call` the mock's `route()`, which returns the delivery result, instead of `report()`, which returns nothing.
  - Correct the reason in the "Simulation vs production" note (the mock calls `onReport` and records the outcome in `ReportProcessed`), and add the dry-run caveat.
- **Our workaround.**
  - The workflow re-reads `RiskDesk.state()` after each write and returns `OK`, `NOT_APPLIED` or `SENT`.
  - Since 18:47 UTC on 2026-10-06, our loop recorder ignores the workflow's verdict and classifies each run from the receipt: `ReportProcessed.result` plus a `RiskReported` event in the same transaction.

### 2. ReceiverTemplate expects 62 bytes of metadata, forwarders send 64 (row 23)

- **Problem.** cre-templates `d0223f3`, still the head of `main` on 2026-10-06, has a `ReceiverTemplate.sol` under `starter-templates/sports-resolution/` that requires `metadata.length == 62` (`METADATA_LENGTH = 62`). `KeystoneForwarder` and `MockKeystoneForwarder` pass `rawReport[45:109]`, which is 64 bytes: workflow id 32, name 10, owner 20, report id 2.
  - Once `setExpectedWorkflowId`, `setExpectedAuthor` or `setExpectedWorkflowName` is set, every report reverts with `InvalidMetadataLength(64, 62)`.
  - The CRE docs already describe this. "Building Consumer Contracts", section [Metadata length and layout](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts#metadata-length-and-layout), says: "In production delivery, `metadata.length` is 64. A `require(metadata.length == 62)` (or similar) in your own code will revert; the sample `ReceiverTemplate` does not enforce length 62 on `metadata`." It recommends allowing 64, or both 62 and 64. The sports-resolution copy does enforce 62.
  - The same docs say to leave the identity checks off in simulation. A team therefore first switches them on after deploying to a DON, and every report then fails, visible only after deployment.
  - The other starter templates (circuit-breaker, event-reactor, and others) have no length check.
- **Repro (cre-templates `d0223f3`, Foundry).** `cd contracts && forge test --match-path test/ReceiverTemplateMetadata.t.sol`. The test builds a consumer on the sports-resolution `ReceiverTemplate`, copied unmodified into `contracts/test/fixtures/sports-resolution/` (MIT), and delivers reports the way the forwarders do (`onReport(rawReport[45:109], rawReport[109:])`):
  1. with no identity check, the 64-byte metadata goes through;
  2. after `setExpectedWorkflowId` or `setExpectedAuthor`, the same delivery reverts with `InvalidMetadataLength(64, 62)`;
  3. the same identity in 62 bytes (without the report id) is accepted, so only the length check fails;
  4. with `SEPOLIA_RPC_URL` set, a fork test against the deployed `MockKeystoneForwarder` shows that it passes those 64 bytes, and that with the workflow id check on, the report is dropped (`ReportProcessed` false, see ask 1).
- **Evidence.** All 5 tests pass (forge 1.4.2, 2026-10-06), the fork test included. There is no transaction, because we never deployed that variant.
- **Ask.** Align the template with your docs: set `METADATA_LENGTH` to 64 (or accept both 62 and 64, as the docs suggest) and add a test that uses real forwarder metadata. We can open this PR on `smartcontractkit/cre-templates`, with the test above. We found no existing issue or PR for it.
- **Our workaround.** We copied the circuit-breaker variant of `ReceiverTemplate`, which has no length check.

### 3. In simulation, anyone can push a report through the mock forwarder (row 1)

- **Problem.** `cre workflow simulate` runs a single node, so consensus is never exercised. With `--broadcast` on Sepolia, the report goes through `MockKeystoneForwarder` (`0x15fC6ae953E024d975e77382eEeC56A9101f9F88`).
  - The mock checks no signatures, and its `report()` is permissionless, so a third party can push a report into a consumer during a public demo.
  - The simulator also writes placeholder workflow metadata (workflow CID `0x11…11`, owner `0xaa…aa`), so workflow identity checks cannot help in simulation either.
  - One node also hid the hardest part of our design: fitting several nodes' fetches and their median inside each 30 s cron cycle. We could not measure it, so we sized it blind (row 5). A single node keeps the cadence but loses the decentralization that is the point of a DON.
- **Repro (cre v1.37.0, Sepolia).** Send `report()` to the mock from any funded key with a well-formed raw report. `cd bots && bun run forge-report --pair live` does this against clim's live desk.
- **Evidence.**
  - Our Sepolia fork test (`contracts/test/fork/MockForwarder.fork.t.sol`): `report()` is permissionless, and the consumer sees `msg.sender` = the mock and `tx.origin` = the sender.
  - On Sepolia, `simulate --broadcast` sends `report()` from the `CRE_ETH_PRIVATE_KEY` account straight to the mock. Our first report, tx [`0x6046552302b7711c4987ee7706d957538dc11ee77ca557b18c92261154e21cb6`](https://sepolia.etherscan.io/tx/0x6046552302b7711c4987ee7706d957538dc11ee77ca557b18c92261154e21cb6), comes from our operator key.
  - The forged report in tx [`0x34ee46a6947d2831fdb3e5a09f831008589efd9cf099f61dca86dc4cdadc53d9`](https://sepolia.etherscan.io/tx/0x34ee46a6947d2831fdb3e5a09f831008589efd9cf099f61dca86dc4cdadc53d9) was stopped only by our own guard.
- **Ask.** A multi-node local simulation mode, or a mock forwarder that checks signatures from a local key set. A multi-node mode would also let a team measure its median's latency inside a 30 s cron (row 5). We found no issue that covers it, so it goes as a new issue.
- **Our workaround.**
  - `RiskDesk` accepts a simulated report only when `tx.origin` is our operator key (`simOperator`), and it bounds how far volatility can move between two reports.
  - The demo shows a forged report being ignored.
  - On a DON, the owner points the desk at `KeystoneForwarder`, pins the expected workflow ID, calls `disableSim()` and renounces ownership; until then the owner key can still re-point the forwarder.

### 4. A long-running simulation as the demo backend (rows 3, 6, 22, 24, 25, 26)

- **Problem.** Without deploy access, a `simulate --broadcast` loop was the only way to run a live product on CRE. We ran two loops for hours, one per desk. The six issues in the table below made them fragile.
- **Repro (cre v1.37.0).** From `cre/`, run `scripts/sim-loop.sh staging-settings --broadcast` and `ENV_FILE=.env.replay scripts/sim-loop.sh replay-settings --broadcast`. The script runs `cre workflow build` once, then `cre workflow simulate risk-desk --wasm <abs path> --non-interactive --trigger-index 0 --target <target> --broadcast` every 30 s.
- **Evidence, ask and workaround, per row.** The first-413 counts cover the first 413 recorded runs on 2026-10-06. Excerpts for rows 22, 24 and 25 are in [cre-loop-evidence.md](cre-loop-evidence.md).

| Row | Problem | Evidence | Ask | Our workaround |
|---|---|---|---|---|
| 3 | A cron trigger fires once per `simulate` run. `--listen` keeps a process alive for HTTP and log triggers, not cron. | A 30 s cadence needs a shell loop (`cre/scripts/sim-loop.sh`). | A `--watch` / `--loop` mode for cron workflows. | Build once, then `simulate --wasm` every 30 s. |
| 24 | `simulate` validates the CLI credentials against the CRE API on every run. | 5 of the first 413 runs stopped before simulating: `✗ Credential validation failed`, then `✗ authentication required: credential validation failed: authentication failed: unable to retrieve organization info. ...`. Three times with no network error; once followed by `Post "https://api.cre.chain.link/graphql": net/http: TLS handshake timeout`; once followed by `Post "https://api.cre.chain.link/graphql": dial tcp: lookup api.cre.chain.link: no such host`, while our own network was down. Again on 2026-10-07, while our network failed twice, 27 live runs that started from 04:30:19 to 04:39:50 and from 04:44:22 to 04:47:56 UTC stopped at this check (24 with `no such host`, 3 with `TLS handshake timeout`). The live desk went silent, and the hook quoted its 30 bp safe fee from 04:33:00 to 04:40:24 and from 04:48:12 to 04:48:36 UTC; one retail swap paid it. Later on 2026-10-07, outside the outage, 14 more live runs stopped at this check (to 11:38 UTC; 41 on 2026-10-07 in all): 6 with `Post "https://api.cre.chain.link/graphql": context deadline exceeded` (10:17 to 11:19 UTC, with our network up: api.cre.chain.link answered a plain curl at 10:29, so the API was reachable but slow), 3 with a TLS handshake timeout or a connection reset (03:00 to 03:11), 1 with `no such host` (03:18) and 4 with no network error (00:31, 03:06, 09:32, 10:41). After the failures at 10:27 and 10:28 the live desk went 167 s without a new report (seq 2059 observed at 10:27:25, seq 2060 mined at 10:30:12 UTC, block time), 13 s short of blind mode. | Cache the validated credentials for local simulation, or let simulation run offline. | The recorder logs the run as `error` (`CRE CLI credential validation failed`); the next run comes 30 s later. |
| 25 | `cre workflow build` always writes the same temporary file, `<workflow>/.cre_build_tmp.wasm`. | We restarted our live and replay loops (different targets) in the same second: `✗ failed to compile workflow: failed to compile workflow: open .../cre/risk-desk/.cre_build_tmp.wasm: no such file or directory`. | A unique temporary file per build, or a lock. | Start the loops a few seconds apart. |
| 26 | The simulator can crash inside wasmtime-go. | One live run on 2026-10-07 (05:57:03 UTC) printed `runtime: bad pointer in frame github.com/bytecodealliance/wasmtime-go/v47.goTrampolineWrap ...` and `fatal error: invalid pointer found on stack`, then a goroutine dump, before any workflow log line: once in 2,706 recorded runs (to 11:38 UTC on 2026-10-07). | Look into the fault; until then, print a one-line simulator error before the dump. | The recorder logs the run as `error`; the next run, 30 s later, went through. |
| 22 | The workflow's last `[USER LOG]` line can be lost at shutdown. | In 7 of the first 413 runs the result was `OK` but clim's `REPORT applied` line never printed, each time with `context canceled` at shutdown; one more `NOT_APPLIED` run lost its line too. All 11 such runs in the 637-run snapshot (9 `OK`, 2 `NOT_APPLIED`) landed on chain. In `--listen`, run 1's last line printed after run 2's banner. | Flush the workflow's logs before printing the result and the next banner. | The recorder keeps the hash from clim's earlier `Write report transaction succeeded: 0x...` line and checks the receipt. |
| 6 | Deploying to a DON needs approval, with an unknown delay during a 36 h hackathon. | Requested on 2026-10-06 at 22:56 SGT: `Access request submitted successfully!`. `cre whoami` still said `Deploy Access: Not enabled` on 2026-10-07, so the DON deployment was cut for the hackathon. | A hackathon fast track. | Simulation plus the `tx.origin` guard (ask 3). |

### 5. Docs and messages that disagree with the CLI (rows 2, 11, 12, 15, 18, 27)

- **Problem.** The pages and messages below describe something other than what cre v1.37.0 or the deployed contracts do. We found the gaps by trying the commands or by reading the source.
- **Repro (cre v1.37.0).** Start listen mode with `cre workflow simulate risk-desk --wasm <abs path> --listen --non-interactive --trigger-index 1 --http-payload '{}' --target staging-settings`. Then POST to `http://localhost:2000`, to `http://localhost:2000/trigger`, and twice 1 s apart.
- **Per row:** what the docs or messages say, what happens, our ask and our workaround.

| Row | The docs or messages say | What happens | Ask | Our workaround |
|---|---|---|---|---|
| 11 | "Testing HTTP Triggers in Simulation": POST the raw JSON to `http://localhost:2000`. | A POST to `http://localhost:2000` (or `/`) answers `404 page not found`. `POST /trigger` with `{"input":{}}` runs the workflow. Without `--http-payload`, non-interactive listen stops with `✗ --http-payload is required for http-trigger@1.0.0-alpha in non-interactive mode`. | Align the page with the code. | `POST /trigger`. |
| 12 | Nothing next to `--listen` about rate limits. | The simulator enforces the production HTTP-trigger rate. Two POSTs 1 s apart both got 200, but the second logged `Trigger rate limited, skipping execution trigger=http-trigger@1.0.0-alpha limit=HTTP trigger rate limited: every30s:1`. The empty 200 does not tell the caller that the run was skipped. | Mention it next to `--listen`, with `--limits none`, which lifts it. | `--limits none`. |
| 2 | The "Simulation vs production" note of the [Onchain Write overview](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/overview-ts) (TypeScript and Go versions): the MockForwarder "records the report but does **not** call your consumer contract's `onReport()`", given as the reason the status is always SUCCESS. | The mock's source calls it (chainlink-evm `contracts/cre/src/dev/MockKeystoneForwarder.sol`, `route`). On a Sepolia fork, the deployed "MockKeystoneForwarder 1.0.0" calls `onReport` with `msg.sender` = the mock and records the outcome in `ReportProcessed`. | Correct the reason and add the dry-run caveat (ask 1). | We read the source and tested on a fork. |
| 15 | The Markdown export of the macOS/Linux install page, [`cli-installation/macos-linux.md`](https://docs.chain.link/cre/getting-started/cli-installation/macos-linux.md) (lines 7, 44 and 199): "The recommended version at the time of writing is ****." and the expected output "CRE CLI version ". | The version variable renders empty in the export. The HTML page renders it (v1.36.0). AI agents get the same empty strings from [`cre/ts/llms-full.txt`](https://docs.chain.link/cre/ts/llms-full.txt) (lines 1586, 1623 and 1778), which `cre/llms.txt` links; the Windows page has the same gap there (lines 1817 and 1853). | Render the variable in the Markdown exports and `llms-full.txt` too. | Read the HTML page. |
| 18 | `install.sh` prints "cre was installed successfully to ~/.cre/cre". | The binary is `~/.cre/bin/cre`. The installer adds that folder to PATH in the rc file of the user's shell (`~/.zshrc` on our zsh Mac; bash and fish files otherwise), which agent shells do not re-read. | Print the real path, and mention a symlink on an existing PATH folder for non-interactive shells. | That symlink. |
| 27 | After an HTTP 429 from the chain RPC, the CLI adds: `This limit mirrors a production constraint. Use 'cre workflow limits export' to customize limits, or --limits=none to disable.` | The 429 came from our public Sepolia RPC (publicnode's `Rate limit exceeded`, JSON-RPC error -32005), not from one of the simulator's limits; 4 live runs failed this way on 2026-10-07 (05:15, 09:27, 11:04 and 11:17 UTC). | Show the hint only for the simulator's own limits, and name the endpoint that answered 429. | The recorder logs the run as `error`; the next run comes 30 s later. |

## Everything else

Rows marked "from docs reading, not verified" were written during the design phase, before any code ran.

| Row | Area | What we hit | Suggestion | Status |
|---|---|---|---|---|
| 4 | Stateless executions | No state carries over between executions, so a rolling metric (15-minute realized volatility) refetches its history every run. | A small key-value state between executions, or a documented pattern. | Observed: our workflow refetches 20 minutes of one-minute candles from each of the four venues on every run (`cre/risk-desk/venues.ts`) |
| 5 | Quotas and latency | The quotas are documented; end-to-end latency (trigger to consensus to on-chain inclusion) is not. Measured in simulation, from observation time (tObs) to the Sepolia block: median 14 s, p90 25 s over 211 live reports, last 600 blocks to about 18:40 UTC on 2026-10-06 (`cre/README.md`; an earlier sample of 13 reports gave 11 s and 16 s). The hardest part of our design was fitting several nodes' fetches and their median inside each 30 s cron cycle: with one simulated node (row 1) and no DON (row 6), the median across nodes and its latency were never exercised, and we sized it blind (six requests per node sent at once, an 8 s timeout per source). A single node keeps the cadence but loses the decentralization that is the point of a DON. | Publish typical end-to-end latency per network, including DON latency figures for a cron workflow with HTTP fetches and consensus, by DON size; or a local multi-node simulation mode (ask 3). | Quotas confirmed; latency measured in simulation only; the multi-node median inside a 30 s cron untested |
| 7 | Network coverage | The docs list Robinhood Chain as testnet only (2026-09-18), while our first target DEX is live on its mainnet. | Roadmap visibility for new networks. | From docs reading, not verified |
| 8 | Node egress | Builders cannot know where DON nodes run, and some APIs geo-block (Binance answers HTTP 451 to US IPs). From our single machine, Binance dropped out in 2 of 226 live runs. | Document egress regions or recommend fallbacks. | From docs reading, not verified on a DON |
| 13 | CLI auth | `cre init` and `cre workflow simulate` need `cre login`, while `cre templates list` and `cre workflow build` do not, so teammates without an account cannot simulate. | Allow an offline dry-run simulation, or say in the install guide that an account is needed. | Observed (v1.37.0) |
| 14 | SDK exports | `TxStatus` is exported from `@chainlink/cre-sdk`; `ReceiverContractExecutionStatus` is only reachable through `@chainlink/cre-sdk/pb` (`EVM_PB`). | Export it next to `TxStatus`. | Observed (SDK 1.23.0) |
| 16 | Access request before login | `cre account access` before `cre login` fails with "unable to retrieve organization info. Your account may not be fully set up yet ...", then `TLS handshake timeout`. It reads like a server-side account problem. | Detect missing credentials first and say "run `cre login`". | Observed (v1.37.0) |
| 17 | Non-interactive access request | Without a TTY, `cre account access` fails with `huh: could not open a new TTY: open /dev/tty: device not configured`. No flag covers the confirmation or the use-case text. | Flags such as `--yes --use-case "..."`. | Observed (v1.37.0) |
| 19 | Simulator log times | Log times are local time with a `Z` suffix. On a Mac set to UTC+8, a run at 15:55:36 UTC printed `2026-10-06T23:55:36Z`. | Print UTC, or the real offset. Workaround: `TZ=UTC`. | Observed (v1.37.0) |
| 20 | Simulator paths | `build -o` resolves a relative path from the current directory, but `simulate --wasm` resolves it from the workflow folder. The error (`--wasm must be a valid existing file: ./risk-desk/binary.wasm`) does not say which base it used. | Resolve `--wasm` like `-o`, or print the resolved path. Workaround: an absolute path. | Observed (v1.37.0) |
| 21 | Listen mode shutdown | After SIGTERM the listen-mode simulator released port 2000 but stayed alive, silent, for about 17 s before exiting; 2 of 3 stops lingered. | Exit promptly, or print what it is waiting for. | Observed (v1.37.0) |

## Full log and next steps

- **Full log:** [docs/feedback/cre-friction-log.md](cre-friction-log.md), 27 rows with the full repro details. Loop evidence: [docs/feedback/cre-loop-evidence.md](cre-loop-evidence.md).
- **Before filing, we will re-check each item on the latest CLI and send them one at a time:**
  - **Pull request:** row 23 to `smartcontractkit/cre-templates`, aligning the sports-resolution template with the docs (`METADATA_LENGTH` 64), with the forge test from `contracts/test/ReceiverTemplateMetadata.t.sol`.
  - **Issues on `smartcontractkit/cre-cli`:**
    - rows 9 and 10 (ask 1), citing #393 as related;
    - rows 3, 22, 24, 25 and 26 (ask 4);
    - row 1 (ask 3), as a new issue;
    - then rows 13, 16, 17, 19, 20, 21 and 27.
  - **Issue on `smartcontractkit/cre-sdk-typescript`:** row 14.
  - **Issues on `smartcontractkit/documentation`:** rows 2 (the "Simulation vs production" note), 11, 12, 15 (the Markdown export) and 18, using its `bug_report` and `enhance` templates. We can follow with docs pull requests if they are welcome.
  - **Questions for the CRE team, not bugs:** rows 4, 5, 7 and 8. Row 6 is a request.
- **Contact:** Sofiane Ben Taleb, [@gamween](https://github.com/gamween). Repo: https://github.com/DVB-ANS/clim. The workflow is in `cre/risk-desk`.
