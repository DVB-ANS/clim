# clim · front

The public terminal of clim's risk desk: storm insurance for Uniswap v4 LPs. A Chainlink CRE workflow publishes ETH volatility to `RiskDesk` every 30 s, and `ClimHook` sets pool V's fee on every swap from it. Pool S, the same pair with a fixed fee, is the control.

Pages: `/` (dashboard), `/replay`, `/lab`, `/how`, `/swap` (see the fee before you pay it), `/lp` (faucet, full-range liquidity, your position). Live: https://clim-zeta.vercel.app

This repo is the `app/` folder of DVB-ANS/clim (plan 05), built on its own and merged there as is.

## Run

```bash
npm install
npm run dev         # http://localhost:3000
npm test
npm run typecheck
npm run build
```

Until the contracts are deployed, everything runs on a deterministic mock chain. The dashboard decodes the same ABI-encoded logs it will read from Sepolia, and `/swap` and `/lp` walk through the same transaction steps in simulated mode.

## Go live

1. **Sync the backend's outputs.** `npm run sync` copies `shared/deployments/sepolia.json`, `shared/params.json`, `lab/out/*.json` and `docs/faq.md` into `src/generated/` and `public/data/lab/`; any file still missing falls back to `src/fixtures/`. In this standalone checkout, point it at the clim repo with `CLIM_ROOT=../clim npm run sync`; once merged as `clim/app`, plain `npm run sync` works. Commit the generated files.
2. **Addresses.** `shared/deployments/sepolia.json` needs:
   - the live pair (risk desk, hook, pools V and S);
   - the tokens `tETH` and `tUSD`;
   - Uniswap's `poolManager`, `stateView`, `poolSwapTest` and `poolModifyLiquidityTest`;
   - `routers.arb`, the arbitrage bot's own PoolSwapTest.

   Once the live pair is there, the data source switches to Sepolia and the on-chain mode of `/swap` and `/lp` turns on.
3. **Environment** (see `.env.example`, set in Vercel too):
   - `NEXT_PUBLIC_WC_PROJECT_ID`: a WalletConnect project id from https://cloud.reown.com. Optional: injected wallets (MetaMask, Rabby, …) work without it, and with it WalletConnect, Coinbase and Rainbow are added.
   - `NEXT_PUBLIC_SEPOLIA_RPC_URL`: optional, tried before Tenderly's public gateway and publicnode.
   - `NEXT_PUBLIC_CLIM_SOURCE=mock`: forces mock data even with live deployments.
4. **Freeze the history before submission.** `npm run snapshot -- live` writes the pair's logs to `public/data/chain/live.json`, so the live URL keeps working on RPCs with pruned log history.
5. **Deploy on Vercel.** Run `vercel deploy --prod --yes` from this folder after each sync (on a fresh checkout, `vercel link` to the project `clim` first). Deploying on push needs the Vercel GitHub app to have access to the DVB-ANS organisation.

After the merge into DVB-ANS/clim, set the Vercel project's **Root Directory** to `app/`.

Decisions and deviations from plan 05 are logged in `docs/sessions/2026-10-06.md`.
