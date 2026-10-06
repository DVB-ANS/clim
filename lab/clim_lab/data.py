"""Loaders for the raw files in lab/data (gitignored, re-downloadable)."""

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

LAB_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = LAB_DIR / "data"
OUT_DIR = LAB_DIR / "out"
SHARED_DIR = LAB_DIR.parent / "shared"


@dataclass(frozen=True)
class SecondSeries:
    """Natural log of the ETHUSDT close, one value per second from t0, forward-filled."""

    t0: int
    logp: np.ndarray

    @property
    def t1(self) -> int:
        return self.t0 + len(self.logp) - 1

    def at(self, t):
        return self.logp[np.asarray(t) - self.t0]

    def slice(self, start: int, end: int) -> "SecondSeries":
        """Seconds in [start, end)."""
        if start < self.t0 or end > self.t1 + 1 or start >= end:
            raise ValueError(f"slice [{start},{end}) outside [{self.t0},{self.t1 + 1})")
        return SecondSeries(start, self.logp[start - self.t0 : end - self.t0].copy())


@dataclass(frozen=True)
class MinuteSeries:
    """Natural log of 1-minute closes. close_t[i] is the candle close time (open time + 60 s)."""

    close_t: np.ndarray
    logp: np.ndarray


@dataclass(frozen=True)
class DvolSeries:
    """Deribit DVOL candles: open time (unix s), close value (vol points, 48.0 = 48 %/yr), candle length."""

    open_t: np.ndarray
    value: np.ndarray
    resolution_sec: int

    def at(self, t):
        """Value of the last candle closed at or before t (NaN before the first close)."""
        t = np.asarray(t)
        idx = np.searchsorted(self.open_t + self.resolution_sec, t, side="right") - 1
        out = np.where(idx >= 0, self.value[np.clip(idx, 0, None)], np.nan)
        return out


def _forward_fill(ts: np.ndarray, values: np.ndarray, step: int) -> tuple[int, np.ndarray]:
    if len(ts) == 0:
        raise ValueError("empty series")
    if np.any(np.diff(ts) <= 0):
        raise ValueError("timestamps must be strictly increasing")
    if np.any((ts - ts[0]) % step != 0):
        raise ValueError(f"timestamps are not on a {step} s grid")
    n = int((ts[-1] - ts[0]) // step) + 1
    pos = ((ts - ts[0]) // step).astype(np.int64)
    filled_idx = np.zeros(n, dtype=np.int64)
    filled_idx[pos] = np.arange(len(ts))
    has = np.zeros(n, dtype=bool)
    has[pos] = True
    marker = np.where(has, np.arange(n), 0)
    np.maximum.accumulate(marker, out=marker)
    return int(ts[0]), values[filled_idx[marker]]


def load_1s_csv(path: Path) -> SecondSeries:
    """Binance 1 s klines reduced to 'unix_seconds,close' lines (b1s_feb.csv, b1s_3d.csv)."""
    raw = np.loadtxt(path, delimiter=",", dtype=np.float64, ndmin=2)
    ts = raw[:, 0].astype(np.int64)
    t0, logp = _forward_fill(ts, np.log(raw[:, 1]), 1)
    return SecondSeries(t0, logp)


def load_1m_pairs_json(path: Path) -> MinuteSeries:
    """Binance ETHUSDT 1 min closes as [[open_time_ms, close], ...] (eth1m.json)."""
    rows = json.loads(Path(path).read_text())
    ts = np.array([r[0] // 1000 for r in rows], dtype=np.int64)
    px = np.array([float(r[1]) for r in rows], dtype=np.float64)
    t0, logp = _forward_fill(ts, np.log(px), 60)
    close_t = t0 + 60 + 60 * np.arange(len(logp), dtype=np.int64)
    return MinuteSeries(close_t, logp)


def load_dvol(path: Path, resolution_sec: int) -> DvolSeries:
    """Deribit DVOL in any of the lab formats: JSON-RPC wrapper, [ms,o,h,l,c] rows, or [ms,v] rows."""
    doc = json.loads(Path(path).read_text())
    rows = doc["result"]["data"] if isinstance(doc, dict) else doc
    if not rows:
        raise ValueError(f"{path} has no DVOL rows")
    open_t = np.array([r[0] // 1000 for r in rows], dtype=np.int64)
    value = np.array([float(r[4] if len(r) >= 5 else r[1]) for r in rows], dtype=np.float64)
    return DvolSeries(open_t, value, resolution_sec)


@dataclass(frozen=True)
class WindowSpec:
    name: str
    label: str
    price_file: str
    dvol_file: str
    dvol_resolution_sec: int


WINDOWS = {
    "feb": WindowSpec("feb", "2026-02-03 to 2026-02-06 (storm)", "b1s_feb.csv", "dvol_3600_feb.json", 3600),
    "oct": WindowSpec("oct", "2026-10-03 to 2026-10-06 (calm)", "b1s_3d.csv", "dvol_1m_3d.json", 60),
}
YEAR_PRICE_FILE = "eth1m.json"
REPLAY_START = 1_770_206_400  # 2026-02-04 12:00:00 UTC
REPLAY_END = 1_770_220_800  # 2026-02-04 16:00:00 UTC
REPLAY_WARMUP_SEC = 1_800


def load_params(path: Path = SHARED_DIR / "params.json") -> dict:
    """The decided hook parameters (written by lab/scripts/decide_pstar.py)."""
    return json.loads(Path(path).read_text())


def load_window(name: str, data_dir: Path = DATA_DIR) -> tuple[SecondSeries, DvolSeries]:
    spec = WINDOWS[name]
    return load_1s_csv(data_dir / spec.price_file), load_dvol(data_dir / spec.dvol_file, spec.dvol_resolution_sec)


def minutes_from_seconds(series: SecondSeries) -> MinuteSeries:
    """1-minute closes of a 1 s series (the close of candle [m-60, m) is the 1 s price at second m-1)."""
    first = (series.t0 // 60 + 1) * 60
    close_t = np.arange(first, series.t1 + 2, 60, dtype=np.int64)
    return MinuteSeries(close_t, series.at(close_t - 1))
