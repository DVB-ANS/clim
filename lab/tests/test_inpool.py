import math

import numpy as np

from clim_lab.fee import HookParams
from clim_lab.inpool import run_arb_inpool
from clim_lab.sim import run_arb


def _path(n_blocks: int, sigma_annual: float, seed: int) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    sd = sigma_annual / math.sqrt(31_536_000) * math.sqrt(12)
    return np.arange(n_blocks, dtype=np.int64) * 12, np.cumsum(rng.normal(0, sd, n_blocks))


def test_floor_until_sixteen_minutes_then_tracks_the_market_from_below():
    params = HookParams.from_pstar(0.3)
    t, x = _path(20_000, 2.0, seed=4)  # 200 %/yr: far above the 45.7 %/yr floor threshold
    run, fees = run_arb_inpool(t, x, params)
    assert np.all(fees[: 16 * 5] == 500) and fees[16 * 5] > 500
    expected = params.fee(round(2.0 / math.sqrt(31_536_000) * 1e9))
    # the band absorbs small moves, so the pool's own RV reads low (about 0.76x here)
    assert 0.6 < np.median(fees[200:]) / expected < 1.0
    assert 0.15 < run.p_trade < 0.45


def test_matches_run_arb_when_the_fee_never_leaves_the_floor():
    params = HookParams.from_pstar(0.3)
    t, x = _path(5_000, 0.2, seed=5)  # 20 %/yr: below the floor threshold
    run, fees = run_arb_inpool(t, x, params)
    assert set(fees.tolist()) == {500}
    ref = run_arb(x, -math.log1p(-500 / 1e6))
    assert math.isclose(run.arb, ref.arb, rel_tol=1e-12) and np.array_equal(run.traded, ref.traded)
