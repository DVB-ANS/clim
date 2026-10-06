import math

import pytest

from clim_lab import model

DAILY_5PCT = 0.05 / math.sqrt(86_400)

# Milionis-Moallemi-Roughgarden 2023, Table 1 (sigma = 5% daily, Poisson blocks), fee gamma in bp
MMR_TABLE_1 = {
    600: {1: 0.967, 5: 0.855, 10: 0.747, 30: 0.496, 100: 0.228},
    12: {1: 0.807, 5: 0.456, 10: 0.295, 30: 0.123, 100: 0.040},
    2: {1: 0.630, 5: 0.254, 10: 0.145, 30: 0.054, 100: 0.017},
}


@pytest.mark.parametrize("dt", [600, 12, 2])
def test_reproduces_mmr_table_1(dt):
    for bp, expected in MMR_TABLE_1[dt].items():
        e = model.eta(bp * 1e-4, DAILY_5PCT, dt)
        assert abs(float(model.p_trade_poisson(e)) - expected) < 0.002


def test_fixed_block_formulas():
    assert math.isclose(float(model.p_trade_fixed(1.0 / 0.1 - 0.824)), 0.1)
    assert math.isclose(float(model.p_trade_fixed(1.0 / 0.3 - 0.824)), 0.3)
    assert math.isclose(float(model.arb_over_lvr_fixed(1.0)), 1 / 2.2137)
    assert float(model.arb_over_lvr_fixed(2.0)) < float(model.arb_over_lvr_poisson(2.0))


def test_sigma_arb_inverts_p_trade():
    sigma = 0.48 / math.sqrt(31_536_000)
    g = 20e-4
    p = float(model.p_trade_fixed(model.eta(g, sigma, 12)))
    assert math.isclose(model.sigma_arb(g, p, 12), sigma, rel_tol=1e-9)
