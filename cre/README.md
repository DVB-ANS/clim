# clim risk desk (Chainlink CRE workflow)

The risk desk is the CRE half of clim. Every 30 seconds it measures ETH realized volatility on four venues, requires at least three of them to agree, takes the median of each field with the CRE consensus API and writes a report to `RiskDesk.onReport` on Ethereum Sepolia. On a DON that report is the median of the nodes' observations, signed by the DON. Today it runs with `cre workflow simulate --broadcast`: one node, and the operator key sends the report through `MockKeystoneForwarder`, which checks no signature (see [Trust model](#trust-model)); DON deploy access was not granted during the hackathon, so it has not run on a DON ([Evidence](#evidence)). The clim Uniswap v4 hook reads `RiskDesk.state()` on every swap and turns sigma into the LP fee. The desk never quotes a price and cannot change the fee formula: it only publishes the volatility the formula uses.

## What one execution does

1. **Trigger.** Cron `*/30 * * * * *` (handler 0) or an HTTP trigger (handler 1, used to drive local simulation). Both run the same `onTick`.
2. **Observe, on every node** (`runInNodeMode`, 6 HTTP calls, sent concurrently):
   - 1-minute ETH candles from Coinbase Advanced (ETH-USD), Kraken (ETHUSD), Binance via `data-api.binance.vision` (ETHUSDT) and Hyperliquid (`candleSnapshot`, ETH perp);
   - Deribit ETH DVOL (diagnostic only);
   - Kraken USDT/USD, to convert Binance's USDT closes to USD.
3. **Estimate, on every node** (`estimator.ts`, pure and unit-tested):
   - a candle counts once its minute has ended (the lab's convention, so a replayed report reproduces the lab's RV15 at the same `tObs`); a venue counts if its last closed candle is at most 120 s old;
   - quorum: at least 3 fresh venues, otherwise the node reports an error and no report is written;
   - `tEnd` is the latest minute closed by at least 3 venues; `p_t` is the cross-venue median close of each minute;
   - `sigma = RV15 = sqrt(sum of the 15 squared one-minute log returns ending at tEnd / 900 s)`, published per square-root second times 1e9 (`sigmaE9`; 48 %/yr is 85,475);
   - `dispBp` is the distance of the farthest venue from the median at `tEnd`, in basis points, rounded up (RiskDesk flags DEGRADED above 25 bp);
   - `refTick = floor(ln(price) / ln(1.0001))`, negated when ETH is the pool's token1 (both test tokens have 18 decimals).
4. **Consensus.** `ConsensusAggregationByFields` with `median` on every field.
5. **Write.** `tObs` is DON time at the start of the execution. The workflow reads `RiskDesk.state()`, skips if the last report is less than 20 s old, then `runtime.report` and `EVMClient.writeReport` deliver the ABI-encoded report:

```solidity
(uint40 tObs, uint32 sigmaE9, uint32 rv15E9, uint16 dvolE2, int24 refTick, uint16 dispBp, uint8 nSources, uint16 kE4, uint8 zone)
```

In this version `sigmaE9 == rv15E9`, `kE4 = 10000` (no model-risk multiplier) and `zone = 0` (the backtest validation runs in the lab, not in CRE). `dvolE2 = 0` means DVOL was unavailable.

6. **Confirm.** Forwarders never revert when the receiver rejects a report, and local simulation then still reports success, so the workflow re-reads `RiskDesk.state()` after the transaction and returns `OK <tx>` (applied), `NOT_APPLIED <tx>` (state unchanged), `SENT <tx>` (state unreadable), `REJECTED <tx>` (receiver reverted, reported by a DON forwarder), `DRY RUN` or `SKIP: <reason>`.

## Trust model

| | Local simulation (`--broadcast`) | Deployed on a CRE DON |
|---|---|---|
| Nodes | one (your machine) | the DON; each node fetches the venues itself |
| Forwarder | `MockKeystoneForwarder` `0x15fC6ae953E024d975e77382eEeC56A9101f9F88`, no signature check | `KeystoneForwarder` `0xF8344CFd5c43616a4366C34E3EEE75af79a74482`, verifies DON signatures |
| What protects RiskDesk | `tx.origin == simOperator` (the key in `cre/.env`; `cre/.env.replay` for the replay desk), plus the sigma envelope | forwarder address and expected workflow ID |

On the live desk the `simOperator` key is also the owner, so in simulation that one key is trusted: it can post any volatility inside the envelope (×2 up, ×0.8 down per report, 10% to 1000% a year), and the hook still clamps the fee between 5 bp and 150 bp. `disableSim()` alone does not end that trust: the owner can point the desk at a forwarder it controls, so the owner key can post reports until ownership is renounced. On a DON the desk would accept only the DON's signed reports: the owner points it at the `KeystoneForwarder` and pins the expected workflow ID (`ReceiverTemplate`'s identity checks), and only then calls `disableSim()` and renounces ownership ([FAQ](../docs/faq.md#can-the-owner-change-the-fee)).

## Run it

Prerequisites: bun 1.3.9, CRE CLI v1.37.0 or newer, `cre login`.

```bash
cd cre/risk-desk && bun install && bun test && bun run typecheck && cd ..
cre workflow build ./risk-desk -o ./risk-desk/binary.wasm         # compile to WASM, no login needed
cre workflow simulate risk-desk --non-interactive --trigger-index 0 --target staging-settings              # dry run
cre workflow simulate risk-desk --non-interactive --trigger-index 0 --target staging-settings --broadcast  # one real report
scripts/sim-loop.sh staging-settings --broadcast                   # smoke loop: one report every 30 s, logs in cre/logs/
ENV_FILE=.env.replay scripts/sim-loop.sh replay-settings --broadcast   # replay desk, with its own operator key
```

Replay mode (`--target replay-settings`, `mode: "replay"`) fetches, for each configured venue, `GET <replayUrl>/venue/<venue>/api/v3/klines?symbol=ETHUSDT&interval=1m&limit=20` from the replay server (`bots/src/replay-server.ts`). The server replays one historical Binance ETHUSDT series (2026-02-04) in Binance kline format, with timestamps shifted to the wall clock. Every venue path returns the same series, so `dispBp = 0`, `dvolE2 = 0` and the reported `nSources` counts venue paths, not independent sources; the replay desk's REPLAY flag discloses this. The report goes to the replay desk. That replay ran once, on 2026-10-06, and is finished ([Evidence](#evidence)).

## Files

| Path | Role |
|---|---|
| `project.yaml` | Targets `staging-settings` (live simulation), `replay-settings`, `production-settings` (DON deployment), Sepolia RPC |
| `risk-desk/workflow.yaml` | Workflow name, entry point and config file per target |
| `risk-desk/main.ts` | Runner entry point |
| `risk-desk/workflow.ts` | Triggers, node-mode observation, consensus, report, write and confirmation |
| `risk-desk/venues.ts` | Venue requests, response parsers, concurrent fetch, replay requests (one Binance-format klines path per venue on the replay server) |
| `risk-desk/estimator.ts` | Pure estimator: normalization, staleness, quorum, per-minute median, RV15, dispersion, tick |
| `risk-desk/report.ts` | Report ABI, encoder and decoder, RiskDesk read ABI |
| `risk-desk/fixtures/` | Real responses of the six sources captured on 2026-10-06 (unit-test inputs) |
| `risk-desk/scripts/` | Fixture capture, config sync from `shared/deployments`, latency measurement |
| `scripts/sim-loop.sh` | CRE-only smoke loop (build once, `simulate --wasm` every 30 s). The demo loop that records receipts is `bots/src/sim-loop.ts`. |

## Sample run (Sepolia, 2026-10-06)

```text
2026-10-06T18:39:52Z [USER LOG] node: sources=coinbase,kraken,binance,hyperliquid n=4 tEnd=1791311880 price=2694.85 rv15=12.4% disp=3bp tick=78994 dvol=47.39
2026-10-06T18:39:52Z [USER LOG] consensus: sigma=12.4%/yr sigmaE9=22120 n=4 disp=3bp tick=78994 dvol=47.39 price=2694.85 tObs=1791311991
2026-10-06T18:39:52Z [USER LOG] desk before: seq=226 tObs=1791311961 sigma=12.3%/yr flags=0
2026-10-06T18:40:00Z [USER LOG] Write report transaction succeeded: 0x43ab32186ed7d970664f5452d5bfcd7b3a2cfe0afb2e44f394a2ffa952b28b99
2026-10-06T18:40:01Z [USER LOG] REPORT applied seq=227 sigmaReported=12.4% sigmaApplied=12.4% flags=0 tx=0x43ab32186ed7d970664f5452d5bfcd7b3a2cfe0afb2e44f394a2ffa952b28b99
```

## Evidence

- Live RiskDesk: https://sepolia.etherscan.io/address/0xCDbfd6b9C0b97A8eE31706c6CDE5E54B4954334F (reports every 30 s from the simulation loop since 2026-10-06 16:26 UTC).
- Replay RiskDesk (REPLAY flag, its own operator key): https://sepolia.etherscan.io/address/0x4b843dc3A7ec6202d2337cdeF8C67a0F10f24746 (the 2026-02-04 storm replayed at wall-clock speed: the loop started at 16:57 UTC on 2026-10-06 and wrote 459 reports, from 17:02 to 20:58 UTC. The replay is finished; since then the replay hook quotes the 30 bp safe fee).
- First simulated report: https://sepolia.etherscan.io/tx/0x6046552302b7711c4987ee7706d957538dc11ee77ca557b18c92261154e21cb6; forged report that the desk ignored: https://sepolia.etherscan.io/tx/0x34ee46a6947d2831fdb3e5a09f831008589efd9cf099f61dca86dc4cdadc53d9 (and https://sepolia.etherscan.io/tx/0xadc28d17bde52a6b38627ed734783924876454005b6a7c5e7b3fda49f1fa6c02 from `bun run forge-report`).
- Report latency, observation time (tObs) to block (the newest closed one-minute candle in a report ends up to 60 s before tObs, so a price move takes longer to reach the fee): median 14 s, p90 25 s over 211 reports on the live desk; median 12 s, p90 21 s over 189 reports on the replay desk (`risk-desk/scripts/latency.ts`, last 600 blocks on 2026-10-06 at about 18:40 UTC).
- DON deployment: not done. DON deploy access was requested on 6 October 2026 at 22:56 SGT (`cre account access`) and not granted during the hackathon (`cre whoami` still printed `Deploy Access: Not enabled` on 7 October), so the DON deployment was cut (friction log row 6). The workflow is written with the CRE consensus API for a DON and has not run on one; it runs in the CRE simulator (one node, `MockKeystoneForwarder`).
