import json
import math

import numpy as np

from clim_lab.report import bp_per_year, clean, now_iso, write_json


def test_clean_converts_numpy_and_rounds():
    out = clean({"a": np.float64(1.234567891234), "b": np.int64(3), "c": [np.nan, 5.1e-13], "d": np.bool_(True)})
    assert out == {"a": 1.2345679, "b": 3, "c": [None, 5.1e-13], "d": True}
    assert type(out["b"]) is int


def test_write_json_and_helpers(tmp_path):
    p = tmp_path / "x" / "y.json"
    write_json(p, {"v": np.float64(2255.18)})
    assert json.loads(p.read_text()) == {"v": 2255.18}
    write_json(p, {"a": [1, 2]}, compact=True)
    assert p.read_text() == '{"a":[1,2]}\n'
    assert now_iso().endswith("Z") and len(now_iso()) == 20
    assert math.isclose(bp_per_year(100.0, 1e6, 31_536_000), 1.0)
