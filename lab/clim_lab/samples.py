"""The three backtest samples: Feb 2026 storm (1 s), Oct 2026 calm (1 s), and one year of 1-minute closes (bridged)."""

from dataclasses import dataclass
from pathlib import Path

from .bridge import bridge_blocks
from .data import (
    DATA_DIR,
    YEAR_PRICE_FILE,
    MinuteSeries,
    load_1m_pairs_json,
    load_window,
)
from .desk import (
    BlockSchedule,
    DeskReports,
    block_schedule,
    desk_reports,
    desk_reports_minutes,
    schedule_on_path,
)

SAMPLE_SEED_OFFSET = {"feb": 1, "oct": 2, "year": 3}


@dataclass(frozen=True)
class Sample:
    name: str
    reports: DeskReports
    sched: BlockSchedule


def window_sample(name: str, data_dir: Path = DATA_DIR) -> Sample:
    series, _ = load_window(name, data_dir)
    reports = desk_reports(series)
    return Sample(name, reports, block_schedule(series, reports))


def year_sample(seed: int, data_dir: Path = DATA_DIR, vol_scale: float = 1.0) -> Sample:
    """The 1-year sample; vol_scale > 1 multiplies every log return (a more volatile asset on the same path)."""
    minutes = load_1m_pairs_json(data_dir / YEAR_PRICE_FILE)
    if vol_scale != 1.0:
        minutes = MinuteSeries(minutes.close_t, minutes.logp[0] + vol_scale * (minutes.logp - minutes.logp[0]))
    reports = desk_reports_minutes(minutes)
    t, x = bridge_blocks(minutes, seed)
    return Sample("year", reports, schedule_on_path(t, x, reports))


def load_samples(seed: int, include_year: bool = True, data_dir: Path = DATA_DIR) -> dict[str, Sample]:
    out = {name: window_sample(name, data_dir) for name in ("feb", "oct")}
    if include_year:
        out["year"] = year_sample(seed, data_dir)
    return out
