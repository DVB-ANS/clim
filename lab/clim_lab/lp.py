"""LP P&L of the clim pool against a deeper static 5 bp competitor, and the P* decision rule."""

from dataclasses import asdict, dataclass

import numpy as np

from .constants import BLOCK_SEC, PSTAR_CANDIDATES
from .desk import BlockSchedule, fee_pips_array, log_bands
from .fee import HookParams
from .market import PoolBook, make_retail_flow, run_market
from .report import bp_per_year


@dataclass(frozen=True)
class MarketAssumptions:
    tvl_x_usd: float = 50_000_000.0  # clim pool, full-range-equivalent TVL
    tvl_c_usd: float = 200_000_000.0  # competitor, 4x deeper
    competitor_fee_pips: int = 500
    retail_median_usd: float = 2_000.0
    retail_log_sd: float = 1.2
    sticky_share: float = 0.3
    seed: int = 20_261_006

    def as_json(self) -> dict:
        d = asdict(self)
        return {
            "tvlClimUsd": d["tvl_x_usd"],
            "tvlCompetitorUsd": d["tvl_c_usd"],
            "competitorFeePips": d["competitor_fee_pips"],
            "retailMedianUsd": d["retail_median_usd"],
            "retailLogSd": d["retail_log_sd"],
            "stickyShare": d["sticky_share"],
            "seed": d["seed"],
        }


# name -> (retail intensity proportional to sigma?, sticky share used?, flow multiplier)
SCENARIOS = {
    "aggregator": (False, False, 1.0),
    "aggregator_vol": (True, False, 1.0),
    "sticky30": (False, True, 1.0),
    "flow_half": (False, False, 0.5),
    "flow_double": (False, False, 2.0),
}
POLICIES = ("clim_p20", "clim_p30", "static_5bp", "static_30bp")
POLICY_PSTAR = {"clim_p20": 0.2, "clim_p30": 0.3, "static_5bp": None, "static_30bp": None}
TIE_BP_YR = 2.0


def policy_fee_pips(policy: str, sched: BlockSchedule) -> np.ndarray:
    if policy == "static_5bp":
        return np.full(len(sched), 500, dtype=np.int64)
    if policy == "static_30bp":
        return np.full(len(sched), 3_000, dtype=np.int64)
    return fee_pips_array(sched.sigma_e9, HookParams.from_pstar(POLICY_PSTAR[policy]))


def run_policy(
    sched: BlockSchedule,
    policy: str,
    rate: float,
    scenario: str,
    m: MarketAssumptions,
    sigma_norm: float,
    flow_seed: int,
) -> tuple[PoolBook, PoolBook, np.ndarray]:
    vol_scaled, sticky, mult = SCENARIOS[scenario]
    intensity = sched.sigma / sigma_norm if vol_scaled else None
    flow = make_retail_flow(len(sched), rate * mult, m.retail_median_usd, m.retail_log_sd, flow_seed, intensity)
    fees = policy_fee_pips(policy, sched)
    g_c = float(log_bands(np.array([m.competitor_fee_pips]))[0])
    bx, bc = run_market(
        sched.x, log_bands(fees), g_c, m.tvl_x_usd / 4.0, m.tvl_c_usd / 4.0, flow, m.sticky_share if sticky else 0.0
    )
    return bx, bc, fees


def calibrate_rate(
    sched: BlockSchedule, m: MarketAssumptions, sigma_norm: float, flow_seed: int, iters: int = 4
) -> float:
    """Retail orders per block such that the static 5 bp clim-side pool breaks even (aggregator scenario)."""

    def pnl(rate: float) -> float:
        return run_policy(sched, "static_5bp", rate, "aggregator", m, sigma_norm, flow_seed)[0].lp_pnl

    r0 = 1.0
    bx = run_policy(sched, "static_5bp", r0, "aggregator", m, sigma_norm, flow_seed)[0]
    f0 = bx.lp_pnl
    r1 = r0 * bx.arb / bx.retail_markout
    f1 = pnl(r1)
    for _ in range(iters):
        if f1 == f0:
            break
        r0, f0, r1 = r1, f1, r1 - f1 * (r1 - r0) / (f1 - f0)
        f1 = pnl(r1)
    return r1


def summarize(
    sample: str, scenario: str, policy: str, bx: PoolBook, bc: PoolBook, fees: np.ndarray, m: MarketAssumptions
) -> dict:
    seconds = len(fees) * BLOCK_SEC
    total = bx.retail_volume + bc.retail_volume
    return {
        "sample": sample,
        "scenario": scenario,
        "policy": policy,
        "pStar": POLICY_PSTAR[policy],
        "meanFeeBp": float(np.mean(fees)) / 100.0,
        "retailShare": bx.retail_volume / total if total > 0 else 0.0,
        "retailFeesBpYr": bp_per_year(bx.retail_fees, m.tvl_x_usd, seconds),
        "retailMarkoutBpYr": bp_per_year(bx.retail_markout, m.tvl_x_usd, seconds),
        "arbBpYr": bp_per_year(bx.arb, m.tvl_x_usd, seconds),
        "arbFeesBpYr": bp_per_year(bx.arb_fees, m.tvl_x_usd, seconds),
        "lvrBpYr": bp_per_year(bx.lvr, m.tvl_x_usd, seconds),
        "lpPnlBpYr": bp_per_year(bx.lp_pnl, m.tvl_x_usd, seconds),
        "pTradeObserved": float(bx.traded.mean()),
    }


def decide(rows: list[dict], sample: str = "year") -> tuple[float, str]:
    """Primary: higher LP P&L in `sample`, aggregator scenario. Tie (< TIE_BP_YR): more scenario wins. Then 0.3."""

    def pnl(scenario: str, p: float) -> float:
        name = f"clim_p{int(round(p * 100))}"
        return next(
            r["lpPnlBpYr"] for r in rows if r["sample"] == sample and r["scenario"] == scenario and r["policy"] == name
        )

    a, b = PSTAR_CANDIDATES
    pa, pb = pnl("aggregator", a), pnl("aggregator", b)
    wins = {a: 0, b: 0}
    for sc in SCENARIOS:
        wins[a if pnl(sc, a) > pnl(sc, b) else b] += 1
    if abs(pa - pb) >= TIE_BP_YR:
        chosen = a if pa > pb else b
        why = f"{sample}/aggregator LP P&L: P*={a}: {pa:.1f} bp/yr, P*={b}: {pb:.1f} bp/yr"
    elif wins[a] != wins[b]:
        chosen = a if wins[a] > wins[b] else b
        why = f"tie on {sample}/aggregator ({pa:.1f} vs {pb:.1f} bp/yr); scenario wins {wins}"
    else:
        chosen = 0.3
        why = f"tie on {sample}/aggregator ({pa:.1f} vs {pb:.1f} bp/yr) and on scenario wins {wins}: default 0.3"
    return chosen, f"{why}; P*={chosen} wins {wins[chosen]} of {len(SCENARIOS)} scenarios"


def attribution(
    sched: BlockSchedule, pnl_policy: np.ndarray, pnl_static: np.ndarray, tvl_usd: float, top_weeks: int = 5
) -> dict:
    """Gain vs the static 5 bp pool: total, share earned in the most turbulent weeks, weeks with a gain."""
    week = (sched.t - sched.t[0]) // (7 * 86_400)
    diff = pnl_policy - pnl_static
    weekly = np.bincount(week, weights=diff)
    mean_sigma = np.bincount(week, weights=sched.sigma) / np.bincount(week)
    turbulent = np.argsort(mean_sigma)[::-1][:top_weeks]
    total = float(weekly.sum())
    return {
        "gainVsStatic5BpYr": bp_per_year(total, tvl_usd, len(sched) * BLOCK_SEC),
        "shareOfGainTop5TurbulentWeeks": float(weekly[turbulent].sum() / total) if total != 0 else None,
        "weeksWithGain": int((weekly > 0).sum()),
        "weeks": int(len(weekly)),
    }


def monthly_wins(sched: BlockSchedule, pnl_a: np.ndarray, pnl_b: np.ndarray) -> tuple[int, int]:
    """Calendar months (UTC) in which policy a earns more than policy b, and the number of months."""
    month = sched.t.astype("datetime64[s]").astype("datetime64[M]")
    _, idx = np.unique(month, return_inverse=True)
    diff = np.bincount(idx, weights=pnl_a - pnl_b)
    return int((diff > 0).sum()), int(len(diff))


# Sensitivity of the year/aggregator comparison to the market assumptions (reported, not used to decide).
SENSITIVITY = {
    "competitor_depth_1x": {"tvl_c_usd": 50_000_000.0},
    "competitor_depth_10x": {"tvl_c_usd": 500_000_000.0},
    "orders_median_500usd": {"retail_median_usd": 500.0},
    "orders_median_20000usd": {"retail_median_usd": 20_000.0},
}


def sensitivity(sched: BlockSchedule, base: MarketAssumptions, sigma_norm: float, flow_seed: int) -> list[dict]:
    out = []
    for name, change in SENSITIVITY.items():
        m = MarketAssumptions(**{**asdict(base), **change})
        rate = calibrate_rate(sched, m, sigma_norm, flow_seed)
        pnl = {}
        for policy in ("clim_p20", "clim_p30"):
            bx, bc, fees = run_policy(sched, policy, rate, "aggregator", m, sigma_norm, flow_seed)
            pnl[policy] = summarize("year", "aggregator", policy, bx, bc, fees, m)["lpPnlBpYr"]
        out.append(
            {
                "variant": name,
                "retailOrdersPerBlock": rate,
                "lpPnlBpYrP20": pnl["clim_p20"],
                "lpPnlBpYrP30": pnl["clim_p30"],
                "better": 0.2 if pnl["clim_p20"] > pnl["clim_p30"] else 0.3,
            }
        )
    return out
