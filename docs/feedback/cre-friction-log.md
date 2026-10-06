# Chainlink CRE friction log

Developer-experience notes for the Chainlink team, written while building clim. Each entry: what we tried, what happened, what would help. Entries marked *(design phase)* come from reading the docs and templates before writing code. Confirm or correct them during the build.

| # | Area | What we hit | Suggestion | Status |
|---|---|---|---|---|
| 1 | Simulation trust model | `cre workflow simulate` runs a single node, so no real consensus. With `--broadcast` on Sepolia, the report goes through `MockKeystoneForwarder` (0x15fC6ae953E024d975e77382eEeC56A9101f9F88), which skips signature checks: anyone can push a report to a consumer during a demo. | A multi-node local simulation mode, or a mock forwarder that verifies signatures from a local key set. | design phase, to confirm |
| 2 | Docs | One docs page says the mock forwarder does not call the consumer's `onReport`, while the mock's source does call it. | Align the docs with the code. | design phase, to confirm |
| 3 | Periodic workflows in simulation | A cron trigger fires once per `simulate` run. Demoing a 30 s cadence needs a shell loop, and each run recompiles. | A `--watch` / `--loop` mode for cron workflows. | design phase, to confirm |
| 4 | Stateless executions | No state between executions. A rolling metric (15-minute realized volatility) must refetch history every run or read state back from chain. | A small key-value state between executions, or a documented pattern. | design phase |
| 5 | Quotas and latency | Cron minimum interval 30 s, 15 HTTP calls per execution. End-to-end latency (trigger → consensus → on-chain inclusion) is not documented. | Publish typical end-to-end latency per network. | design phase |
| 6 | Deploy access | Deploying to a DON needs approval (`cre account access`), with unknown delay during a 36 h hackathon. | A hackathon fast track. | design phase |
| 7 | Network coverage | Robinhood Chain is testnet-only in the docs (2026-09-18), where our first target DEX is live on mainnet. | Roadmap visibility for new networks. | design phase |
| 8 | Node egress | Builders cannot know where DON nodes run. Some APIs geo-block (Binance returns HTTP 451 to US IPs). | Document egress regions or recommend fallbacks. | design phase |
