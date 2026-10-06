"""Two competing pools on the same pair: our pool X (policy under test) and a competitor C (static fee).

Per block: the arbitrageur aligns each pool to the market (top of block), then the block's retail flow
arrives (gross buys and gross sells, in random order) and an aggregator splits it to minimise the traders'
all-in cost (fee + pool mispricing + price impact). With linear marginal costs, routing a block's buys as
one order gives the same allocation and cost as routing them one by one.
Pools are full-range-equivalent with depth D = TVL/4 USD per unit of log-price move (v4 in range:
D = L*sqrt(P)/2). LP P&L = sum of trade markouts against the market price (a delta-hedged LP).
"""

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class RetailFlow:
    buy_usd: np.ndarray  # gross retail buys of the risky asset per block (USD)
    sell_usd: np.ndarray  # gross retail sells per block (USD)
    buy_first: np.ndarray  # bool per block: buys execute before sells


def make_retail_flow(
    n_blocks: int,
    rate_per_block: float,
    median_usd: float,
    log_sd: float,
    seed: int,
    intensity: np.ndarray | None = None,
) -> RetailFlow:
    """Poisson order arrivals (rate * intensity per block, half buys, half sells), log-normal sizes."""
    rng = np.random.default_rng(seed)
    lam = np.full(n_blocks, rate_per_block / 2.0)
    if intensity is not None:
        lam = lam * np.asarray(intensity, dtype=np.float64)
    out = []
    for _ in range(2):
        counts = rng.poisson(lam)
        sizes = median_usd * np.exp(log_sd * rng.standard_normal(int(counts.sum())))
        block = np.repeat(np.arange(n_blocks), counts)
        out.append(np.bincount(block, weights=sizes, minlength=n_blocks))
    return RetailFlow(out[0], out[1], rng.random(n_blocks) < 0.5)


def route(a_x: float, d_x: float, a_c: float, d_c: float, s: float) -> tuple[float, float]:
    """Cost-minimising split of s USD. Pool i has base cost a_i (log, vs market) and marginal cost a_i + s_i/d_i."""
    if a_x <= a_c:
        if s <= d_x * (a_c - a_x):
            return s, 0.0
    elif s <= d_c * (a_x - a_c):
        return 0.0, s
    lam = (s + d_x * a_x + d_c * a_c) / (d_x + d_c)
    return d_x * (lam - a_x), d_c * (lam - a_c)


@dataclass(frozen=True)
class PoolBook:
    """Results for one pool over the run, in USD."""

    retail_volume: float
    retail_fees: float
    retail_markout: float
    arb: float
    arb_fees: float
    lvr: float
    traded: np.ndarray  # int8 per block: arbitrage trade in that block
    pnl_by_block: np.ndarray  # retail markout - arbitrage loss, per block

    @property
    def lp_pnl(self) -> float:
        return self.retail_markout - self.arb


def run_market(
    x: np.ndarray,
    g_x: np.ndarray,
    g_c: float,
    depth_x: float,
    depth_c: float,
    flow: RetailFlow,
    sticky: float = 0.0,
) -> tuple[PoolBook, PoolBook]:
    """Simulate X (log band g_x per block) and C (constant log band g_c) over the market log prices x.

    sticky: share of each block's flow split pro rata of depth whatever the prices (price-insensitive flow).
    """
    n = len(x)
    if len(flow.buy_usd) != n:
        raise ValueError("flow and price path have different lengths")
    xs = np.asarray(x, dtype=np.float64).tolist()
    gxs = np.broadcast_to(np.asarray(g_x, dtype=np.float64), (n,)).tolist()
    buys = flow.buy_usd.tolist()
    sells = flow.sell_usd.tolist()
    first = flow.buy_first.tolist()
    traded_x = np.zeros(n, dtype=np.int8)
    traded_c = np.zeros(n, dtype=np.int8)
    pnl_x = np.zeros(n)
    pnl_c = np.zeros(n)
    share_x = depth_x / (depth_x + depth_c)
    px = pc = prev = xs[0]
    vol_x = fee_x = mk_x = arb_x = afee_x = 0.0
    vol_c = fee_c = mk_c = arb_c = afee_c = 0.0
    lvr_unit = 0.0
    for i in range(n):
        xi = xs[i]
        dx = xi - prev
        lvr_unit += 0.5 * dx * dx
        prev = xi
        gx = gxs[i]
        blk_x = blk_c = 0.0
        z = xi - px
        if z > gx or z < -gx:
            d = (z - gx) if z > 0.0 else (-z - gx)
            px = xi - gx if z > 0.0 else xi + gx
            a = depth_x * 0.5 * d * d
            arb_x += a
            afee_x += depth_x * gx * d
            blk_x -= a
            traded_x[i] = 1
        z = xi - pc
        if z > g_c or z < -g_c:
            d = (z - g_c) if z > 0.0 else (-z - g_c)
            pc = xi - g_c if z > 0.0 else xi + g_c
            a = depth_c * 0.5 * d * d
            arb_c += a
            afee_c += depth_c * g_c * d
            blk_c -= a
            traded_c[i] = 1
        sides = ((1, buys[i]), (-1, sells[i])) if first[i] else ((-1, sells[i]), (1, buys[i]))
        for dr, s in sides:
            if s <= 0.0:
                continue
            for leg in (0, 1):
                if leg == 0:
                    if sticky <= 0.0:
                        continue
                    s_x = s * sticky * share_x
                    s_c = s * sticky - s_x
                else:
                    s_x, s_c = route(dr * (px - xi) + gx, depth_x, dr * (pc - xi) + g_c, depth_c, s * (1.0 - sticky))
                if s_x > 0.0:
                    delta = s_x / depth_x
                    m = s_x * (dr * (px - xi) + gx) + 0.5 * depth_x * delta * delta
                    mk_x += m
                    blk_x += m
                    fee_x += gx * s_x
                    vol_x += s_x
                    px += dr * delta
                if s_c > 0.0:
                    delta = s_c / depth_c
                    m = s_c * (dr * (pc - xi) + g_c) + 0.5 * depth_c * delta * delta
                    mk_c += m
                    blk_c += m
                    fee_c += g_c * s_c
                    vol_c += s_c
                    pc += dr * delta
        pnl_x[i] = blk_x
        pnl_c[i] = blk_c
    bx = PoolBook(vol_x, fee_x, mk_x, arb_x, afee_x, depth_x * lvr_unit, traded_x, pnl_x)
    bc = PoolBook(vol_c, fee_c, mk_c, arb_c, afee_c, depth_c * lvr_unit, traded_c, pnl_c)
    return bx, bc
