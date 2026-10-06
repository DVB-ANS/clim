import numpy as np

from clim_lab.bridge import bridge_blocks, local_variance_per_second
from clim_lab.data import MinuteSeries


def _minutes(n: int, sd: float, seed: int = 1) -> MinuteSeries:
    rng = np.random.default_rng(seed)
    logp = np.cumsum(rng.normal(0, sd, n))
    return MinuteSeries(6_000 + 60 * np.arange(n, dtype=np.int64), logp)


def test_local_variance_of_constant_returns():
    logp = np.arange(20) * 0.001
    v = local_variance_per_second(logp)
    assert len(v) == 19 and np.allclose(v, 1e-6 / 60)


def test_bridge_hits_minute_closes_and_matches_variance():
    m = _minutes(20_000, 1e-3)
    t, x = bridge_blocks(m, seed=3)
    assert len(x) == 5 * (len(m.logp) - 1) + 1
    assert np.all(np.diff(t) == 12) and t[0] == m.close_t[0]
    assert np.allclose(x[::5], m.logp)
    qv_12s = np.sum(np.diff(x) ** 2)
    qv_1m = np.sum(np.diff(m.logp) ** 2)
    assert abs(qv_12s / qv_1m - 1.0) < 0.05
