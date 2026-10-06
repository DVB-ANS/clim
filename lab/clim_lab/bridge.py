"""Bridge 1-minute closes to 12 s block prices (the 1-year file has no 1 s data).

The block at each minute boundary sits exactly on the minute close. The 4 interior blocks follow a
Brownian bridge whose per-second variance is the centred 15-minute mean of squared 1-minute returns / 60,
with Student-t (4 degrees of freedom, unit variance) innovations: on the Feb and Oct 1 s windows this
reproduces the real ARB within about 10 % (Gaussian innovations understate it by about 20 %).
"""

import numpy as np

from .data import MinuteSeries

BLOCKS_PER_MINUTE = 5
T_DOF = 4


def local_variance_per_second(logp: np.ndarray, half_window: int = 7) -> np.ndarray:
    """Per-second variance for each minute interval: centred mean of r^2 over 2*half_window+1 minutes / 60."""
    r2 = np.diff(logp) ** 2
    k = 2 * half_window + 1
    padded = np.pad(r2, half_window, mode="edge")
    csum = np.concatenate(([0.0], np.cumsum(padded)))
    return (csum[k:] - csum[:-k]) / k / 60.0


def bridge_blocks(minutes: MinuteSeries, seed: int, dof: int = T_DOF) -> tuple[np.ndarray, np.ndarray]:
    """Return (t, x): block times every 12 s from the first close, and bridged log prices."""
    a = minutes.logp[:-1]
    b = minutes.logp[1:]
    v = local_variance_per_second(minutes.logp)
    rng = np.random.default_rng(seed)
    n = len(a)
    h = 60.0 / BLOCKS_PER_MINUTE
    scale = np.sqrt((dof - 2) / dof)
    out = np.empty((n, BLOCKS_PER_MINUTE))
    out[:, 0] = a
    cur = a.copy()
    for k in range(1, BLOCKS_PER_MINUTE):
        remaining = (BLOCKS_PER_MINUTE - k + 1) * h
        mean = cur + (b - cur) * h / remaining
        var = v * h * (remaining - h) / remaining
        cur = mean + np.sqrt(var) * scale * rng.standard_t(dof, n)
        out[:, k] = cur
    x = np.concatenate((out.ravel(), b[-1:]))
    t = int(minutes.close_t[0]) + np.arange(len(x), dtype=np.int64) * int(h)
    return t, x
