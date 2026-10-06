"""The two honest single-pool comparisons (ARB at equal time-average fee, ARB at equal cost to traders)."""

import numpy as np

from .constants import BLOCK_SEC, SECONDS_PER_YEAR
from .desk import BlockSchedule, log_bands
from .sim import run_arb


def static_fee_equal_time(fee_pips: np.ndarray) -> float:
    """Static fee (pips) equal to the dynamic fee's time average."""
    return float(np.mean(fee_pips))


def static_fee_equal_cost(fee_pips: np.ndarray, sigma: np.ndarray) -> float:
    """Static fee (pips) charging traders the same total when retail volume is proportional to sigma."""
    return float(np.sum(fee_pips * sigma) / np.sum(sigma))


def depth_units_to_bp_year(units: float, blocks: int) -> float:
    """Sum of 0.5*d^2 (depth units, D = TVL/4) over `blocks` 12 s blocks -> bp of TVL per year."""
    return units / 4.0 * 1e4 * SECONDS_PER_YEAR / (blocks * BLOCK_SEC)


def arb_change(sched: BlockSchedule, fee_pips: np.ndarray, static_pips: float) -> dict:
    """ARB of the dynamic policy vs a static fee on the same path, in bp of TVL per year (x100 = USD per $1M)."""
    dyn = run_arb(sched.x, log_bands(fee_pips))
    sta = run_arb(sched.x, float(log_bands(np.array([static_pips]))[0]))
    n = len(sched)
    return {
        "staticFeeBp": static_pips / 100.0,
        "arbDynamicBpYr": depth_units_to_bp_year(dyn.arb, n),
        "arbStaticBpYr": depth_units_to_bp_year(sta.arb, n),
        "arbChangePct": 100.0 * (dyn.arb / sta.arb - 1.0),
    }


def rolling_equal_time(
    sched: BlockSchedule, fee_pips: np.ndarray, window_blocks: int, step_blocks: int
) -> list[tuple[int, float]]:
    """(start index, ARB change %) at equal time-average fee on every rolling window (both pools restart)."""
    out = []
    for a in range(0, len(sched) - window_blocks + 1, step_blocks):
        b = a + window_blocks
        x = sched.x[a:b]
        f = fee_pips[a:b]
        dyn = run_arb(x, log_bands(f)).arb
        sta = run_arb(x, float(log_bands(np.array([f.mean()]))[0])).arb
        if sta > 0:
            out.append((a, 100.0 * (dyn / sta - 1.0)))
    return out
