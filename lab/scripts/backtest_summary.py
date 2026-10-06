"""Backtest summary at the decided parameters.

Writes lab/out/backtest-summary.json (plan 06 schema clim.lab.backtest/1, plus the lab's detailed sections as
extra keys) and lab/out/summary.json (plan 05 schema). Both are built from the same numbers.
"""

import json
import sys

import numpy as np

from clim_lab import model
from clim_lab.bridge import bridge_blocks
from clim_lab.compare import (
    arb_change,
    depth_units_to_bp_year,
    rolling_equal_time,
    static_fee_equal_cost,
    static_fee_equal_time,
)
from clim_lab.constants import BLOCK_SEC
from clim_lab.data import OUT_DIR, load_params, load_window, minutes_from_seconds
from clim_lab.desk import (
    block_schedule,
    desk_reports,
    desk_reports_minutes,
    fee_pips_array,
    log_bands,
    schedule_on_path,
)
from clim_lab.fee import HookParams
from clim_lab.inpool import run_arb_inpool
from clim_lab.lp import (
    SCENARIOS,
    MarketAssumptions,
    calibrate_rate,
    run_policy,
    summarize,
)
from clim_lab.replay import replay_points
from clim_lab.report import now_iso, write_json
from clim_lab.samples import SAMPLE_SEED_OFFSET, Sample, load_samples, year_sample
from clim_lab.sim import clustering, run_arb
from clim_lab.units import per_sqrt_s_to_annual, sigma_e9_from_annual

ROLL_BLOCKS, ROLL_STEP = 1_200, 300  # 4 h windows every hour
VOL_SCALE = 2.0  # "volatile asset": the 1-year ETH path with every log return doubled
PERIODS = {
    "feb": ("feb-2026", "Feb 2026 storm", "Binance ETHUSDT 1 s"),
    "oct": ("oct-2026", "Oct 2026 calm", "Binance ETHUSDT 1 s"),
    "year": ("year", "Oct 2025 to Oct 2026 (1-min data bridged)", "Binance ETHUSDT 1 min, bridged to 12 s blocks"),
}
LP_KEYS = (
    "policy",
    "meanFeeBp",
    "retailShare",
    "retailFeesBpYr",
    "retailMarkoutBpYr",
    "arbBpYr",
    "arbFeesBpYr",
    "lvrBpYr",
    "lpPnlBpYr",
)


def utc(t: int) -> str:
    return np.datetime_as_string(np.datetime64(int(t), "s"), unit="m").replace("T", " ")


def sample_stats(smp: Sample, params: HookParams) -> dict:
    s = smp.sched
    fees = fee_pips_array(s.sigma_e9, params)
    g = log_bands(fees)
    run = run_arb(s.x, g)
    eta = model.eta(g, s.sigma, BLOCK_SEC)
    ann = 100.0 * per_sqrt_s_to_annual(s.sigma)
    after, after_none = clustering(run.traded)
    return {
        "name": smp.name,
        "start": int(s.t[0]),
        "end": int(s.t[-1]),
        "blocks": len(s),
        "sigmaAnnualPctMedian": float(np.median(ann)),
        "sigmaAnnualPctP90": float(np.percentile(ann, 90)),
        "sigmaAnnualPctMax": float(np.max(ann)),
        "meanFeeBp": float(np.mean(fees)) / 100.0,
        "floorShare": float(np.mean(fees == params.fee_min_pips)),
        "capShare": float(np.mean(fees == params.fee_max_pips)),
        "pTradeObserved": run.p_trade,
        "pTradePredicted": float(np.mean(model.p_trade_fixed(eta))),
        "arbOverLvrObserved": run.arb / run.lvr,
        "arbOverLvrModel": float(np.sum(model.arb_over_lvr_fixed(eta) * s.sigma**2) / np.sum(s.sigma**2)),
        "sigmaArbOverSigmaHat": model.sigma_arb(float(np.mean(g)), run.p_trade, BLOCK_SEC) / float(np.mean(s.sigma)),
        "clustering": {"afterArb": after, "afterNoArb": after_none},
        "equalTimeAverage": arb_change(s, fees, static_fee_equal_time(fees)),
        "equalTraderCost": {**arb_change(s, fees, static_fee_equal_cost(fees, s.sigma)), "volumeWeights": "sigma"},
    }


def in_pool(smp: Sample, params: HookParams, desk: dict) -> dict:
    """Gain at equal time-average fee of a pool-internal volatility, as a share of the desk's gain."""
    s = smp.sched
    run, fees = run_arb_inpool(s.t, s.x, params)
    static = run_arb(s.x, float(log_bands(np.array([fees.mean()]))[0]))
    gain_in = depth_units_to_bp_year(static.arb - run.arb, len(s))
    gain_desk = desk["arbStaticBpYr"] - desk["arbDynamicBpYr"]
    return {
        "name": smp.name,
        "deskGainBpYr": gain_desk,
        "inPoolGainBpYr": gain_in,
        "inPoolMeanFeeBp": float(fees.mean()) / 100.0,
        "sharePct": 100.0 * gain_in / gain_desk,
    }


def feb_windows(smp: Sample, params: HookParams) -> list[dict]:
    fees = fee_pips_array(smp.sched.sigma_e9, params)
    out = []
    for a, pct in rolling_equal_time(smp.sched, fees, ROLL_BLOCKS, ROLL_STEP):
        t0 = int(smp.sched.t[a])
        out.append(
            {"id": f"feb-{a // ROLL_STEP:03d}", "label": f"{utc(t0)} UTC + 4 h", "start": t0, "arbChangePct": pct}
        )
    return out


def volatile_asset(params: HookParams) -> dict:
    m = MarketAssumptions()
    smp = year_sample(m.seed, vol_scale=VOL_SCALE)
    norm = float(smp.sched.sigma.mean())
    seed = m.seed + SAMPLE_SEED_OFFSET["year"]
    rate = calibrate_rate(smp.sched, m, norm, seed)
    pnl = {}
    for policy in (f"clim_p{round(params.p_star * 100)}", "static_5bp"):
        bx, bc, fees = run_policy(smp.sched, policy, rate, "aggregator", m, norm, seed)
        pnl[policy] = summarize("year", "aggregator", policy, bx, bc, fees, m)["lpPnlBpYr"]
    clim, static = pnl[f"clim_p{round(params.p_star * 100)}"], pnl["static_5bp"]
    return {
        "volScale": VOL_SCALE,
        "retailOrdersPerBlock": rate,
        "lpPnlBpYrClim": clim,
        "lpPnlBpYrStatic5": static,
        "gainPctPerYear": (clim - static) / 100.0,
    }


def bridge_check(name: str, params: HookParams) -> list[dict]:
    """ARB on bridged 12 s paths built from the window's own minute closes, divided by ARB on the real 1 s path."""
    series, _ = load_window(name)
    real = block_schedule(series, desk_reports(series))
    minutes = minutes_from_seconds(series)
    t, x = bridge_blocks(minutes, seed=MarketAssumptions().seed)
    bridged = schedule_on_path(t, x, desk_reports_minutes(minutes))
    out = []
    for policy in ("clim", "static_5bp"):
        if policy == "clim":
            g_real = log_bands(fee_pips_array(real.sigma_e9, params))
            g_br = log_bands(fee_pips_array(bridged.sigma_e9, params))
        else:
            g_real = g_br = float(log_bands(np.array([500]))[0])
        ratio = (run_arb(bridged.x, g_br).arb / len(bridged)) / (run_arb(real.x, g_real).arb / len(real))
        out.append({"window": name, "policy": policy, "arbRatioBridgeOverReal": ratio})
    return out


def main() -> int:
    params = HookParams.from_json(load_params())
    decision = json.loads((OUT_DIR / "pstar_decision.json").read_text())
    chosen = f"clim_p{round(params.p_star * 100)}"
    samples = load_samples(MarketAssumptions().seed)
    stats = {name: sample_stats(smp, params) for name, smp in samples.items()}
    pools = {name: in_pool(smp, params, stats[name]["equalTimeAverage"]) for name, smp in samples.items()}
    windows = feb_windows(samples["feb"], params)
    vol = volatile_asset(params)
    feb_series, feb_dvol = load_window("feb")
    _, replay = replay_points(feb_series, feb_dvol, params)
    year_rows = {(r["scenario"], r["policy"]): r["lpPnlBpYr"] for r in decision["results"] if r["sample"] == "year"}
    gains = [(year_rows[(sc, chosen)] - year_rows[(sc, "static_5bp")]) / 100.0 for sc in SCENARIOS]
    top5 = 100.0 * decision["year"]["attribution"][chosen]["shareOfGainTop5TurbulentWeeks"]
    severity = [stats[n]["arbOverLvrObserved"] / stats[n]["arbOverLvrModel"] for n in stats]
    shares = [pools[n]["sharePct"] for n in pools]
    window_pcts = [w["arbChangePct"] for w in windows]
    window_median = float(np.median(window_pcts))
    window_better = sum(1 for x in window_pcts if x < 0)
    beating_chosen = sum(1 for x in window_pcts if x < replay["arbChangePct"])
    for name, st in stats.items():
        print(
            f"{name}: fee {st['meanFeeBp']:.1f} bp, P_trade obs {st['pTradeObserved']:.3f} pred {st['pTradePredicted']:.3f}, "
            f"ARB vs static (equal time-average) {st['equalTimeAverage']['arbChangePct']:+.1f}%, "
            f"(equal trader cost) {st['equalTraderCost']['arbChangePct']:+.1f}%, "
            f"in-pool share {pools[name]['sharePct']:.0f}%"
        )
    print(
        f"LP gain vs static 5 bp, year, 5 scenarios: {min(gains):+.2f} to {max(gains):+.2f} %/yr; "
        f"volatile asset (x{VOL_SCALE:g}): {vol['gainPctPerYear']:+.2f} %/yr; top-5 weeks {top5:.0f}%; "
        f"severity ratio {min(severity):.2f}-{max(severity):.2f}; Feb 4 h windows {min(window_pcts):+.1f}% to {max(window_pcts):+.1f}% "
        f"(median {window_median:+.1f}%, {window_better} of {len(window_pcts)} better than static); "
        f"replay {replay['arbChangePct']:+.1f}%, {beating_chosen} windows better"
    )

    periods = []
    for name, st in stats.items():
        pid, label, source = PERIODS[name]
        eq_t, eq_c = st["equalTimeAverage"], st["equalTraderCost"]
        periods.append(
            {
                "id": pid,
                "label": label,
                "source": source,
                "blocks": st["blocks"],
                "equalTimeAvgFee": {
                    "staticFeeBp": eq_t["staticFeeBp"],
                    "dynMeanFeeBp": st["meanFeeBp"],
                    "arbChangePct": eq_t["arbChangePct"],
                },
                "equalTraderCost": {
                    "staticFeeBp": eq_c["staticFeeBp"],
                    "dynVolWeightedFeeBp": eq_c["staticFeeBp"],
                    "arbChangePct": eq_c["arbChangePct"],
                },
                "pTrade": {"observed": st["pTradeObserved"], "predicted": st["pTradePredicted"]},
                "arbOverLvr": {"observed": st["arbOverLvrObserved"], "model": st["arbOverLvrModel"]},
            }
        )
    for name, st in stats.items():
        st["lp"] = [
            {k: r[k] for k in LP_KEYS}
            for r in decision["results"]
            if r["sample"] == name and r["scenario"] == "aggregator"
        ]
    p10 = HookParams.from_pstar(0.1)
    legacy = {}
    for name in ("feb", "oct"):
        s = samples[name].sched
        g = log_bands(fee_pips_array(s.sigma_e9, p10))
        legacy[name] = {
            "pTradeObserved": run_arb(s.x, g).p_trade,
            "pTradePredicted": float(np.mean(model.p_trade_fixed(model.eta(g, s.sigma, BLOCK_SEC)))),
        }
    curve = []
    for pct in range(10, 305, 5):
        fee = params.fee(sigma_e9_from_annual(pct / 100.0))
        curve.append({"sigmaAnnualPct": pct, "feePips": fee, "feeBp": fee / 100.0})
    generated = now_iso()
    write_json(
        OUT_DIR / "backtest-summary.json",
        {
            "schema": "clim.lab.backtest/1",
            "generatedAt": generated,
            "pStar": params.p_star,
            "feeMinBp": params.fee_min_pips / 100.0,
            "periods": periods,
            "replayWindows": [{k: w[k] for k in ("id", "label", "arbChangePct")} for w in windows],
            "replayWindowsMedianPct": window_median,
            "replayWindowsBetterCount": window_better,
            "lpGainPctPerYear": {
                "low": min(gains),
                "high": max(gains),
                "note": "full-range ETH LP vs a static 5 bp pool, 1-year replay, 5 retail scenarios",
                "volatileAssetHigh": vol["gainPctPerYear"],
                "top5WeeksSharePct": top5,
            },
            "inPoolVolGainSharePct": {"low": min(shares), "high": max(shares)},
            "params": {
                "pStar": params.p_star,
                "etaE4": params.eta_e4,
                "sqrtHalfDtE6": params.sqrt_half_dt_e6,
                "feeMinPips": params.fee_min_pips,
                "feeMaxPips": params.fee_max_pips,
            },
            "feeCurve": curve,
            "samples": list(stats.values()),
            "inPool": list(pools.values()),
            "volatileAsset": vol,
            "bridgeCheck": bridge_check("feb", params) + bridge_check("oct", params),
            "pStar10Check": legacy,
            "yearAttribution": decision["year"]["attribution"],
        },
    )
    write_json(
        OUT_DIR / "summary.json",
        {
            "schema": "clim.lab.summary/1",
            "generatedAt": generated,
            "setting": {"pStar": params.p_star, "feeMinPips": params.fee_min_pips},
            "comparisons": {
                "equalAvgFee": [
                    {"period": p["label"], "arbChangePct": p["equalTimeAvgFee"]["arbChangePct"]} for p in periods
                ],
                "equalTraderCost": [
                    {"period": p["label"], "arbChangePct": p["equalTraderCost"]["arbChangePct"]} for p in periods
                ],
            },
            "pTrade": [
                {
                    "period": p["label"],
                    "predicted": p["pTrade"]["predicted"],
                    "observed": p["pTrade"]["observed"],
                    "blocks": p["blocks"],
                }
                for p in periods
            ],
            "replay": {
                "window": "2026-02-04 12:00-16:00 UTC",
                "sigmaMinPct": replay["sigmaAnnualPctMin"],
                "sigmaMaxPct": replay["sigmaAnnualPctMax"],
                "feeVMinBp": replay["minFeeVBp"],
                "feeVMaxBp": replay["maxFeeVBp"],
                "feeSBp": replay["meanFeeSBp"],
                "arbChangePct": replay["arbChangePct"],
                "arbChangeRangePct": [min(window_pcts), max(window_pcts)],
                "windowsMedianPct": window_median,
                "windowsBetterCount": window_better,
                "windowsCount": len(window_pcts),
                "windowsBeatingChosenCount": beating_chosen,
                "pTradePredicted": replay["pTradePredV"],
                "pTradeObserved": replay["pTradeObsV"],
            },
            "lpGain": {
                "fullRangeEthPctPerYear": [min(gains), max(gains)],
                "volatileAssetPctPerYearMax": vol["gainPctPerYear"],
                "shareFromTop5WeeksPct": top5,
            },
            "modelSeverityRatio": [min(severity), max(severity)],
            "inPoolVolGainSharePct": [min(shares), max(shares)],
        },
    )
    print(f"wrote {OUT_DIR / 'backtest-summary.json'} and {OUT_DIR / 'summary.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
