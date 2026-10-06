import numpy as np

from clim_lab.desk import BlockSchedule
from clim_lab.lp import (
    SCENARIOS,
    MarketAssumptions,
    attribution,
    calibrate_rate,
    decide,
    monthly_wins,
    policy_fee_pips,
    run_policy,
    summarize,
)


def _sched(n: int = 30_000, seed: int = 2) -> BlockSchedule:
    rng = np.random.default_rng(seed)
    sigma_e9 = np.where(np.arange(n) < n // 2, 30_000, 200_000).astype(np.int64)
    x = np.cumsum(rng.normal(0, 1.0, n) * sigma_e9 / 1e9 * np.sqrt(12))
    return BlockSchedule(np.arange(n, dtype=np.int64) * 12, x, sigma_e9, np.zeros(n, dtype=np.int64))


def test_policy_fees():
    s = _sched(10)
    assert set(policy_fee_pips("static_5bp", s)) == {500}
    assert set(policy_fee_pips("static_30bp", s)) == {3000}
    f = policy_fee_pips("clim_p30", s)
    assert f[0] == 500 and f[-1] > 500


def test_calibration_breaks_even_static_pool():
    s = _sched()
    m = MarketAssumptions()
    norm = float(s.sigma.mean())
    rate = calibrate_rate(s, m, norm, flow_seed=5)
    bx, bc, fees = run_policy(s, "static_5bp", rate, "aggregator", m, norm, 5)
    row = summarize("syn", "aggregator", "static_5bp", bx, bc, fees, m)
    assert rate > 0
    assert abs(row["lpPnlBpYr"]) < 0.02 * row["arbBpYr"]
    assert abs(row["retailShare"] - 0.2) < 0.01


def test_decide_rule():
    def rows(p20, p30, sc_wins_p20):
        out = []
        for i, sc in enumerate(SCENARIOS):
            hi = i < sc_wins_p20
            v20 = p20 if sc == "aggregator" else (2.0 if hi else 1.0)
            v30 = p30 if sc == "aggregator" else (1.0 if hi else 2.0)
            out += [
                {"sample": "year", "scenario": sc, "policy": "clim_p20", "lpPnlBpYr": v20},
                {"sample": "year", "scenario": sc, "policy": "clim_p30", "lpPnlBpYr": v30},
            ]
        return out

    assert decide(rows(10.0, 30.0, 0))[0] == 0.3
    assert decide(rows(30.0, 10.0, 0))[0] == 0.2
    assert decide(rows(10.0, 11.0, 5))[0] == 0.2  # tie on aggregator, P*=0.2 wins 4 of the other scenarios
    chosen, reason = decide(rows(10.0, 10.5, 0))
    assert chosen == 0.3 and "tie" in reason


def test_attribution_and_monthly_wins():
    week = 7 * 86_400
    t = np.array([0, 1, week, week + 1, 2 * week], dtype=np.int64) + 1_767_225_600  # 2026-01-01 00:00 UTC
    sched = BlockSchedule(t, np.zeros(5), np.array([10, 10, 90, 90, 20], dtype=np.int64), np.zeros(5, dtype=np.int64))
    policy = np.array([1.0, 1.0, 5.0, 5.0, -1.0])
    static = np.zeros(5)
    a = attribution(sched, policy, static, tvl_usd=1e6, top_weeks=1)
    assert a["weeks"] == 3 and a["weeksWithGain"] == 2
    assert a["shareOfGainTop5TurbulentWeeks"] == 10.0 / 11.0
    wins, months = monthly_wins(sched, policy, static)
    assert (wins, months) == (1, 1)
