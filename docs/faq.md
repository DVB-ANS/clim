# clim · FAQ

Short, verified answers to the questions we get most. The full design is in `docs/superpowers/specs/2026-10-06-clim-design.md`, and section numbers below (§) refer to it. Code facts were checked against the Uniswap and Chainlink source code and on Sepolia on 2026-10-06 (spec, Appendix A).

> **Planning version.** Numbers below come from the design phase and the audit (several at the old P\* = 10 % setting, now superseded by the lab). Master plan Task 1 Step 4 replaces this file with plan 06 Task 11's FAQ, which takes every number from the lab's outputs.

---

## How is the fee computed?

On every swap, the hook computes the fee from one number: the latest volatility σ published on-chain by our Chainlink CRE risk desk.

**1. The desk measures σ.**
- Every 30 s, a CRE workflow fetches 1-minute candles from Coinbase, Kraken, Binance and Hyperliquid and converts them to USD.
- It drops any venue whose last candle is more than 120 s old, and refuses to report with fewer than 3 venues.
- It takes the median price per minute, then the realized volatility over the last 15 minutes (RV15).
- The DON's nodes agree on the median of every field and sign one report. `RiskDesk.sol` receives it through `onReport`.

**2. The hook turns σ into a fee.** The rule is

  fee = clamp( η\* × σ × √(Δt/2), 5 bp, 150 bp ),  with η\* = 1/P\* − 0.824

- √(Δt/2) is half a 12 s block, so σ·√(Δt/2) is the typical price move while the pool waits to be repriced.
- η\* expresses the fee in units of that move, and is chosen so that a target share P\* of blocks gets arbitraged. The formula comes from Milionis, Moallemi and Roughgarden (2023), with the fixed-block correction of Nezlobin and Tassy (2025): P_trade = 1/(η + 0.824).
- P\* is 20% or 30%; the lab decides which before deployment (§2.6).

**3. On-chain, everything is integers.**

  fee_pips = clamp( ceil( sigmaE9 × etaE4 × sqrtHalfDtE6 × kE4 / 10¹⁷ ), 500, 15,000 )

- `sigmaE9` is σ per √second × 10⁹, `etaE4` = η\* × 10⁴, `sqrtHalfDtE6` = 2,449,490, and `kE4` = 10,000.
- 1 bp = 100 pips.

| Volatility (annual) | P\* = 30% | P\* = 20% |
|---|---|---|
| up to 27% | 5 bp | 5 bp |
| 48% | 5.3 bp | 8.8 bp |
| 100% | 11.0 bp | 18.2 bp |
| 225% | 24.6 bp | 41.0 bp |

The 5 bp floor is the usual fee for ETH/USDC, so in calm markets clim charges what the competition charges. It only becomes a toll in a storm: that is the "storm insurance".

**4. Two safety overrides** (§6.6):
- if the desk has been silent for more than 3 minutes (2 in production), or never reported, the fee is at least 30 bp;
- if the venues disagree by more than 25 bp, the fee is also at least 30 bp.

---

## Does the fee change by transaction?

**No transaction ever changes the fee.** The fee is *computed* inside every swap, and nobody sets it.
1. A trader's swap reaches `PoolManager.swap`.
2. Because pool V was created with `ClimHook` and a dynamic fee, the PoolManager calls `ClimHook.beforeSwap`.
3. The hook reads `RiskDesk.state()` (a view call), computes the fee and returns it with Uniswap's `OVERRIDE_FEE_FLAG` (0x400000).
4. The PoolManager uses that fee for this swap only (`Pool.swap`, `src/libraries/Pool.sol` in Uniswap/v4-core) and records it in the `Swap` event's `fee` field.

**So the fee is the same for everyone between two desk reports.**
- Two swaps pay different fees only if a new CRE report was accepted between them (one arrives every 30 s), or if the desk's silence crossed the 3-minute threshold between them.
- Direction, size and splitting a trade make no difference, and neither does manipulating the pool's price.
- The hook never calls `PoolManager.updateDynamicLPFee`: the stored fee of the pool is never used.

---

## Can a live pool change its fee? How would an existing DEX integrate clim?

It depends on how the pool was created. Verified in `Uniswap/v4-core` (`main` and tag v4.0.0) and `Uniswap/v3-core`; details in spec §5.

**Uniswap v3: no.**
- A pool's fee is `immutable` (`UniswapV3Pool.sol`).
- Governance can add new fee tiers and take a share of fees as protocol revenue, but it cannot change what an existing pool charges.
- A new fee means a new pool and moving liquidity.

**Uniswap v4: the pool's key decides, once and for all.**
- A v4 pool *is* its key `(currency0, currency1, fee, tickSpacing, hooks)`, and its ID is the hash of that key. Change the fee field or the hook, and you have a different pool.
- **A static-fee pool can never change its LP fee.** `PoolManager.updateDynamicLPFee` reverts with `UnauthorizedDynamicLPFeeUpdate()` unless the pool was created with the dynamic flag (`fee == 0x800000`), and a hook's fee override is ignored on static pools.
- **A dynamic-fee pool can change its fee, but only through its own hook,** in one of two ways:
  - a per-swap override from `beforeSwap`, which is what clim does;
  - a stored fee set with `updateDynamicLPFee`, callable only when `msg.sender` is the pool's hook. A hook can expose this to a keeper; OpenZeppelin's `BaseDynamicFee._poke` is the standard pattern.
- A pool without a hook cannot be dynamic, and no pool can gain a hook after creation.
- The protocol fee is a separate dial (≤ 0.1% per direction, set by the protocol fee controller) and does not go to LPs.

**How an existing DEX would integrate clim**
1. **Its pools have a static fee.** Create a new dynamic-fee pool with `ClimHook`, or with its own hook reading `RiskDesk`, and migrate liquidity. There is no in-place path.
2. **Its fee is already dynamic and driven by a keeper**, like Fables on Robinhood Chain. In our pre-hack research (2026-09-30), Fables' crypto pools charged a flat fee plus a temporary override posted by a keeper, within a floor and a cap. This needs **no contract change**:
   - their keeper reads `RiskDesk.state()`, applies our formula with their own parameters and posts the result;
   - a keeper runs off-chain, so it can read our desk on whichever chain CRE writes to;
   - step one is "shadow mode": publish our recommended fee next to theirs without acting on it.
3. **It wants the rule enforced on-chain.** Its hook reads `RiskDesk.state()` in `beforeSwap`, like `ClimHook`. If its current hooks are immutable, that means new hooks and new pools.

**clim's own parameters cannot change on a live pool.**
- P\*, the floor, the cap, the safe fee and the silence timeout are immutable constructor arguments of `ClimHook`.
- Changing them means a new hook, a new pool and a liquidity migration.
- This is deliberate: LPs know the exact rule they join, and no admin key can reprice the pool under them.
- What does change continuously is the *input*: σ, every 30 s, from CRE.

---

## Why Chainlink CRE and not Data Feeds, Data Streams, or an on-chain volatility?

**First, the honest answer: accuracy is not the reason.** In our lab, a volatility computed from the pool's own trades captures 85 to 97% of the same gain. The reason is robustness.

**What CRE gives us**
- **Agreement across venues.** σ comes from four exchanges that must agree (quorum of 3, published dispersion), not from the pool. Nobody can move the fee by printing fake trades on the pool.
- **A signed, decentralized measurement.** Each node fetches independently, the DON takes the median of every field, and the forwarder verifies signatures before `onReport` (in production).
- **Custom computation where the data lives.** USD normalization (Binance trades in USDT), freshness checks, quorum, RV15, dispersion and DVOL: none of this exists as an off-the-shelf feed.
- **One figure, many pools and chains.** The same report can be written to every chain CRE supports, so a DEX's off-chain keeper can read it from anywhere.
- **The model is controlled off-chain.** The workflow can run its own model checks and send a model-risk multiplier k ∈ [1, 2], which `RiskDesk` bounds.

**Why not Data Feeds?**
- The ETH/USD price feed on Ethereum mainnet updates on a 0.5% deviation or a 1-hour heartbeat (Chainlink feed directory, 2026-10-06). It is a price, not a volatility, and too coarse to build a 15-minute estimate from.
- Chainlink has also listed ETH-USD *realized volatility* feeds, but their shortest window is 24 hours, with a 1-hour heartbeat. A storm that starts and ends within the hour barely moves a 24-hour number. They are not listed on Ethereum mainnet in the directory. On Sepolia, the ETH-USD 24hr feed (`0x31D04174D0e1643963b38d87f26b0675Bb7dC96e`) last updated on 2024-08-30.

**Why not Data Streams?**
- Data Streams is pull-based: the user fetches a signed report off-chain and submits it on-chain for verification (Chainlink docs, Data Streams architecture). For a fee, that would let the swapper choose which fresh report to bring.
- Its report schemas cover prices and other market data (crypto, exchange rates, RWA, SmartData, tokenized assets). None of them is the 15-minute multi-venue realized volatility clim needs.

**Why not an on-chain volatility?**
- It is computed from the pool's own price, so it can be pushed by trades on the pool itself.
- It is one venue's view.
- It costs gas on every swap.

Meteora's DLMM on Solana does this with a volatility accumulator. It is a valid design, but it is the alternative we chose not to build.

---

## What if the CRE desk goes silent or the venues disagree?

The hook fails safe: it quotes wide.
- **Silent desk.** If no report has ever arrived, or the last one is older than `tauKillSec` (180 s in the hackathon build, 120 s in production), the hook switches to **blind mode**. The fee is max(fee from the last σ, 30 bp). No transaction is needed: the hook compares `block.timestamp` with the report's observation time. When reports resume, the fee returns to normal on the next swap.
- **Venues disagree.** If a venue deviates from the median by more than 25 bp, `RiskDesk` flags the report DEGRADED, and the fee is max(fee, 30 bp).
- **Too few venues.** With fewer than 3 fresh venues, the workflow sends no report at all, so the desk goes blind after the timeout.
- **A bad or forged report** is bounded on-chain.
  - `RiskDesk` rejects reports whose observation time does not advance by at least 20 s, or is more than 30 s in the future, or that have fewer than 3 sources.
  - Each accepted report can at most double σ, or cut it to 80% of its previous value.
  - The fee always stays between 5 bp and 150 bp. The worst a fake "calm" report can do is bring the fee down to the ordinary 5 bp.
- **Visible state.** Anyone can read the hook's current mode with `ClimHook.quoteFee()`: 0 normal, 1 degraded, 2 blind.

**Hackathon caveats** (§6.8)
- `cre workflow simulate` runs a single node, and its `MockKeystoneForwarder` is permissionless and skips signature checks. While simulation mode is on, `RiskDesk` only accepts reports whose transaction was sent by our simulation key (`tx.origin == simOperator`).
- A rejected report does not revert the transaction: the forwarder emits `ReportProcessed(..., false)`, and no `RiskReported` follows. We show this in the demo.
- The desk's owner cannot set σ or the fee. It can still change which forwarder is trusted, which is a trust assumption until ownership is renounced after the switch to the production forwarder.

---

## Why Sepolia and not Solana?

**Why Sepolia**
- **Everything clim needs is there:** Uniswap v4's PoolManager (`0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`, verified on-chain) and CRE support, with both the simulation forwarder and the production `KeystoneForwarder`.
- **Its 12 s blocks make the formula meaningful.** The fee is measured in units of the price move over half a block. On chains with sub-second blocks, the formula's fee falls to the floor unless one calibrates the arbitrageurs' real reaction time.

**Why not Solana**
- **No hooks.** Solana has no Uniswap v4 and no hooks, so we would have to write our own AMM program, which is a different project.
- **The idea is already there.** Meteora's DLMM already charges a volatility-based variable fee, computed on-chain from the pool's own moves.
- **The integration would be shallow,** and the hackathon's partner tracks require the integration to be core.

**Later**
- CRE can write to Solana (write-only today, per Chainlink's supported-networks page of 2026-09-18).
- The same σ could then be published for Solana venues too: one desk, many chains.

---

## Is it profitable for LPs?

Modestly, and mostly in storms. It is insurance, not a steady income. We show these numbers as they are.

**Backtests on real data** (Binance ETHUSDT, at the setting tested so far, P\* = 10%, with a frictionless arbitrageur)
- **At equal time-average fee** against a fixed-fee pool, LP losses to arbitrage (net of the fees arbitrageurs pay) fall by **20% in February 2026** and **24.5% in October 2026**.
- **At equal cost to traders,** where volume rises with volatility, the result ranges from **−14% (better) to +7% (worse)** depending on the period.

**At the recalibrated setting** (5 bp floor, P\* = 20 or 30%)
- The audit estimates **+0.1 to +0.5% a year of capital** for a full-range ETH LP, and up to **+1%** on more volatile assets.
- About **half of the gain comes from the five most turbulent weeks** of the year.
- These numbers are recomputed at the final P\* and shown in the deck.

**What the model gets right and wrong**
- It predicts **how often** blocks get arbitraged, and that holds: observed against predicted P_trade was 0.080 against 0.100 in February and 0.097 against 0.094 in October.
- It underestimates **how much** each arbitrage takes, by a factor of 1.1 to 4, because real prices jump.

**What clim does not do**
- It does not remove LVR. It reduces the share of it that arbitrageurs keep.
- It does not beat a 5 bp pool in calm markets: by design it charges the same.
- As a business, a fee on the hook would not pay. The credible path is a risk desk as a service for DEXs (§12).
