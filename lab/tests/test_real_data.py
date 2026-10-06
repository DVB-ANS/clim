"""Regression tests on the real files in lab/data (skipped when the data is absent)."""

import numpy as np
import pytest

from clim_lab import model
from clim_lab.data import DATA_DIR
from clim_lab.desk import fee_pips_array, log_bands
from clim_lab.fee import HookParams
from clim_lab.samples import window_sample
from clim_lab.sim import run_arb

pytestmark = pytest.mark.skipif(not (DATA_DIR / "b1s_feb.csv").exists(), reason="lab/data not present")


def _ptrade(name: str, p_star: float) -> tuple[float, float]:
    s = window_sample(name).sched
    g = log_bands(fee_pips_array(s.sigma_e9, HookParams.from_pstar(p_star)))
    return run_arb(s.x, g).p_trade, float(np.mean(model.p_trade_fixed(model.eta(g, s.sigma, 12))))


def test_reproduces_scratch_p_trade_at_pstar_10pct():
    # scratch/ptrade_check.py (rolling-second RV): feb 0.080 / 0.100, oct 0.097 / 0.094
    obs, pred = _ptrade("feb", 0.1)
    assert 0.078 < obs < 0.090 and 0.098 < pred < 0.102
    obs, pred = _ptrade("oct", 0.1)
    assert 0.092 < obs < 0.104 and 0.092 < pred < 0.100


def test_window_sizes():
    assert len(window_sample("feb").sched) == 28_716
    assert len(window_sample("oct").sched) == 21_557
