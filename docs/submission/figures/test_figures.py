import json
import os

from PIL import Image

from fee_figure import make_fee_figure

HERE = os.path.dirname(__file__)


def test_fee_figure_is_1600x900(tmp_path):
    with open(os.path.join(HERE, "..", "test", "fixtures", "replay.json")) as f:
        replay = json.load(f)
    out = tmp_path / "fee.png"
    make_fee_figure(replay, str(out))
    assert Image.open(out).size == (1600, 900)

