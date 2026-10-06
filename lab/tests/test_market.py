import math

import numpy as np

from clim_lab.market import RetailFlow, make_retail_flow, route, run_market
from clim_lab.sim import run_arb


def _no_flow(n: int) -> RetailFlow:
    return RetailFlow(np.zeros(n), np.zeros(n), np.ones(n, dtype=bool))


def test_route_small_order_goes_to_cheaper_pool():
    assert route(0.0005, 1e6, 0.0010, 4e6, 100.0) == (100.0, 0.0)
    assert route(0.0010, 1e6, 0.0005, 4e6, 100.0) == (0.0, 100.0)


def test_route_equalises_marginal_cost_for_large_orders():
    s_x, s_c = route(0.0005, 1e6, 0.0006, 4e6, 10_000.0)
    assert math.isclose(s_x + s_c, 10_000.0)
    assert math.isclose(0.0005 + s_x / 1e6, 0.0006 + s_c / 4e6, rel_tol=1e-12)


def test_route_equal_prices_split_pro_rata_of_depth():
    s_x, s_c = route(0.0005, 1e6, 0.0005, 4e6, 1_000.0)
    assert math.isclose(s_x, 200.0) and math.isclose(s_c, 800.0)


def test_make_retail_flow_is_deterministic_and_scaled():
    a = make_retail_flow(20_000, 2.0, 2_000.0, 1.2, seed=1)
    b = make_retail_flow(20_000, 2.0, 2_000.0, 1.2, seed=1)
    assert np.array_equal(a.buy_usd, b.buy_usd) and np.array_equal(a.buy_first, b.buy_first)
    mean_order = 2_000.0 * math.exp(1.2**2 / 2)
    per_block = (a.buy_usd + a.sell_usd).mean()
    assert abs(per_block / (2.0 * mean_order) - 1.0) < 0.05
    hot = make_retail_flow(20_000, 2.0, 2_000.0, 1.2, seed=1, intensity=np.full(20_000, 2.0))
    assert abs((hot.buy_usd + hot.sell_usd).mean() / per_block - 2.0) < 0.1


def test_without_retail_market_reduces_to_single_pool_arb():
    rng = np.random.default_rng(3)
    x = np.cumsum(rng.normal(0, 1e-4, 20_000))
    bx, bc = run_market(x, 3e-4, 5e-4, 1e6, 4e6, _no_flow(len(x)))
    rx, rc = run_arb(x, 3e-4), run_arb(x, 5e-4)
    assert math.isclose(bx.arb, 1e6 * rx.arb, rel_tol=1e-12)
    assert math.isclose(bc.arb, 4e6 * rc.arb, rel_tol=1e-12)
    assert math.isclose(bx.lvr, 1e6 * rx.lvr, rel_tol=1e-12)
    assert np.array_equal(bx.traded, rx.traded)
    assert math.isclose(bx.pnl_by_block.sum(), bx.lp_pnl, rel_tol=1e-9)


def test_retail_markout_by_hand():
    flow = RetailFlow(np.array([1_000.0]), np.array([0.0]), np.array([True]))
    bx, bc = run_market(np.array([0.0]), 2e-4, 5e-4, 1e7, 1e7, flow)
    delta = 1_000.0 / 1e7
    assert math.isclose(bx.retail_volume, 1_000.0)
    assert math.isclose(bx.retail_fees, 2e-4 * 1_000.0)
    assert math.isclose(bx.retail_markout, 1_000.0 * 2e-4 + 0.5 * 1e7 * delta * delta)
    assert bc.retail_volume == 0.0


def test_identical_pools_share_flow_by_depth():
    rng = np.random.default_rng(5)
    x = np.cumsum(rng.normal(0, 1e-4, 20_000))
    flow = make_retail_flow(len(x), 2.0, 2_000.0, 1.0, seed=9)
    bx, bc = run_market(x, 5e-4, 5e-4, 1e7, 4e7, flow)
    share = bx.retail_volume / (bx.retail_volume + bc.retail_volume)
    assert abs(share - 0.2) < 0.01
    assert math.isclose(bx.pnl_by_block.sum(), bx.lp_pnl, rel_tol=1e-9)


def test_higher_fee_loses_flow_to_competitor():
    rng = np.random.default_rng(5)
    x = np.cumsum(rng.normal(0, 1e-4, 20_000))
    flow = make_retail_flow(len(x), 2.0, 2_000.0, 1.0, seed=9)
    cheap, _ = run_market(x, 5e-4, 5e-4, 1e7, 4e7, flow)
    dear, _ = run_market(x, 30e-4, 5e-4, 1e7, 4e7, flow)
    sticky, _ = run_market(x, 30e-4, 5e-4, 1e7, 4e7, flow, sticky=0.3)
    assert dear.retail_volume < 0.05 * cheap.retail_volume
    assert sticky.retail_volume > 5 * dear.retail_volume
    assert dear.arb < cheap.arb
