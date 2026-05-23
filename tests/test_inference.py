import base64
import io

from PIL import Image

from config import GESTURE_LABELS, MODEL_CONFIG
from gesture.inference import GesturePredictor, decode_base64_frame


def make_frame():
    img = Image.new("RGB", (64, 64), color=(120, 40, 80))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def test_decode_base64_frame_returns_rgb_image():
    image = decode_base64_frame(make_frame())
    assert image.mode == "RGB"
    assert image.size == (64, 64)


def test_demo_predictor_returns_known_label():
    predictor = GesturePredictor(demo_mode=True)
    result = predictor.predict([make_frame()] * MODEL_CONFIG["sequence_length"], mode="web")
    assert result["gesture"] in GESTURE_LABELS
    assert 0 <= result["confidence"] <= 1
    assert "action" in result
    assert result["mode"] == "web"
