import math

import numpy as np

from clim_lab.data import SecondSeries, minutes_from_seconds
from clim_lab.desk import (
    block_schedule,
    desk_reports,
    desk_reports_minutes,
    fee_pips_array,
    log_bands,
)
from clim_lab.estimators import first_rv15_time, rv15
from clim_lab.fee import HookParams


def _series_with_minute_moves(t0: int, minutes: int, step: float) -> SecondSeries:
    """Price flat inside each minute, jumps by +/-step (alternating) at each minute boundary."""
    n = minutes * 60
    logp = np.zeros(n)
    for m in range(1, minutes):
        logp[m * 60 :] += step if m % 2 else -step
    return SecondSeries(t0, logp)


def test_rv15_uses_closed_minute_candles():
    s = _series_with_minute_moves(t0=0, minutes=40, step=0.001)
    # every 1-minute return is +/-0.001 -> sigma = sqrt(15 * 1e-6 / 900)
    expected = math.sqrt(15 * 1e-6 / 900)
    t = np.array([1500, 1530, 1559, 1560])
    assert np.allclose(rv15(s, t), expected)


def test_rv15_ignores_the_open_candle():
    s = _series_with_minute_moves(t0=0, minutes=40, step=0.0)
    logp = s.logp.copy()
    logp[1500:] += 0.05  # jump inside the candle [1500, 1560) which is still open at t=1530
    s2 = SecondSeries(0, logp)
    assert rv15(s2, np.array([1530]))[0] == 0.0
    assert rv15(s2, np.array([1560]))[0] > 0.0


def test_desk_reports_grid_and_envelope():
    s = _series_with_minute_moves(t0=0, minutes=60, step=0.002)
    r = desk_reports(s)
    assert r.t_obs[0] % 30 == 0 and r.t_obs[0] >= first_rv15_time(s)
    assert np.all(np.diff(r.t_obs) == 30)
    sig = math.sqrt(15 * 4e-6 / 900)
    assert np.allclose(r.sigma, sig)
    assert r.sigma_e9[0] == math.floor(sig * 1e9 + 0.5)
    assert np.all(r.sigma_e9_applied == r.sigma_e9)


def test_block_schedule_respects_latency():
    s = _series_with_minute_moves(t0=0, minutes=60, step=0.002)
    r = desk_reports(s)
    b = block_schedule(s, r)
    assert b.t[0] >= r.t_obs[0] + 12 and b.t[0] % 12 == 0
    assert np.all(np.diff(b.t) == 12)
    for t, i in zip(b.t[:50], b.report_idx[:50], strict=True):
        assert r.t_obs[i] + 12 <= t < r.t_obs[i] + 12 + 30 or i == len(r.t_obs) - 1


def test_fee_pips_array_matches_scalar():
    p = HookParams.from_pstar(0.2)
    sig = np.array([0, 48_881, 178_072, 48_881, 1_780_730], dtype=np.int64)
    assert list(fee_pips_array(sig, p)) == [p.fee(int(v)) for v in sig]


def test_minute_desk_equals_second_desk_on_common_reports():
    rng = np.random.default_rng(2)
    s = SecondSeries(1_000_020, np.cumsum(rng.normal(0, 1e-4, 4 * 3600)))
    a = desk_reports(s)
    b = desk_reports_minutes(minutes_from_seconds(s))
    common, ia, ib = np.intersect1d(a.t_obs, b.t_obs, return_indices=True)
    assert len(common) > 300
    assert np.array_equal(a.sigma_e9[ia], b.sigma_e9[ib])
    assert math.isclose(float(a.logp_ref[ia[0]]), float(b.logp_ref[ib[0]]))


def test_log_bands():
    assert np.allclose(log_bands(np.array([500, 3_000])), [-np.log1p(-0.0005), -np.log1p(-0.003)])
