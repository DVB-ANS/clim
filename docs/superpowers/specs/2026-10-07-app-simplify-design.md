# App simplification: see it, verify it, try it

Design, 2026-10-07 (maintainer feedback, evening). Approved by the maintainer ("3 gestes"). The steps at the end replace a separate plan, because the submission deadline is the same evening.

## Why

The maintainer, on the app (every page but the landing and /how):
- it is too cluttered, with too much text;
- it does not lead a Chainlink developer to what they want to see, verify and test, wallet connect included;
- it is too heavy.

Measured on production at 1440 px:
- /app is 6,877 px tall and holds about 2,900 words;
- /replay holds about 2,600 words;
- the nav has six entries;
- the faucet is only on /lp.

## Scope

Changes stay in `app/`. These stay as they are:
- the landing (`/`), /how (docs and FAQ), and the content of /lab, /lp and /credits;
- every route;
- the anchors that the landing, the deck and the video use: `/app#start`, `/app#verify`, `/app#try`, `/swap#try` and `/replay#latest`.

## Design

- **Nav:** Dashboard · Swap · Storm (/replay) · Lab · How it works. Liquidity leaves the nav, and /swap links to it.
- **/app** is one page in three moves, built on one read of the live pair:
  - **live strip** (`#start`): the last CRE report's number and age, σ, pool V's fee now with the hook's mode, and pool S's fixed fee. The silent-desk note shows when the desk is silent.
  - **1 See it** (`#watch`): the weather chart, with a one-line subtitle.
  - **2 Verify it on Etherscan** (`#verify`, no wallet): the rows of `verifyRows` (`lib/guide.ts`, unchanged and tested). Each is one line: a title, where to look on the explorer, and external links only.
  - **3 Try it** (`#try`, wallet): connect a wallet, get test tokens, then swap on V and then on S (links to `/swap#faucet` and `/swap`).
  - **Full dashboard** (`#details`): a closed `<details>`. Opening it mounts the previous dashboard (desk, quote, model check, P&L, break-even, safety, swaps, the live/replay toggle) and the contracts table, so nothing is lost.
- **/swap** is three numbered steps on one page:
  - wallet: connect, plus the Sepolia gas faucets;
  - test tokens: the faucet card (`#faucet`);
  - swap on V, then on S.

  The swap card lists this visit's swaps, each with the fee it paid and its Etherscan link. The four long "Try it" cards go.
- **/replay:** the 7 October storm stays first, unchanged. The 4 February replay shrinks to two lines with a link to /lab, and its on-chain replay moves into a closed `<details>`.

## Not changed

The data layer (`useClimData`, `lib/`), the transaction code and the tests.

## Checks

- typecheck, lint, vitest and `next build`;
- screenshots of /app, /swap and /replay at 1440 and 390 px;
- no horizontal overflow;
- the kept anchors resolve.

## Steps

1. Nav: five entries in `AppHeader`.
2. /app: a `LiveDesk` client component with the live strip, the three moves and the lazy full dashboard. `Dashboard` loses its `guide` prop, and `StartHere` is deleted.
3. /swap: a wallet step and a faucet step above `SwapForm`, and the visit's swaps listed in the swap card. `TrySteps` is deleted, and `/lp#faucet` links move to `/swap#faucet`.
4. /replay: trim the 4 February section, with its on-chain dashboard in a lazy `<details>`.
5. Checks (above).
6. Commit only these paths, and add a line to today's session log.
7. Deploy to production only on the maintainer's go.
