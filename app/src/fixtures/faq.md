## How is the fee computed?

No transaction ever "changes" the fee. On every swap, the Uniswap v4 PoolManager calls the hook's `beforeSwap`. The hook reads the latest volatility from `RiskDesk.state()`, computes `fee = clamp(eta * sigma * sqrt(blockTime / 2) * k, floor, cap)` and returns it with `OVERRIDE_FEE_FLAG`. The Chainlink CRE risk desk updates sigma on-chain every 30 seconds through `onReport`.

## Can a pool that is already live switch to clim?

It depends on how the pool was created.

- A static-fee v4 pool: no. Its fee and hook are part of its `PoolKey`, and the pool id is the hash of that key, so it can never become dynamic or gain a hook. The path is a new pool with `fee = 0x800000` and `hooks = ClimHook`, and LPs move their liquidity to it.
- A dynamic-fee v4 pool with its own hook: only if that hook reads an outside source or has a keeper path to `PoolManager.updateDynamicLPFee` (which reverts unless the caller is the pool's hook). Then it can follow clim's risk desk without migrating. A hook with fixed logic needs a new hook and a new pool.
- A DEX with its own AMM and a keeper-set fee can use the desk: its keeper reads `RiskDesk.state()`, and the DEX applies its own fee rule.
- clim's own parameters (P\*, floor, cap) are immutable: changing them means a new hook and a new pool.

_This is the fixture FAQ shipped with the app. The full FAQ lives in `docs/faq.md`; `npm run sync` copies it here._
