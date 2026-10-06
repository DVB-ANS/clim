"""Single-pool arbitrage simulator: fixed blocks, myopic arbitrageur, no-trade band of half-width g (log).

Units: amounts are in 'depth units' D * log^2, where D = L*sqrt(P)/2 is the pool's USD value per unit of
log-price move (full range: D = TVL/4). Multiply by D (USD) to get dollars.
"""

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class ArbRun:
    traded: np.ndarray  # int8, 1 when the arbitrageur traded in that block
    arb_by_block: np.ndarray  # arbitrage profit net of fees per block (D*log^2)
    z_pre: np.ndarray  # mispricing x - p before the arbitrage, per block
    arb: float  # total ARB (LP loss to arbitrage net of fees)
    arb_fees: float  # fees paid by the arbitrageur
    lvr: float  # sum of 0.5*(dx)^2 between consecutive blocks

    @property
    def n_trades(self) -> int:
        return int(self.traded.sum())

    @property
    def p_trade(self) -> float:
        return self.n_trades / len(self.traded)


def run_arb(x: np.ndarray, g: np.ndarray, p0: float | None = None) -> ArbRun:
    """x: market log price per block; g: band half-width per block (scalar broadcast allowed)."""
    xs = np.asarray(x, dtype=np.float64).tolist()
    gs = np.broadcast_to(np.asarray(g, dtype=np.float64), (len(xs),)).tolist()
    n = len(xs)
    traded = np.zeros(n, dtype=np.int8)
    arb_by_block = np.zeros(n)
    z_pre = np.zeros(n)
    p = xs[0] if p0 is None else float(p0)
    prev = xs[0]
    arb = fees = lvr = 0.0
    for i in range(n):
        xi = xs[i]
        dx = xi - prev
        lvr += 0.5 * dx * dx
        prev = xi
        gi = gs[i]
        z = xi - p
        z_pre[i] = z
        if z > gi:
            d = z - gi
            p = xi - gi
        elif z < -gi:
            d = -z - gi
            p = xi + gi
        else:
            continue
        a = 0.5 * d * d
        arb += a
        fees += gi * d
        arb_by_block[i] = a
        traded[i] = 1
    return ArbRun(traded, arb_by_block, z_pre, arb, fees, lvr)


def clustering(traded: np.ndarray) -> tuple[float, float]:
    """P(arb | previous block arbitraged), P(arb | previous block not arbitraged)."""
    t = np.asarray(traded).astype(bool)
    prev, cur = t[:-1], t[1:]
    return float(cur[prev].mean()), float(cur[~prev].mean())
