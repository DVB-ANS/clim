# clim

Storm insurance for Uniswap v4 LPs: a Chainlink CRE "risk desk" publishes multi-venue ETH realized volatility on-chain every 30 s, and a v4 hook sets a symmetric dynamic LP fee on every swap from it. Built at TOKEN2049 Origins (Singapore, 2026-10-06 to 08). Main track plus Chainlink "Best workflow with CRE".

## Where things are
- Design spec: `docs/superpowers/specs/2026-10-06-clim-design.md`.
- Plans:
  - `docs/superpowers/plans/2026-10-06-clim-00-master.md` gives the order and the gates;
  - `01` to `06` are the per-subsystem plans.
- Session logs (decisions, feedback, open questions): `docs/sessions/YYYY-MM-DD.md`.
- Chainlink CRE friction log (developer-experience feedback for the Chainlink team): `docs/feedback/cre-friction-log.md`.
- FAQ: `docs/faq.md`.
- Shared single source of truth for addresses, parameters and ABIs: `shared/`.
- Dashboard (Next.js, live at https://clim-zeta.vercel.app): `app/`. It was built after kickoff in DVB-ANS/clim-front and imported into `app/` with `git subtree`, history kept, on 2026-10-07 (master plan Task 14). Production deploys from the repo root (Vercel Root Directory `app`).

## Working rules
- **Start of every session:** read `CLAUDE.local.md` (if present), every `docs/sessions/*.md`, then the master plan.
- **The dashboard changes only in `app/` from now on.** DVB-ANS/clim-front is frozen since the import; do not rebuild the dashboard from plan 05 Tasks 1 to 24.
- **Hackathon rule:** all code is written after kickoff (2026-10-06 12:00 SGT). Never import code from outside this repo written before that time. Public libraries and templates are fine.
- **Living docs:** the spec and plans are living documents. When the build or new research contradicts them, update them and add a line to today's session log.
- **Log as you go:**
  - feedback from mentors, judges or partners, decisions and surprises go in `docs/sessions/<today>.md`;
  - every Chainlink CRE friction goes in `docs/feedback/cre-friction-log.md`.
- **Plans carry no clock times or per-person time budgets**, only ordered steps.
- **Hook parameters are immutable:**
  - P\* and the fee floor are decided in the lab (`shared/params.json`) before the hook is deployed;
  - changing them means a new hook and a new pool.
- **Never commit secrets.**
  - `.env` and `secrets.yaml` are gitignored;
  - use `.env.example` and `secrets.example.yaml`;
  - testnet keys only.
- **Git:** commit often with clear messages. Push only when the maintainer asks.
- **Submission (2026-10-07 23:59 SGT, no late entries):**
  - a public repo;
  - a live URL;
  - the deck as **.ppt or .keynote** via a Google Drive link, with the demo as an embedded screen recording (no live demo on stage).
