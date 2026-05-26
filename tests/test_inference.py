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


def test_demo_predictor_defaults_to_no_gesture():
    predictor = GesturePredictor(demo_mode=True)
    result = predictor.predict([make_frame()] * MODEL_CONFIG["sequence_length"], mode="web")
    assert result["gesture"] == "no_gesture"
    assert result["confidence"] == 1.0
    assert result["triggered"] is False
    assert "action" in result
    assert result["mode"] == "web"


def test_demo_predictor_can_trigger_explicit_demo_gesture():
    predictor = GesturePredictor(demo_mode=True)
    result = predictor.predict(
        [make_frame()] * MODEL_CONFIG["sequence_length"],
        mode="web",
        demo_gesture="swipe_left",
    )
    assert result["gesture"] == "swipe_left"
    assert result["confidence"] == 0.96
    assert result["action"] == "上一页"
