# clim · dashboard

The public terminal of clim's risk desk: storm insurance for Uniswap v4 LPs. A Chainlink CRE workflow publishes ETH volatility to `RiskDesk` every 30 s, and `ClimHook` sets pool V's fee on every swap from it. Pool S, the same pair with a fixed fee, is the control. Today the workflow runs in CRE's simulator on one node, and the operator key sends each report through `MockKeystoneForwarder`; a Chainlink DON is the deployment target.

Pages: `/` (landing), `/app` (dashboard), `/replay`, `/lab`, `/how`, `/swap` (see the fee before you pay it), `/lp` (faucet, full-range liquidity, your position), `/credits` (third-party notices). Live: https://clim-zeta.vercel.app

This is the `app/` folder of the clim monorepo ([DVB-ANS/clim](https://github.com/DVB-ANS/clim)). It was built after kickoff in a separate checkout and imported here with `git subtree`, history kept (master plan Task 14); it now changes only in this folder.

The look follows refero's Ventriloc style (layout and type) in pink, blue and white: Chainlink Blue for actions and pool V, Uniswap's pink for σ and the storm. Every colour, radius and font is a token in `src/app/globals.css` and `src/lib/theme.ts`.

## Data sources

Everything shown comes from Ethereum Sepolia and from files synced from the rest of the repo:

- **Chain logs.** `RiskReported` (both desks), the PoolManager's `Swap` events for pools V and S, and the forwarders' `ReportProcessed`, read over public RPCs (`NEXT_PUBLIC_SEPOLIA_RPC_URL` first if set, then Tenderly's gateway and publicnode). The history up to the last snapshot ships in `public/data/chain/{live,replay}.json`, so the site works on RPCs with pruned logs; only newer blocks are fetched.
- **Contract reads.** `RiskDesk.state()`, `ClimHook.quoteFee()`, Uniswap's `StateView` (prices, liquidity, positions) and the protocol fee.
- **Synced files.** `src/generated/sepolia.json` (addresses, pool keys, pairs), `src/generated/params.json` (the hook's parameters), `src/generated/faq.ts` (from `docs/faq.md`) and `public/data/lab/*.json` (the lab's backtests, replay and P_trade band).

Pool values are in tUSD: the pair's tokens are faucet test tokens (tETH, tUSD), not money. The lab's backtests on real market data are the only figures in US dollars.

A build without the synced deployment (or with `NEXT_PUBLIC_CLIM_SOURCE=mock`) falls back to a deterministic mock chain and a simulated mode on `/swap` and `/lp`; production never does.

## Run

From the repo root:

```bash
cd app
npm ci
npm run sync        # copy shared/, lab/out and docs/faq.md into the app
npm run dev         # http://localhost:3000
```

Checks:

```bash
npm test            # vitest: maths, decoders, story, contracts list, sync script
npm run typecheck
npm run lint
npm run build
```

## Scripts

- `npm run sync` copies `shared/deployments/sepolia.json`, `shared/params.json`, `lab/out/*.json` and `docs/faq.md` from the repo into `src/generated/` and `public/data/lab/`; a missing file falls back to `src/fixtures/`. It reads the parent folder as the repo root (`CLIM_ROOT` overrides it). Commit the generated files: Vercel only uploads `app/`.
- `npm run snapshot -- live` (or `replay`) freezes a pair's logs into `public/data/chain/<pair>.json`.
- `npm run e2e:onchain -- <env file>` runs `/swap` and `/lp` end to end on Sepolia with the app's own call builders: faucet, a 0.5 tETH swap on V and on S (each `Swap.fee` checked against `ClimHook.quoteFee()` and S's fixed fee), then a 1 tETH full-range add and remove on both pools. The env file holds `TEST_PRIVATE_KEY` for a testnet key, which is never printed; `--out <file>` writes a summary.
- `npm run fixtures` rewrites the synthetic lab fixtures (`src/fixtures/lab/`, labelled "fixture"); `npm run dither` regenerates the dithered storm texture.

## Environment

See `.env.example`; production sets none of them.

- `NEXT_PUBLIC_SEPOLIA_RPC_URL`: optional, tried before the public RPCs.
- `NEXT_PUBLIC_WC_PROJECT_ID`: optional WalletConnect project id (https://cloud.reown.com). Injected wallets (MetaMask, Rabby, …) work without it; with it, WalletConnect, Coinbase and Rainbow are added.
- `NEXT_PUBLIC_CLIM_SOURCE=mock`: forces the mock chain.

## Deploy

Production is the Vercel project `clim`, deployed from the repo root: its Root Directory is `app/`, and the root `.vercelignore` uploads `app/` only. After a sync, from the repo root:

```bash
vercel deploy --prod --yes
```

On a fresh checkout, link the project first (`vercel link`, project `clim`) or set `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`.

Decisions and deviations from plan 05 are logged in the repo's `docs/sessions/2026-10-06.md` and `docs/sessions/2026-10-07.md`.

## Credits

Components adapted from [React Bits](https://reactbits.dev), [Rare UI](https://rareui.com) and [ObsidianUI](https://www.obsidianui.dev); patterns after [Aceternity UI](https://ui.aceternity.com); ordered dithering after [Dither it!](https://ditheritv3.netlify.app). Sources, commits and licences, and the npm packages with notice requirements: `THIRD_PARTY_NOTICES.md` (also served at `/credits`).
