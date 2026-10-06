"""Counterfactual for "why Chainlink": the same fee formula fed by a volatility measured inside the pool.

The pool sees only its own price. Each block, the in-pool estimate is RV15 of the pool's own post-trade
price at the end of the 16 last completed minutes (no oracle, no latency, no envelope); before 16 minutes
exist the fee sits on the floor. The pool price follows the market within the fee band, so its RV tracks
the market's RV; the price is that it can be pushed by trading against the pool and sees one venue only.
"""

import math

import numpy as np

from .constants import RV_RETURNS, RV_WINDOW_SEC
from .fee import HookParams
from .sim import ArbRun


def run_arb_inpool(t: np.ndarray, x: np.ndarray, params: HookParams) -> tuple[ArbRun, np.ndarray]:
    """Arbitrage simulation where the fee comes from the pool's own RV15. Returns the run and the fee per block."""
    ts = np.asarray(t, dtype=np.int64).tolist()
    xs = np.asarray(x, dtype=np.float64).tolist()
    n = len(xs)
    traded = np.zeros(n, dtype=np.int8)
    arb_by_block = np.zeros(n)
    z_pre = np.zeros(n)
    fees = np.zeros(n, dtype=np.int64)
    closes: list[float] = []
    p = prev = xs[0]
    minute = ts[0] // 60
    fee = params.fee_min_pips
    g = -math.log1p(-fee / 1e6)
    arb = paid = lvr = 0.0
    for i in range(n):
        m = ts[i] // 60
        if m != minute:
            closes.append(p)  # pool price at the end of the completed minute
            minute = m
            if len(closes) > RV_RETURNS:
                window = closes[-(RV_RETURNS + 1) :]
                ss = sum((window[k + 1] - window[k]) ** 2 for k in range(RV_RETURNS))
                fee = params.fee(int(math.floor(math.sqrt(ss / RV_WINDOW_SEC) * 1e9 + 0.5)))
                g = -math.log1p(-fee / 1e6)
        xi = xs[i]
        dx = xi - prev
        lvr += 0.5 * dx * dx
        prev = xi
        fees[i] = fee
        z = xi - p
        z_pre[i] = z
        if z > g:
            d = z - g
            p = xi - g
        elif z < -g:
            d = -z - g
            p = xi + g
        else:
            continue
        a = 0.5 * d * d
        arb += a
        paid += g * d
        arb_by_block[i] = a
        traded[i] = 1
    return ArbRun(traded, arb_by_block, z_pre, arb, paid, lvr), fees
