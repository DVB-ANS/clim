## How is the fee computed?

No transaction ever "changes" the fee. On every swap, the Uniswap v4 PoolManager calls the hook's `beforeSwap`. The hook reads the latest volatility from `RiskDesk.state()`, computes `fee = clamp(eta * sigma * sqrt(blockTime / 2) * k, floor, cap)` and returns it with `OVERRIDE_FEE_FLAG`. The Chainlink CRE risk desk updates sigma on-chain every 30 seconds through `onReport`.

## Can a pool that is already live change its fee?

- A v4 pool's fee mode and hook are part of its `PoolKey`, and the pool id is the hash of that key. An existing static-fee pool can never become dynamic or gain a hook: you create a new pool and migrate liquidity.
- A dynamic-fee pool (fee field `0x800000`) can change its LP fee at any time, but only through its hook: either per swap, by returning a fee with `OVERRIDE_FEE_FLAG` from `beforeSwap` (what clim does), or by storing a new fee with `PoolManager.updateDynamicLPFee`, which reverts unless the caller is the pool's hook.
- clim's own parameters (P\*, floor, cap) are immutable: changing them means a new hook and a new pool.
- A DEX that already runs dynamic fees can integrate the desk without a new pool: its hook or keeper reads `RiskDesk.state()`.

_This is the fixture FAQ shipped with the app. The full FAQ lives in `docs/faq.md`; `npm run sync` copies it here._
