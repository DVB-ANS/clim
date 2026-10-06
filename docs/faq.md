# clim FAQ

Questions we were asked during TOKEN2049 Origins, with precise answers. Code references point to this repository and to [Uniswap v4 core](https://github.com/Uniswap/v4-core).

## How is the fee computed?

On every swap:

```
fee_pips = clamp( ceil(sigmaE9 × etaE4 × sqrtHalfDtE6 × kE4 / 1e17), feeMinPips, feeMaxPips )
```

- `sigmaE9`: the risk desk's latest ETH volatility, per square-root second, times 10^9 (an annual volatility divided by √31,536,000). The desk measures it as the 15-minute realized volatility of the median one-minute price of four exchanges.
- `etaE4`: η × 10^4, with η = 1/P* − 0.824. Under the arbitrage model of Milionis, Moallemi and Roughgarden (2023), corrected for fixed block times by Nezlobin and Tassy (2025), a block is arbitraged with probability 1/(η + 0.824). Choosing η therefore chooses P*, the share of blocks the LP lets arbitrageurs take.
- `sqrtHalfDtE6`: √(blockTime/2) × 10^6. Sepolia has 12 s blocks, so 2,449,490.
- `kE4`: a model-risk multiplier from the desk, between 1 and 2 (10,000 to 20,000). It can only make the fee more prudent.
- `feeMinPips` is the pair's market fee tier (500 pips = 5 bp for ETH/USDC), `feeMaxPips` a hard cap. 1 bp = 100 pips; Uniswap caps LP fees at 1,000,000 pips.

Two safety rules sit on top:
- **Blind:** if the desk never reported, or its last report is older than `tauKillSec`, the fee is at least `feeSafePips`.
- **Degraded:** if the venues disagree by more than 25 bp, the fee is at least `feeSafePips`.

The README shows the deployed values and the fee at several volatility levels.

## Who changes the fee, and how?

Nobody, and no transaction does. The fee is recomputed inside each swap:

1. A trader calls `PoolManager.swap` on the clim pool.
2. Because the pool's `PoolKey` names `ClimHook` as its hook and the hook has the `beforeSwap` permission, the PoolManager calls `ClimHook.beforeSwap`.
3. The hook reads `RiskDesk.state()` (one external view call), computes the fee as above and returns it with `OVERRIDE_FEE_FLAG` (`0x400000`). This is OpenZeppelin's `BaseOverrideFee` pattern.
4. The PoolManager uses that fee for this swap only. In v4-core `Pool.swap`: `lpFee = params.lpFeeOverride.isOverride() ? params.lpFeeOverride.removeOverrideFlagAndValidate() : slot0Start.lpFee()`. The fee stored in the pool's `slot0` is not written.
5. The `Swap` event's `fee` field records the fee that swap paid (LP fee plus protocol fee; the protocol fee is zero on our Sepolia pools).

What moves the fee over time is the desk: every 30 s the Chainlink CRE workflow writes a new signed report to `RiskDesk`, and the next swap reads it.

## Can a pool that is already live switch to clim?

It depends on how the pool was created.

0. **A Uniswap v3 pool: no.** `UniswapV3Pool.fee` is `immutable`; the factory owner can only enable new fee tiers or set the protocol's share of fees, never change what an existing pool charges.
1. **A static-fee Uniswap v4 pool: no.** A pool is identified by `PoolId = keccak256(abi.encode(PoolKey))`, and the `PoolKey` contains the fee and the hook address. A pool whose key has a fixed fee (for example 500) can never take a per-swap fee: the PoolManager only honours a hook's fee override when `key.fee == DYNAMIC_FEE_FLAG` (`0x800000`). It cannot gain a hook either, and a pool cannot be initialized twice (`PoolAlreadyInitialized`). The path is a new pool with `fee = 0x800000` and `hooks = ClimHook`, and LPs move their liquidity to it (remove from the old pool, add to the new one). Uniswap v2 and v3 pools have no hooks at all.
2. **A dynamic-fee v4 pool with its own hook: it depends on that hook.** Uniswap v4 gives a dynamic-fee pool's hook two ways to set the fee: per swap (`beforeSwap` returning the fee with `OVERRIDE_FEE_FLAG`, what clim does) or stored (`PoolManager.updateDynamicLPFee(key, fee)`, which reverts unless `msg.sender` is the pool's hook). If the existing hook can read an external source or exposes a keeper path to `updateDynamicLPFee`, it can follow clim's risk desk without migrating. If its logic is fixed, a new hook means a new pool.
3. **A DEX with its own AMM and a keeper-set fee** (for example on an L2): its keeper reads `RiskDesk.state()`, or the same CRE workflow writes the report to its chain, and the DEX applies its own fee rule. The lightest first step is "shadow mode": publish the recommended fee next to the live one before switching. Example: Fables (Robinhood Chain) already has a keeper post temporary fee overrides between a floor and a cap on top of a flat fee (our pre-hackathon reading of public on-chain data, 2026-09-30); that keeper could read `RiskDesk.state()` with no contract change.
4. **clim's own pools: the parameters are immutable.** P*, the floor, the cap, the safe fee and the kill delay are constructor arguments of `ClimHook`. Changing them means deploying a new hook (a new address mined for its permission bits) and a new pool. That is deliberate: an LP knows the risk profile it joined, and no owner can change the rule.

What can change on a live clim pool without any migration: the volatility (every report), the multiplier k (sent by the desk, bounded to [1, 2]), the forwarder address and expected workflow id on `RiskDesk` (owner, to move from the simulation forwarder to the production `KeystoneForwarder`), and `disableSim()`, which permanently stops accepting simulated reports.

| Who | On a clim pool | On a static-fee v4 pool |
|---|---|---|
| A swapper | Nothing: the fee depends on neither direction, size nor pool state | Nothing |
| The CRE DON | The volatility and the flags, through signed reports, bounded by the envelope | Not applicable |
| The `RiskDesk` owner | Which forwarder and workflow are trusted; never the volatility, the fee or the parameters directly | Not applicable |
| The `ClimHook` deployer | Nothing after deployment: every parameter is immutable | Not applicable |
| The PoolManager owner (protocol fee controller) | The protocol fee only (at most 1,000 pips per direction; the controller is `0x0` on Sepolia) | The same |

The protocol fee is a separate dial: it is taken on top of the LP fee and goes to the protocol, not to LPs.

## Why not measure volatility inside the pool, on-chain?

It would capture most of the gain: in our lab, a volatility computed from the pool's own prices gets most of the improvement (the exact share is in the README's Results section). We still use a desk because the number must be hard to manipulate and easy to share:
- a pool-internal estimate can be pushed by trading against the pool itself; four exchanges that must agree cannot;
- the pool only sees itself, and an untraded pool shows no volatility at all;
- one signed figure can serve many pools and chains;
- the model check (predicted against observed arbitrage) runs off-chain, next to the data.

## Why Chainlink CRE, and not Data Feeds or Data Streams?

- **Data Feeds.** The ETH/USD price feed on Ethereum mainnet updates on a 0.5 % deviation or a one-hour heartbeat: a price, not a volatility, and too coarse to build a 15-minute estimate from. Chainlink also lists ETH realized-volatility feeds, but their shortest window is 24 hours with a one-hour heartbeat, they are not listed on Ethereum mainnet, and the Sepolia ETH-USD 24hr feed (`0x31D04174D0e1643963b38d87f26b0675Bb7dC96e`) last updated on 2024-08-30. A storm that starts and ends within the hour barely moves a 24-hour number.
- **Data Streams.** Pull-based: the user fetches a signed report off-chain and submits it for verification. For a fee, that would let the swapper choose which fresh report to bring. Its report schemas cover prices and other market data, not a 15-minute multi-venue realized volatility.
- **CRE** runs our own computation where the data lives (USD normalization, freshness, quorum, RV15, dispersion), lets every node fetch independently, and delivers one signed report on-chain every 30 s that any pool, keeper or chain can read.

## Is the CRE consensus real in your demo?

Not in simulation, and we say so. `cre workflow simulate` runs a single node, and on Sepolia the `--broadcast` path goes through `MockKeystoneForwarder`, which does not verify signatures. We compensate in two ways: `RiskDesk` accepts simulated reports only when `tx.origin` is our operator key (the demo shows a forged report being rejected), and the workflow already uses the CRE consensus API (median of each field), so it runs unchanged on a DON. On a DON, reports arrive through the production `KeystoneForwarder`, `RiskDesk` checks the expected workflow id, and the owner calls `disableSim()`.

## Is it profitable?

For LPs, modestly and unevenly: it is insurance. The README's Results section gives the lab numbers at the deployed parameters (both comparisons, and the expected gain per year of capital). As a business, not as a cut of hook fees: the credible path is a risk desk offered as a service to DEXs.

## Why Ethereum Sepolia? Why not Solana?

We need Uniswap v4 hooks and Chainlink CRE on the same chain. Sepolia has both, and its 12 s blocks make the fee formula produce readable fees. Solana has no Uniswap v4 hooks (we would have to write our own AMM program), and Meteora already ships volatility-based fees there. CRE can write to Solana, so the same desk can publish its report there later: one desk, many chains.

## What if an exchange goes down or reports a wrong price?

A venue whose last closed one-minute candle is older than 120 s is dropped. With fewer than 3 venues there is no report, and if the desk stays silent past the kill delay the hook quotes the safe fee. If the venues disagree by more than 25 bp, the desk flags itself as degraded and the hook quotes at least the safe fee. Volatility can move at most ×2 up and ×0.8 down between two reports, so one bad report cannot swing the fee arbitrarily.

## Can the owner change the fee?

Not directly. `ClimHook` has no owner and no setter, and `RiskDesk` has no function that sets volatility or the fee. `RiskDesk`'s owner (OpenZeppelin `Ownable`, through Chainlink's `ReceiverTemplate`) can choose which forwarder and which workflow to trust (`setForwarderAddress`, `setExpectedWorkflowId`, `setExpectedAuthor`, `setExpectedWorkflowName`), call `disableSim()`, and transfer or renounce ownership. That is a trust assumption: a malicious owner could point the desk at a forwarder it controls, or at address 0, which removes the sender check, and then feed its own volatility. Every such report would still be bounded: volatility moves at most ×2 up and ×0.8 down per report, and the fee stays between the 5 bp floor and the 150 bp cap. In production, after switching to the `KeystoneForwarder`, setting the workflow id and calling `disableSim()`, the owner renounces ownership (or hands it to a timelocked multisig). The hackathon deployment keeps an owner because it must switch forwarders.
