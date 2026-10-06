# clim lab

The research lab behind clim's parameters and numbers. It decides P\* before the hook is deployed, and it produces every figure the deck, the dashboard (`app/`) and the replay server (`bots/`) use. Everything is reproducible from the raw files in `lab/data/` (gitignored).

## Setup

```bash
cd lab
uv sync          # Python 3.12, numpy 2.5.3, pytest 9.1.1
uv run pytest    # 82 tests
```

## Reproduce the outputs

```bash
uv run python -u scripts/decide_pstar.py   # out/pstar_decision.json and ../shared/params.json (about 2 min)
uv run python scripts/backtest_summary.py  # out/backtest-summary.json and out/summary.json
uv run python scripts/validate_model.py    # out/validation.json and out/ptrade-band.json
uv run python scripts/export_replay.py     # out/replay-2026-02-04.json and out/replay-window.json
```

`decide_pstar.py` refuses to change the `pStar` of a decided `shared/params.json` without `--force`: the hook's parameters are immutable, so a new P\* means a new hook and new pools. `--seed N --no-write` reruns the decision with another random seed without writing anything. The output schemas are pinned by `tests/test_outputs.py`; `docs/superpowers/plans/2026-10-06-clim-03-lab.md` lists who reads each file.

## What the lab models

- **The desk.** RV15 on closed 1-minute candles, exactly as the CRE workflow computes it, reported every 30 s, passed through the RiskDesk envelope (rise at most 2x, fall at most 20 % per report, bounds 10 % to 1000 %/yr), effective one 12 s block later.
- **The fee.** An integer mirror of `ClimFeeMath.feePips`: `clamp(ceil(sigmaE9 * etaE4 * sqrtHalfDtE6 * kE4 / 1e17), feeMinPips, feeMaxPips)`, with `etaE4 = round((1/P* - 0.824) * 1e4)`.
- **Arbitrage.** Fixed 12 s blocks, a myopic arbitrageur who moves the pool to the edge of the no-trade band `g = -ln(1 - fee)`. LVR, ARB (LP loss net of fees) and arbitrage fees are accounted per block.
- **Competition.** The clim pool against a static 5 bp pool four times deeper. Each block, Poisson retail orders (log-normal sizes) are split by an aggregator to minimise the trader's all-in cost. LP P&L is the sum of trade markouts against the market price (retail markout minus ARB). Retail intensity is calibrated so that a static 5 bp pool breaks even over the year.
- **The year.** One year of 1-minute closes bridged to 12 s blocks (Brownian bridge with Student-t innovations; on the Feb and Oct 1 s windows it reproduces the real ARB within about 10 %).
- **Why Chainlink.** The same fee formula fed by the pool's own RV15 captures most of the gain (`inpool.py`): CRE is there for robustness (venues that must agree, a signed report, no manipulation through trades against the pool), not for accuracy.
- **Validation.** P_trade predicted (Nezlobin-Tassy 2025: `1/(eta + 0.824)`) against observed, with Basel-style zones whose thresholds are simulated from the model, because arbitraged blocks cluster under the model itself.

## Data

| File | Content | Span (UTC) |
|---|---|---|
| `b1s_feb.csv` | Binance ETHUSDT 1 s closes, `unix_seconds,close` | 2026-02-03 to 2026-02-06 |
| `b1s_3d.csv` | same | 2026-10-03 to 2026-10-06 |
| `eth1m.json` | Binance ETHUSDT 1 min closes, `[[open_time_ms, close], ...]` | 2025-10-06 to 2026-10-06 |
| `dvol_3600_feb.json` | Deribit DVOL hourly candles | 2026-02-02 to 2026-02-07 |
| `dvol_1m_3d.json` | Deribit DVOL 1 min candles | 2026-10-03 to 2026-10-06 |

Sources: Binance `GET /api/v3/klines` (intervals `1s` and `1m`, symbol `ETHUSDT`) and Deribit `public/get_volatility_index_data` (currency `ETH`).

## Limits

- One price path per window and a frictionless, gas-free arbitrageur; the model underestimates the severity of arbitrage (ARB/LVR above the closed form), only the frequency holds within about 10 %.
- The LP P&L depends on the retail model: with large orders relative to pool depth, or an equally deep competitor, P\* = 0.2 beats P\* = 0.3 (see `year.sensitivity` in `out/pstar_decision.json`).
- The year sample is bridged from 1-minute data, not observed at 12 s.

`scratch/` holds the exploration scripts written during the hack before this package existed. They are kept for provenance; nothing imports them.
