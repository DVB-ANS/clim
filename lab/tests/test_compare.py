import math

import numpy as np

from clim_lab.compare import (
    arb_change,
    depth_units_to_bp_year,
    rolling_equal_time,
    static_fee_equal_cost,
    static_fee_equal_time,
)
from clim_lab.desk import BlockSchedule


def _sched(x: np.ndarray, sigma_e9: np.ndarray) -> BlockSchedule:
    n = len(x)
    return BlockSchedule(np.arange(n) * 12, x, sigma_e9, np.zeros(n, dtype=np.int64))


def test_static_fee_definitions():
    fees = np.array([500, 500, 1500, 1500])
    sigma = np.array([1.0, 1.0, 3.0, 3.0])
    assert static_fee_equal_time(fees) == 1000.0
    assert math.isclose(static_fee_equal_cost(fees, sigma), (1000 + 9000) / 8)


def test_vol_indexed_fee_beats_static_at_equal_average_on_regime_switch():
    rng = np.random.default_rng(1)
    calm = rng.normal(0, 0.5e-4, 20_000)
    storm = rng.normal(0, 4e-4, 20_000)
    x = np.cumsum(np.concatenate([calm, storm]))
    sigma_e9 = np.concatenate([np.full(20_000, 20_000), np.full(20_000, 160_000)])
    fees = np.where(sigma_e9 > 50_000, 2400, 300)
    res = arb_change(_sched(x, sigma_e9), fees, static_fee_equal_time(fees))
    assert res["staticFeeBp"] == 13.5
    assert res["arbChangePct"] < -10.0
    assert res["arbDynamicBpYr"] < res["arbStaticBpYr"]
    assert math.isclose(res["arbChangePct"], 100 * (res["arbDynamicBpYr"] / res["arbStaticBpYr"] - 1), rel_tol=1e-9)
    rolling = rolling_equal_time(_sched(x, sigma_e9), fees, 10_000, 10_000)
    assert [a for a, _ in rolling] == [0, 10_000, 20_000, 30_000]
    assert all(abs(pct) < 1e-9 for _, pct in rolling)  # one fee level per window: dynamic == static


def test_depth_units_conversion_matches_lvr_formula():
    # LVR of a full-range pool is sigma^2/8 of TVL per year: 0.5*sigma^2*T depth units over T seconds
    sigma_annual = 0.48
    blocks = 2_628_000
    units = 0.5 * sigma_annual**2 * (blocks * 12) / 31_536_000
    assert math.isclose(depth_units_to_bp_year(units, blocks), 1e4 * sigma_annual**2 / 8)
