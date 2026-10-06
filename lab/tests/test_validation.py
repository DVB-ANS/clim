import math

import numpy as np

from clim_lab import model
from clim_lab.sim import run_arb
from clim_lab.validation import (
    backtest_windows,
    binom_cdf,
    binom_thresholds,
    kupiec_pof,
    ptrade_band,
    simulate_null,
    zone_counts,
    zone_from_cdf,
)


def test_zones_and_binomial():
    assert zone_from_cdf(0.5) == "green" and zone_from_cdf(0.97) == "yellow" and zone_from_cdf(0.99995) == "red"
    assert math.isclose(binom_cdf(300, 300, 0.1), 1.0)
    y, r = binom_thresholds(300, 0.1)
    assert binom_cdf(y - 1, 300, 0.1) < 0.95 <= binom_cdf(y, 300, 0.1)
    assert binom_cdf(r - 1, 300, 0.1) < 0.9999 <= binom_cdf(r, 300, 0.1)


def test_kupiec():
    lr, p = kupiec_pof(30, 300, 0.1)
    assert lr < 1e-9 and math.isclose(p, 1.0)
    lr, p = kupiec_pof(60, 300, 0.1)
    assert lr > 20 and p < 1e-5


def test_null_simulation_matches_formula_and_clusters():
    rng = np.random.default_rng(3)
    n = 3000
    sigma = np.full(n, 1e-4 / math.sqrt(12))
    eta = 1 / 0.3 - 0.824
    g = np.full(n, eta * 1e-4 / math.sqrt(2))
    exc, arb, n11, n1, n01, n0 = simulate_null(sigma, g, 0.0, 400, rng, 12)
    assert abs(exc.mean() / n - 0.3) < 0.01
    assert n11.sum() / n1.sum() > 0.45
    assert n01.sum() / n0.sum() < 0.3


def test_backtest_windows_on_model_data_is_mostly_green():
    rng = np.random.default_rng(4)
    n = 3000
    sig = 1e-4 / math.sqrt(12)
    x = np.cumsum(rng.normal(0, 1e-4, n))
    g = np.full(n, (1 / 0.3 - 0.824) * 1e-4 / math.sqrt(2))
    run = run_arb(x, g)
    pred = model.p_trade_fixed(model.eta(g, np.full(n, sig), 12))
    w = backtest_windows(run.traded, run.arb_by_block, run.z_pre, np.full(n, sig), g, pred, 300, 2000, 5, 12)
    assert len(w) == 10
    counts = zone_counts(w, "simulatedZone")
    assert counts["red"] == 0 and counts["green"] >= 8
    assert all(x["binomialYellowFrom"] <= x["simulatedYellowFrom"] for x in w)


def test_burn_in_is_not_counted():
    rng = np.random.default_rng(6)
    sigma = np.ones(400)
    g = np.full(400, 1.0)
    exc, arb, n11, n1, n01, n0 = simulate_null(sigma, g, 0.0, 1000, rng, 1.0, count_from=100)
    assert exc.max() <= 300 and np.all(n1 + n0 == 299)


def test_ptrade_band_is_centred_on_the_prediction_and_wider_than_binomial():
    rows = ptrade_band([0.1, 0.3], window=300, n_sims=4000, seed=7)
    assert [r["p"] for r in rows] == [0.1, 0.3]
    for r in rows:
        assert r["lo99"] <= r["lo95"] < r["p"] < r["hi95"] <= r["hi99"]
        half_width_binomial = 1.96 * math.sqrt(r["p"] * (1 - r["p"]) / 300)
        assert (r["hi95"] - r["lo95"]) / 2 > 1.2 * half_width_binomial
