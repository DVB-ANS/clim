"""Replay of 2026-02-04 12:00-16:00 UTC: lab/out/replay-2026-02-04.json (plans 05 and 06) and
lab/out/replay-window.json (plan 04's replay server)."""

import sys

from clim_lab.data import OUT_DIR, load_params, load_window
from clim_lab.fee import HookParams
from clim_lab.replay import POINT_SEC, replay_points, replay_window
from clim_lab.report import now_iso, write_json


def main() -> int:
    params = HookParams.from_json(load_params())
    series, dvol = load_window("feb")
    points, summary = replay_points(series, dvol, params)
    write_json(
        OUT_DIR / "replay-2026-02-04.json",
        {
            "schema": "clim.lab.replay/1",
            "generatedAt": now_iso(),
            "window": {
                "id": "feb04",
                "label": "4 Feb 2026 12:00-16:00 UTC",
                "startUtc": "2026-02-04T12:00:00Z",
                "endUtc": "2026-02-04T16:00:00Z",
                "source": "Binance ETHUSDT 1 s",
            },
            "params": {
                "pStar": params.p_star,
                "etaE4": params.eta_e4,
                "sqrtHalfDtE6": params.sqrt_half_dt_e6,
                "feeMinPips": params.fee_min_pips,
                "feeMaxPips": params.fee_max_pips,
                "staticFeePips": summary["staticFeePips"],
            },
            "units": {"arb": "USD per $1M of full-range-equivalent liquidity, cumulative from 12:00 UTC"},
            "pointSec": POINT_SEC,
            "points": points,
            "summary": summary,
            "t": [p["t"] for p in points],
            "price": [p["price"] for p in points],
            "sigmaAnnualPct": [p["sigmaAnnualPct"] for p in points],
            "feeVBp": [p["feeVBp"] for p in points],
            "feeSBp": summary["meanFeeSBp"],
            "arbCumVUsd": [p["cumArbV"] for p in points],
            "arbCumSUsd": [p["cumArbS"] for p in points],
        },
    )
    write_json(OUT_DIR / "replay-window.json", replay_window(series), compact=True)
    print(
        f"replay: fee {summary['minFeeVBp']:.1f}-{summary['maxFeeVBp']:.1f} bp (mean {summary['meanFeeVBp']:.2f}), "
        f"static S {summary['staticFeePips']} pips, ARB vs S {summary['arbChangePct']:+.1f}%, "
        f"P_trade obs {summary['pTradeObsV']:.3f} pred {summary['pTradePredV']:.3f}"
    )
    print(f"wrote {OUT_DIR / 'replay-2026-02-04.json'} and {OUT_DIR / 'replay-window.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
