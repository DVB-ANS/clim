import math

import numpy as np

from clim_lab import model
from clim_lab.sim import clustering, run_arb


def test_band_logic_by_hand():
    x = np.array([0.0, 0.003, 0.0035, 0.0, -0.004])
    r = run_arb(x, 0.001)
    # block1: z=0.003 > 0.001 -> d=0.002, p=0.002 ; block2: z=0.0015 -> d=0.0005, p=0.0025
    # block3: z=-0.0025 -> d=0.0015, p=0.001 ; block4: z=-0.005 -> d=0.004, p=-0.003
    assert list(r.traded) == [0, 1, 1, 1, 1]
    assert math.isclose(r.arb, 0.5 * (0.002**2 + 0.0005**2 + 0.0015**2 + 0.004**2))
    assert math.isclose(r.arb_fees, 0.001 * (0.002 + 0.0005 + 0.0015 + 0.004))
    assert math.isclose(r.lvr, 0.5 * (0.003**2 + 0.0005**2 + 0.0035**2 + 0.004**2))
    assert math.isclose(r.z_pre[2], 0.0015)


def test_gbm_matches_nezlobin_tassy():
    rng = np.random.default_rng(7)
    sigma_b = 1e-4  # per-block std
    x = np.cumsum(rng.normal(0.0, sigma_b, 400_000))
    for eta_target in (1.0, 2.5, 4.0):
        g = eta_target * sigma_b / math.sqrt(2)
        r = run_arb(x, g)
        assert abs(r.p_trade - float(model.p_trade_fixed(eta_target))) < 0.01
        assert abs(r.arb / r.lvr - float(model.arb_over_lvr_fixed(eta_target))) < 0.02
        assert abs((r.arb + r.arb_fees) / r.lvr - 1.0) < 0.03


def test_arbitraged_blocks_cluster_under_the_model_itself():
    rng = np.random.default_rng(11)
    sigma_b = 1e-4
    x = np.cumsum(rng.normal(0.0, sigma_b, 300_000))
    g = (1 / 0.1 - 0.824) * sigma_b / math.sqrt(2)
    after_trade, after_none = clustering(run_arb(x, g).traded)
    assert after_trade > 0.4 and after_none < 0.07


def test_clustering_by_hand():
    # pairs after an arb: (1,1) (1,0) (1,0) -> 1/3 ; after no arb: (0,1) (0,0) -> 1/2
    assert clustering(np.array([1, 1, 0, 1, 0, 0])) == (1 / 3, 0.5)
