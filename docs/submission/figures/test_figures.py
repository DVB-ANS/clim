import json
import os

from PIL import Image

from fee_figure import make_fee_figure
from video_cards import CAPTIONS, H, W, cards, main as make_cards

HERE = os.path.dirname(__file__)


def test_fee_figure_is_1600x900(tmp_path):
    with open(os.path.join(HERE, "..", "test", "fixtures", "replay.json")) as f:
        replay = json.load(f)
    out = tmp_path / "fee.png"
    make_fee_figure(replay, str(out))
    assert Image.open(out).size == (1600, 900)


def test_cards_and_captions(tmp_path):
    with open(os.path.join(HERE, "..", "test", "fixtures", "replay.json")) as f:
        replay = json.load(f)
    make_cards(str(tmp_path), replay)
    assert "74% to 225%" in cards(replay)["card-act2"][1]
    for name in cards(replay):
        img = Image.open(tmp_path / f"{name}.png")
        assert img.size == (W, H) and img.mode == "RGB"
    for name in CAPTIONS:
        img = Image.open(tmp_path / f"{name}.png")
        assert img.size == (W, H) and img.mode == "RGBA"
        assert img.getpixel((10, 10))[3] == 0
