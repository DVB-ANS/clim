"""Basel-style validation of the P_trade prediction at the decided P*: lab/out/validation.json."""

import sys

import numpy as np

from clim_lab import model
from clim_lab.constants import BLOCK_SEC
from clim_lab.data import OUT_DIR, load_params
from clim_lab.desk import fee_pips_array, log_bands
from clim_lab.fee import HookParams
from clim_lab.report import now_iso, write_json
from clim_lab.samples import window_sample
from clim_lab.sim import clustering, run_arb
from clim_lab.validation import (
    BAND_METHOD,
    backtest_windows,
    kupiec_pof,
    ptrade_band,
    simulate_null,
    zone_counts,
)

WINDOW_BLOCKS = 300  # one hour of 12 s blocks
N_SIMS_WINDOW = 20_000
N_SIMS_TOTAL = 2_000
SEED = 20_261_006
BAND_GRID = [round(0.05 + 0.01 * i, 2) for i in range(56)]  # predicted P_trade 0.05 to 0.60
BAND_BURN_IN = 100


def main() -> int:
    params = HookParams.from_json(load_params())
    samples_out = []
    for i, name in enumerate(("feb", "oct")):
        s = window_sample(name).sched
        g = log_bands(fee_pips_array(s.sigma_e9, params))
        run = run_arb(s.x, g)
        pred = model.p_trade_fixed(model.eta(g, s.sigma, BLOCK_SEC))
        windows = backtest_windows(
            run.traded, run.arb_by_block, run.z_pre, s.sigma, g, pred, WINDOW_BLOCKS, N_SIMS_WINDOW, SEED + i, BLOCK_SEC
        )
        for w in windows:
            w["start"] = int(s.t[w.pop("startIndex")])
        x, n, p = run.n_trades, len(g), float(np.mean(pred))
        lr, p_iid = kupiec_pof(x, n, p)
        exc, _, n11, n1, n01, n0 = simulate_null(
            s.sigma, g, 0.0, N_SIMS_TOTAL, np.random.default_rng(SEED + 10 + i), BLOCK_SEC
        )
        p_two = min(1.0, 2.0 * min(float(np.mean(exc <= x)), float(np.mean(exc >= x))))
        after, after_none = clustering(run.traded)
        out = {
            "name": name,
            "blocks": n,
            "exceptions": x,
            "pTradeObserved": x / n,
            "pTradePredicted": p,
            "pTradeSimulatedMean": float(exc.mean() / n),
            "kupiecLR": lr,
            "kupiecPValueIid": p_iid,
            "simPValueTwoSided": p_two,
            "clustering": {
                "afterArbObserved": after,
                "afterNoArbObserved": after_none,
                "afterArbModel": float(n11.sum() / n1.sum()),
                "afterNoArbModel": float(n01.sum() / n0.sum()),
            },
            "zones": {
                "binomial": zone_counts(windows, "binomialZone"),
                "simulated": zone_counts(windows, "simulatedZone"),
                "severity": zone_counts(windows, "severityZone"),
            },
            "windows": windows,
        }
        samples_out.append(out)
        print(
            f"{name}: P_trade obs {out['pTradeObserved']:.3f} pred {p:.3f}; binomial {out['zones']['binomial']}; "
            f"simulated {out['zones']['simulated']}; severity {out['zones']['severity']}; "
            f"clustering obs {after:.2f}/{after_none:.3f} model {out['clustering']['afterArbModel']:.2f}/{out['clustering']['afterNoArbModel']:.3f}"
        )
    write_json(
        OUT_DIR / "validation.json",
        {
            "schema": "clim.lab.validation/1",
            "generatedAt": now_iso(),
            "pStar": params.p_star,
            "windowBlocks": WINDOW_BLOCKS,
            "nSimsWindow": N_SIMS_WINDOW,
            "nSimsTotal": N_SIMS_TOTAL,
            "seed": SEED,
            "samples": samples_out,
        },
    )
    write_json(
        OUT_DIR / "ptrade-band.json",
        {
            "schema": "clim.lab.ptrade_band/1",
            "generatedAt": now_iso(),
            "windowBlocks": WINDOW_BLOCKS,
            "method": BAND_METHOD.format(n_sims=N_SIMS_WINDOW, window=WINDOW_BLOCKS, burn_in=BAND_BURN_IN),
            "grid": ptrade_band(BAND_GRID, WINDOW_BLOCKS, N_SIMS_WINDOW, SEED + 20, BAND_BURN_IN),
        },
    )
    print(f"wrote {OUT_DIR / 'validation.json'} and {OUT_DIR / 'ptrade-band.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
