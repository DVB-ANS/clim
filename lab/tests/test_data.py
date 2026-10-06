import json
import math

import numpy as np
import pytest

from clim_lab.data import (
    DATA_DIR,
    load_1m_pairs_json,
    load_1s_csv,
    load_dvol,
    load_window,
)


def test_load_1s_csv_forward_fills_gaps(tmp_path):
    p = tmp_path / "s.csv"
    p.write_text("100,2000.0\n101,2010.0\n104,1990.0\n")
    s = load_1s_csv(p)
    assert s.t0 == 100 and s.t1 == 104
    assert np.allclose(np.exp(s.logp), [2000.0, 2010.0, 2010.0, 2010.0, 1990.0])
    assert math.isclose(float(np.exp(s.at(103))), 2010.0)
    sub = s.slice(101, 104)
    assert sub.t0 == 101 and len(sub.logp) == 3


def test_load_1s_csv_rejects_unsorted(tmp_path):
    p = tmp_path / "bad.csv"
    p.write_text("101,1.0\n100,1.0\n")
    with pytest.raises(ValueError):
        load_1s_csv(p)


def test_load_1m_pairs_json_close_times(tmp_path):
    p = tmp_path / "m.json"
    p.write_text(json.dumps([[60_000, 100.0], [120_000, 101.0], [240_000, 99.0]]))
    m = load_1m_pairs_json(p)
    assert list(m.close_t) == [120, 180, 240, 300]
    assert np.allclose(np.exp(m.logp), [100.0, 101.0, 101.0, 99.0])


def test_load_dvol_formats_and_lookup(tmp_path):
    rpc = tmp_path / "rpc.json"
    rpc.write_text(json.dumps({"result": {"data": [[0, 1, 2, 0.5, 50.0], [60_000, 1, 2, 0.5, 51.0]]}}))
    pairs = tmp_path / "pairs.json"
    pairs.write_text(json.dumps([[0, 60.0], [3_600_000, 61.0]]))
    d = load_dvol(rpc, 60)
    assert list(d.value) == [50.0, 51.0]
    assert math.isnan(float(d.at(59)))
    assert float(d.at(60)) == 50.0 and float(d.at(130)) == 51.0
    assert list(load_dvol(pairs, 3600).value) == [60.0, 61.0]
    empty = tmp_path / "empty.json"
    empty.write_text("[]")
    with pytest.raises(ValueError):
        load_dvol(empty, 60)


@pytest.mark.skipif(not (DATA_DIR / "b1s_feb.csv").exists(), reason="lab/data not present")
def test_real_windows_have_expected_spans():
    feb, feb_dvol = load_window("feb")
    oct_, oct_dvol = load_window("oct")
    assert (feb.t0, feb.t1) == (1_770_076_800, 1_770_422_399)
    assert (oct_.t0, oct_.t1) == (1_791_010_299, 1_791_269_967)
    assert feb_dvol.resolution_sec == 3600 and oct_dvol.resolution_sec == 60
    assert 2000 < math.exp(float(feb.logp[0])) < 2500


def test_minutes_from_seconds():
    from clim_lab.data import SecondSeries, minutes_from_seconds

    s = SecondSeries(30, np.log(np.arange(1.0, 152.0)))  # seconds 30..180
    m = minutes_from_seconds(s)
    assert list(m.close_t) == [60, 120, 180]
    assert np.allclose(np.exp(m.logp), [30.0, 90.0, 150.0])
