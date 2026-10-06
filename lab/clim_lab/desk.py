"""The risk desk as the hook sees it: reports every 30 s, the RiskDesk envelope, latency, per-block sigma."""

from dataclasses import dataclass

import numpy as np

from .constants import (
    BLOCK_SEC,
    K_E4_ONE,
    LATENCY_SEC,
    REPORT_SEC,
    RV_RETURNS,
    RV_WINDOW_SEC,
)
from .data import MinuteSeries, SecondSeries
from .estimators import first_rv15_time, minute_close_index, rv_from_closes
from .fee import HookParams, envelope


@dataclass(frozen=True)
class DeskReports:
    t_obs: np.ndarray  # observation times (unix s, multiples of REPORT_SEC)
    sigma: np.ndarray  # RV15 per sqrt second
    sigma_e9: np.ndarray  # reported sigmaE9 (round half up)
    sigma_e9_applied: np.ndarray  # after the RiskDesk envelope
    logp_ref: np.ndarray  # log close of the last closed minute (source of refTick)


def _reports_from_closes(t_obs: np.ndarray, closes: np.ndarray) -> DeskReports:
    """closes: (n_reports, 16) log closes of the last 16 closed minutes, oldest first."""
    sigma = rv_from_closes(closes)
    sigma_e9 = np.floor(sigma * 1e9 + 0.5).astype(np.int64)
    applied = np.empty_like(sigma_e9)
    prev = 0
    for i, s in enumerate(sigma_e9.tolist()):
        prev = envelope(s, prev)
        applied[i] = prev
    return DeskReports(t_obs, sigma, sigma_e9, applied, closes[:, -1].copy())


def desk_reports(
    series: SecondSeries, start: int | None = None, end: int | None = None, report_sec: int = REPORT_SEC
) -> DeskReports:
    """Reports computed from a 1 s series (minute closes = 1 s close at second m-1)."""
    lo = first_rv15_time(series) if start is None else max(start, first_rv15_time(series))
    hi = series.t1 + 1 if end is None else min(end, series.t1 + 1)
    first = -(-lo // report_sec) * report_sec
    t_obs = np.arange(first, hi, report_sec, dtype=np.int64)
    return _reports_from_closes(t_obs, series.logp[minute_close_index(series, t_obs)])


def desk_reports_minutes(minutes: MinuteSeries, report_sec: int = REPORT_SEC) -> DeskReports:
    """Reports computed from 1-minute closes (the 1-year file): exactly the CRE's closed-candle RV15."""
    c0 = int(minutes.close_t[0])
    first = -(-(c0 + RV_WINDOW_SEC) // report_sec) * report_sec
    t_obs = np.arange(first, int(minutes.close_t[-1]) + 1, report_sec, dtype=np.int64)
    idx0 = ((t_obs // 60) * 60 - c0) // 60
    idx = idx0[:, None] - np.arange(RV_RETURNS, -1, -1)[None, :]
    return _reports_from_closes(t_obs, minutes.logp[idx])


@dataclass(frozen=True)
class BlockSchedule:
    t: np.ndarray  # block timestamps
    x: np.ndarray  # market log price at each block
    sigma_e9: np.ndarray  # applied sigmaE9 the hook reads at each block
    report_idx: np.ndarray  # index of that report in DeskReports

    @property
    def sigma(self) -> np.ndarray:
        return self.sigma_e9 / 1e9

    def __len__(self) -> int:
        return len(self.t)


def schedule_on_path(
    t: np.ndarray, x: np.ndarray, reports: DeskReports, latency_sec: int = LATENCY_SEC
) -> BlockSchedule:
    """Keep the blocks at or after the first effective report and attach the sigma the hook reads."""
    effective = reports.t_obs + latency_sec
    keep = t >= effective[0]
    t, x = t[keep], x[keep]
    ridx = np.searchsorted(effective, t, side="right") - 1
    return BlockSchedule(t, x, reports.sigma_e9_applied[ridx], ridx)


def block_schedule(
    series: SecondSeries,
    reports: DeskReports,
    start: int | None = None,
    end: int | None = None,
    block_sec: int = BLOCK_SEC,
    latency_sec: int = LATENCY_SEC,
) -> BlockSchedule:
    lo = int(reports.t_obs[0]) + latency_sec if start is None else max(start, int(reports.t_obs[0]) + latency_sec)
    hi = series.t1 + 1 if end is None else min(end, series.t1 + 1)
    first = -(-lo // block_sec) * block_sec
    t = np.arange(first, hi, block_sec, dtype=np.int64)
    return schedule_on_path(t, series.at(t), reports, latency_sec)


def fee_pips_array(sigma_e9: np.ndarray, params: HookParams, k_e4: int = K_E4_ONE) -> np.ndarray:
    """Vectorised HookParams.fee (exact integer math per distinct sigma)."""
    uniq, inv = np.unique(sigma_e9, return_inverse=True)
    fees = np.array([params.fee(int(s), k_e4) for s in uniq], dtype=np.int64)
    return fees[inv]


def log_bands(fee_pips: np.ndarray) -> np.ndarray:
    """MMR gamma = -ln(1 - f) per block."""
    return -np.log1p(-np.asarray(fee_pips, dtype=np.float64) / 1e6)
