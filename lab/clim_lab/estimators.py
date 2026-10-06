"""RV15: the desk's volatility estimator, computed exactly as the CRE workflow does (closed 1-minute candles)."""

import numpy as np

from .constants import RV_RETURNS, RV_WINDOW_SEC
from .data import SecondSeries

_OFFSETS = 60 * np.arange(RV_RETURNS, -1, -1, dtype=np.int64)  # 900, 840, ..., 0


def minute_close_index(series: SecondSeries, t_obs: np.ndarray) -> np.ndarray:
    """Indices (into series.logp) of the 16 last closed 1-minute candle closes at each t_obs, oldest first.

    The candle [m-60, m) closes at m; its close is the 1 s price at second m-1.
    """
    m0 = (np.asarray(t_obs, dtype=np.int64) // 60) * 60
    idx = (m0[:, None] - 1 - _OFFSETS[None, :]) - series.t0
    if idx.min() < 0:
        raise ValueError("not enough history for RV15 (needs 16 minute closes)")
    return idx


def rv_from_closes(closes: np.ndarray) -> np.ndarray:
    """closes: (n, 16) log closes, oldest first -> sqrt(sum of the 15 squared log returns / 900 s) per row."""
    r = np.diff(closes, axis=1)
    return np.sqrt((r * r).sum(axis=1) / RV_WINDOW_SEC)


def rv15(series: SecondSeries, t_obs: np.ndarray) -> np.ndarray:
    """Realized volatility per sqrt second from the 16 last closed 1-minute candles of a 1 s series."""
    return rv_from_closes(series.logp[minute_close_index(series, t_obs)])


def first_rv15_time(series: SecondSeries) -> int:
    """Earliest second at which 16 closed minute candles exist."""
    return series.t0 + RV_WINDOW_SEC + 61
