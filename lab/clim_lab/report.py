"""JSON output helpers: plain types, floats rounded to 8 significant digits, no NaN, UTC timestamps."""

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .constants import SECONDS_PER_YEAR


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def bp_per_year(usd: float, tvl_usd: float, seconds: float) -> float:
    """USD earned (or lost) over `seconds` -> basis points of TVL per year."""
    return usd / tvl_usd * 1e4 * SECONDS_PER_YEAR / seconds


def clean(obj, digits: int = 8):
    if isinstance(obj, dict):
        return {str(k): clean(v, digits) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v, digits) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (float, np.floating)):
        x = float(obj)
        if math.isnan(x) or math.isinf(x):
            return None
        return float(f"{x:.{digits}g}")
    return obj


def write_json(path: Path, obj, compact: bool = False) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(clean(obj), separators=(",", ":"), allow_nan=False)
    else:
        text = json.dumps(clean(obj), indent=2, allow_nan=False)
    path.write_text(text + "\n")
