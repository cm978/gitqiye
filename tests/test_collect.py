import base64
import io

from PIL import Image

from gesture.collect import count_samples, save_sample


def make_frame():
    img = Image.new("RGB", (32, 32), color=(20, 80, 120))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def test_save_sample_creates_label_directory(tmp_path):
    saved = save_sample("click", [make_frame(), make_frame()], base_dir=tmp_path)
    assert saved.exists()
    assert saved.parent.name == "click"
    assert len(list(saved.glob("*.jpg"))) == 2


def test_count_samples_returns_known_labels(tmp_path):
    save_sample("click", [make_frame()], base_dir=tmp_path)
    counts = count_samples(base_dir=tmp_path)
    assert counts["click"] == 1
    assert counts["swipe_left"] == 0
