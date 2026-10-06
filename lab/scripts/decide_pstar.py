"""Decide P* (0.2 vs 0.3) by LP P&L against a 5 bp competitor; write lab/out/pstar_decision.json and shared/params.json."""

import argparse
import json
import sys

import numpy as np

from clim_lab.constants import (
    FEE_MAX_PIPS,
    FEE_MIN_PIPS,
    FEE_SAFE_PIPS,
    PSTAR_CANDIDATES,
    TAU_KILL_SEC,
)
from clim_lab.data import OUT_DIR, SHARED_DIR, load_window
from clim_lab.desk import fee_pips_array
from clim_lab.fee import HookParams
from clim_lab.lp import (
    POLICIES,
    SCENARIOS,
    TIE_BP_YR,
    MarketAssumptions,
    attribution,
    calibrate_rate,
    decide,
    monthly_wins,
    run_policy,
    sensitivity,
    summarize,
)
from clim_lab.replay import static_fee_pips
from clim_lab.report import now_iso, write_json
from clim_lab.samples import SAMPLE_SEED_OFFSET, load_samples

RULE = (
    "Primary: higher LP P&L (retail markout - ARB, bp/yr of TVL) of the clim pool over the 1-year sample "
    "(1-minute closes bridged to 12 s blocks), scenario 'aggregator' (all retail routed by an aggregator "
    "between the clim pool and a 4x deeper static 5 bp pool; retail intensity calibrated so that a static "
    f"5 bp pool breaks even over the year). Tie if the difference is below {TIE_BP_YR} bp/yr: the P* that "
    "wins more of the 5 scenarios; still tied: 0.3 (lower fees for traders). The Feb and Oct 1 s windows "
    "are reported per regime but not used to decide: 4 storm days out of 7 overweight storms about 6x."
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--force", action="store_true", help="overwrite a decided shared/params.json that holds a different pStar"
    )
    ap.add_argument("--seed", type=int, default=MarketAssumptions().seed, help="bridge and retail-flow seed")
    ap.add_argument("--no-write", action="store_true", help="print the decision only (robustness reruns)")
    args = ap.parse_args()

    m = MarketAssumptions(seed=args.seed)
    samples = load_samples(m.seed)
    year = samples["year"]
    sigma_norm = float(year.sched.sigma.mean())
    rate = calibrate_rate(year.sched, m, sigma_norm, m.seed + SAMPLE_SEED_OFFSET["year"])
    print(f"retail orders per block (year calibration): {rate:.4f}")

    rows, year_books = [], {}
    for name, smp in samples.items():
        for scenario in SCENARIOS:
            for policy in POLICIES:
                bx, bc, fees = run_policy(
                    smp.sched, policy, rate, scenario, m, sigma_norm, m.seed + SAMPLE_SEED_OFFSET[name]
                )
                rows.append(summarize(name, scenario, policy, bx, bc, fees, m))
                if name == "year" and scenario == "aggregator":
                    year_books[policy] = bx
                r = rows[-1]
                print(
                    f"{name:4s} {scenario:15s} {policy:12s} share {r['retailShare']:.3f} pnl {r['lpPnlBpYr']:8.1f} bp/yr"
                )

    chosen, reason = decide(rows)
    print(f"chosen P* = {chosen}: {reason}")
    if args.no_write:
        return 0
    params_path = SHARED_DIR / "params.json"
    if params_path.exists() and not args.force:
        old = json.loads(params_path.read_text())
        provisional = str(old.get("decidedBy", "")).startswith(("PROVISIONAL", "FIXTURE"))
        if old.get("pStar") != chosen and not provisional:
            print(
                f"refusing to change shared/params.json pStar {old.get('pStar')} -> {chosen} without --force",
                file=sys.stderr,
            )
            return 1

    base = year_books["static_5bp"].pnl_by_block
    year_info = {
        "blocks": len(year.sched),
        "start": int(year.sched.t[0]),
        "end": int(year.sched.t[-1]),
        "attribution": {
            p: attribution(year.sched, year_books[p].pnl_by_block, base, m.tvl_x_usd) for p in ("clim_p20", "clim_p30")
        },
    }
    w20, months = monthly_wins(year.sched, year_books["clim_p20"].pnl_by_block, year_books["clim_p30"].pnl_by_block)
    year_info["monthsP20BeatsP30"] = w20
    year_info["months"] = months
    year_info["sensitivity"] = sensitivity(year.sched, m, sigma_norm, m.seed + SAMPLE_SEED_OFFSET["year"])
    for v in year_info["sensitivity"]:
        print(
            f"sensitivity {v['variant']:24s} P20 {v['lpPnlBpYrP20']:7.1f}  P30 {v['lpPnlBpYrP30']:7.1f}  better {v['better']}"
        )

    params = HookParams.from_pstar(chosen)
    feb_series, _ = load_window("feb")
    twin = {
        "liveStaticFeePips": int(round(float(np.mean(fee_pips_array(samples["oct"].sched.sigma_e9, params))))),
        "replayStaticFeePips": static_fee_pips(feb_series, params),
        "note": "Static fee of pool S = time-average clim fee: live from the Oct 2026 calm window, replay over 2026-02-04 12:00-16:00 UTC.",
    }

    decided_at = now_iso()
    decision = {
        "schema": "clim.lab.pstar_decision/1",
        "generatedAt": decided_at,
        "candidates": list(PSTAR_CANDIDATES),
        "chosen": chosen,
        "rule": RULE,
        "reason": reason,
        "market": {
            **m.as_json(),
            "retailOrdersPerBlock": rate,
            "calibration": "static 5 bp clim-side pool breaks even over the year (aggregator)",
        },
        "scenarios": list(SCENARIOS),
        "policies": list(POLICIES),
        "results": rows,
        "year": year_info,
        "twinPools": twin,
    }
    write_json(OUT_DIR / "pstar_decision.json", decision)

    write_json(
        params_path,
        {
            "pStar": chosen,
            "etaE4": params.eta_e4,
            "sqrtHalfDtE6": params.sqrt_half_dt_e6,
            "feeMinPips": FEE_MIN_PIPS,
            "feeMaxPips": FEE_MAX_PIPS,
            "feeSafePips": FEE_SAFE_PIPS,
            "tauKillSec": TAU_KILL_SEC,
            "staticFeePips": twin["liveStaticFeePips"],
            "replayStaticFeePips": twin["replayStaticFeePips"],
            "decidedBy": f"lab/scripts/decide_pstar.py: {reason}",
            "decidedAt": decided_at,
        },
    )
    print(f"wrote {OUT_DIR / 'pstar_decision.json'} and {params_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
