"""The on-chain replay window: 2026-02-04 12:00-16:00 UTC from the Feb 1 s file."""

import numpy as np

from .data import REPLAY_END, REPLAY_START, REPLAY_WARMUP_SEC, DvolSeries, SecondSeries
from .desk import (
    BlockSchedule,
    DeskReports,
    block_schedule,
    desk_reports,
    fee_pips_array,
    log_bands,
)
from .fee import HookParams
from .model import eta, p_trade_fixed
from .sim import run_arb
from .units import per_sqrt_s_to_annual

POINT_SEC = 30
USD_PER_DEPTH_1M = 1_000_000 / 4  # depth D of a $1M full-range-equivalent pool
WINDOW_SOURCE = "Binance spot ETHUSDT 1s klines (close), 2026-02-04 11:30-16:00 UTC, forward-filled"


def replay_desk(series: SecondSeries) -> tuple[DeskReports, BlockSchedule]:
    """Replay desk: reports from REPLAY_START - warmup on the 30 s grid, blocks over [REPLAY_START, REPLAY_END).

    From 12:00 the applied sigma equals that of a desk whose first report is at 12:00 (checked: the envelope
    state converges before 12:00), so this matches an on-chain replay desk started at the main start.
    """
    reports = desk_reports(series, start=REPLAY_START - REPLAY_WARMUP_SEC, end=REPLAY_END)
    return reports, block_schedule(series, reports, start=REPLAY_START, end=REPLAY_END)


def static_fee_pips(series: SecondSeries, params: HookParams) -> int:
    """Static fee of the replay twin pool S: the time average of the clim fee over the replay blocks."""
    _, sched = replay_desk(series)
    return int(round(float(np.mean(fee_pips_array(sched.sigma_e9, params)))))


def replay_window(series: SecondSeries) -> dict:
    """Plan 04's replay-server input: 1 s closes from REPLAY_START - warmup to REPLAY_END."""
    start = REPLAY_START - REPLAY_WARMUP_SEC
    closes = np.exp(series.slice(start, REPLAY_END).logp)
    return {
        "symbol": "ETHUSDT",
        "source": WINDOW_SOURCE,
        "startTs": start,
        "stepSec": 1,
        "warmupSec": REPLAY_WARMUP_SEC,
        "closes": [round(float(c), 2) for c in closes],
    }


def replay_points(series: SecondSeries, dvol: DvolSeries, params: HookParams) -> tuple[list[dict], dict]:
    """One point every 30 s (V = clim pool, S = static pool at V's time-average fee) and a summary."""
    reports, sched = replay_desk(series)
    fees = fee_pips_array(sched.sigma_e9, params)
    static = int(round(float(np.mean(fees))))
    g = log_bands(fees)
    dyn = run_arb(sched.x, g)
    sta = run_arb(sched.x, float(log_bands(np.array([static]))[0]))
    pred = p_trade_fixed(eta(g, sched.sigma, 12))
    arb_dyn = np.cumsum(dyn.arb_by_block) * USD_PER_DEPTH_1M
    arb_sta = np.cumsum(sta.arb_by_block) * USD_PER_DEPTH_1M
    n_dyn = np.cumsum(dyn.traded)
    n_sta = np.cumsum(sta.traded)
    pred_cum = np.cumsum(pred)
    points = []
    for t in range(REPLAY_START, REPLAY_END, POINT_SEC):
        k = int(np.searchsorted(sched.t, t, side="right")) - 1
        i = int(sched.report_idx[k])
        points.append(
            {
                "t": t,
                "price": round(float(np.exp(series.at(t))), 2),
                "sigmaAnnualPct": 100.0 * per_sqrt_s_to_annual(sched.sigma_e9[k] / 1e9),
                "feeVBp": fees[k] / 100.0,
                "feeSBp": static / 100.0,
                "cumArbV": float(arb_dyn[k]),
                "cumArbS": float(arb_sta[k]),
                "sigmaE9": int(sched.sigma_e9[k]),
                "rv15E9": int(reports.sigma_e9[i]),
                "tObs": int(reports.t_obs[i]),
                "feePips": int(fees[k]),
                "pTradeObsCum": float(n_dyn[k] / (k + 1)),
                "pTradePredCum": float(pred_cum[k] / (k + 1)),
                "pTradeStaticObsCum": float(n_sta[k] / (k + 1)),
                "dvol": float(dvol.at(t)),
            }
        )
    sig = [p["sigmaAnnualPct"] for p in points]
    summary = {
        "meanFeeVBp": float(np.mean(fees)) / 100.0,
        "meanFeeSBp": static / 100.0,
        "arbV": float(arb_dyn[-1]),
        "arbS": float(arb_sta[-1]),
        "arbChangePct": 100.0 * (dyn.arb / sta.arb - 1.0),
        "pTradeObsV": dyn.p_trade,
        "pTradePredV": float(np.mean(pred)),
        "pTradeObsS": sta.p_trade,
        "blocks": len(sched),
        "staticFeePips": static,
        "minFeeVBp": float(np.min(fees)) / 100.0,
        "maxFeeVBp": float(np.max(fees)) / 100.0,
        "sigmaAnnualPctMin": float(min(sig)),
        "sigmaAnnualPctMax": float(max(sig)),
    }
    return points, summary
