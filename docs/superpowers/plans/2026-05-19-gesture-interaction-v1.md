# Gesture Interaction V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable Flask + PyTorch + Web version of the dynamic gesture recognition and virtual interaction system.

**Architecture:** Flask serves the web UI and JSON APIs. PyTorch provides a ResNet50-LSTM gesture classifier behind an inference service with demo fallback. The browser captures camera frames, calls `/api/predict`, and drives page control, media control, particle effects, history, status, and sample collection.

**Tech Stack:** Python, Flask, PyTorch, TorchVision, OpenCV/Pillow, pytest, HTML, CSS, JavaScript Canvas 2D.

---

## File Structure

- Create: `requirements.txt` - Python dependencies.
- Create: `app.py` - Flask app factory entry point and route registration.
- Create: `config.py` - Shared class labels, paths, thresholds, and model settings.
- Create: `gesture/__init__.py` - Package marker.
- Create: `gesture/model.py` - ResNet50-LSTM model definition.
- Create: `gesture/inference.py` - Model loading, preprocessing, demo fallback, prediction API.
- Create: `gesture/dataset.py` - Video-frame dataset for training.
- Create: `gesture/train.py` - Training script for 8-class classification.
- Create: `gesture/collect.py` - Server-side sample saving helpers.
- Create: `routes/__init__.py` - Blueprint exports.
- Create: `routes/api.py` - `/api/predict`, `/api/status`, `/api/collect`, `/api/sample-counts`.
- Create: `routes/pages.py` - Main page route.
- Create: `templates/index.html` - Single-page system UI.
- Create: `static/css/styles.css` - Application styling.
- Create: `static/js/app.js` - Camera, API calls, mode logic, history, media and page controls.
- Create: `static/js/particles.js` - Canvas particle interaction engine.
- Create: `tests/test_config.py` - Label and mapping tests.
- Create: `tests/test_inference.py` - Demo inference and frame validation tests.
- Create: `tests/test_collect.py` - Sample saving tests.
- Create: `data/custom_samples/.gitkeep` - Local sample directory placeholder.
- Create: `checkpoints/.gitkeep` - Model checkpoint directory placeholder.

## Task 1: Project Skeleton and Configuration

**Files:**
- Create: `requirements.txt`
- Create: `config.py`
- Create: `gesture/__init__.py`
- Create: `routes/__init__.py`
- Create: `data/custom_samples/.gitkeep`
- Create: `checkpoints/.gitkeep`
- Test: `tests/test_config.py`

- [ ] **Step 1: Write the failing configuration tests**

```python
from config import GESTURE_LABELS, GESTURE_TO_ACTIONS, MODEL_CONFIG


def test_gesture_labels_are_stable():
    assert GESTURE_LABELS == [
        "no_gesture",
        "swipe_left",
        "swipe_right",
        "swipe_up",
        "swipe_down",
        "click",
        "zoom_in",
        "zoom_out",
    ]


def test_each_mode_has_action_for_known_gestures():
    for mode in ["web", "media", "particles"]:
        assert mode in GESTURE_TO_ACTIONS
        for label in GESTURE_LABELS:
            assert label in GESTURE_TO_ACTIONS[mode]


def test_model_config_defaults():
    assert MODEL_CONFIG["sequence_length"] == 16
    assert MODEL_CONFIG["image_size"] == 224
    assert MODEL_CONFIG["num_classes"] == 8
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_config.py -v`
Expected: FAIL because `config.py` does not exist.

- [ ] **Step 3: Add dependencies**

```text
flask>=3.0.0
flask-cors>=4.0.0
torch>=2.1.0
torchvision>=0.16.0
opencv-python>=4.8.0
pillow>=10.0.0
numpy>=1.24.0
pytest>=7.4.0
```

- [ ] **Step 4: Add configuration**

```python
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CUSTOM_SAMPLE_DIR = DATA_DIR / "custom_samples"
CHECKPOINT_DIR = BASE_DIR / "checkpoints"
DEFAULT_CHECKPOINT = CHECKPOINT_DIR / "gesture_resnet50_lstm.pth"

GESTURE_LABELS = [
    "no_gesture",
    "swipe_left",
    "swipe_right",
    "swipe_up",
    "swipe_down",
    "click",
    "zoom_in",
    "zoom_out",
]

GESTURE_TO_ACTIONS = {
    "web": {
        "no_gesture": "保持当前状态",
        "swipe_left": "上一页",
        "swipe_right": "下一页",
        "swipe_up": "向上滚动",
        "swipe_down": "向下滚动",
        "click": "确认",
        "zoom_in": "放大内容",
        "zoom_out": "缩小内容",
    },
    "media": {
        "no_gesture": "保持当前状态",
        "swipe_left": "上一首",
        "swipe_right": "下一首",
        "swipe_up": "音量加",
        "swipe_down": "音量减",
        "click": "播放/暂停",
        "zoom_in": "增强音效",
        "zoom_out": "降低音效",
    },
    "particles": {
        "no_gesture": "保持当前状态",
        "swipe_left": "粒子向左流动",
        "swipe_right": "粒子向右流动",
        "swipe_up": "粒子上扬",
        "swipe_down": "粒子下落",
        "click": "切换粒子颜色",
        "zoom_in": "粒子扩散",
        "zoom_out": "粒子聚拢",
    },
}

MODEL_CONFIG = {
    "sequence_length": 16,
    "image_size": 224,
    "num_classes": len(GESTURE_LABELS),
    "hidden_size": 256,
    "num_layers": 1,
    "dropout": 0.3,
    "confidence_threshold": 0.65,
    "stable_window": 2,
}
```

- [ ] **Step 5: Create package markers and placeholder directories**

Create empty files: `gesture/__init__.py`, `routes/__init__.py`, `data/custom_samples/.gitkeep`, `checkpoints/.gitkeep`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pytest tests/test_config.py -v`
Expected: PASS.

## Task 2: ResNet50-LSTM Model and Demo Inference

**Files:**
- Create: `gesture/model.py`
- Create: `gesture/inference.py`
- Test: `tests/test_inference.py`

- [ ] **Step 1: Write failing inference tests**

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_inference.py -v`
Expected: FAIL because inference code does not exist.

- [ ] **Step 3: Implement `gesture/model.py`**

```python
import torch
from torch import nn
from torchvision import models


class ResNet50LSTM(nn.Module):
    def __init__(self, num_classes=8, hidden_size=256, num_layers=1, dropout=0.3, pretrained=True):
        super().__init__()
        weights = models.ResNet50_Weights.DEFAULT if pretrained else None
        backbone = models.resnet50(weights=weights)
        self.feature_extractor = nn.Sequential(*list(backbone.children())[:-1])
        self.feature_size = backbone.fc.in_features
        self.lstm = nn.LSTM(
            input_size=self.feature_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.classifier = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(hidden_size, num_classes),
        )

    def forward(self, frames):
        batch_size, seq_len, channels, height, width = frames.shape
        flat_frames = frames.reshape(batch_size * seq_len, channels, height, width)
        features = self.feature_extractor(flat_frames).flatten(1)
        features = features.reshape(batch_size, seq_len, self.feature_size)
        output, _ = self.lstm(features)
        last_output = output[:, -1, :]
        return self.classifier(last_output)
```

- [ ] **Step 4: Implement `gesture/inference.py` with demo fallback**

```python
import base64
import io
import random
import time
from collections import deque

import torch
from PIL import Image
from torchvision import transforms

from config import DEFAULT_CHECKPOINT, GESTURE_LABELS, GESTURE_TO_ACTIONS, MODEL_CONFIG
from gesture.model import ResNet50LSTM


def decode_base64_frame(frame_data):
    if "," in frame_data:
        frame_data = frame_data.split(",", 1)[1]
    raw = base64.b64decode(frame_data)
    return Image.open(io.BytesIO(raw)).convert("RGB")


class GesturePredictor:
    def __init__(self, checkpoint_path=DEFAULT_CHECKPOINT, demo_mode=None):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.demo_mode = demo_mode if demo_mode is not None else not checkpoint_path.exists()
        self.history = deque(maxlen=MODEL_CONFIG["stable_window"])
        self.demo_index = 0
        self.transform = transforms.Compose([
            transforms.Resize((MODEL_CONFIG["image_size"], MODEL_CONFIG["image_size"])),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        self.model = None
        if not self.demo_mode:
            self.model = ResNet50LSTM(
                num_classes=MODEL_CONFIG["num_classes"],
                hidden_size=MODEL_CONFIG["hidden_size"],
                num_layers=MODEL_CONFIG["num_layers"],
                dropout=MODEL_CONFIG["dropout"],
                pretrained=False,
            ).to(self.device)
            state = torch.load(checkpoint_path, map_location=self.device)
            self.model.load_state_dict(state["model"] if "model" in state else state)
            self.model.eval()

    def predict(self, frames, mode="web"):
        started = time.perf_counter()
        if self.demo_mode:
            label = self._next_demo_label()
            confidence = round(random.uniform(0.72, 0.96), 4)
        else:
            label, confidence = self._predict_with_model(frames)
        action = GESTURE_TO_ACTIONS.get(mode, GESTURE_TO_ACTIONS["web"]).get(label, "保持当前状态")
        elapsed = max(time.perf_counter() - started, 1e-6)
        return {
            "gesture": label,
            "confidence": confidence,
            "action": action,
            "mode": mode,
            "triggered": self._is_stable(label, confidence),
            "fps": round(1 / elapsed, 2),
            "demo_mode": self.demo_mode,
            "device": self.device,
        }

    def _predict_with_model(self, frames):
        images = [decode_base64_frame(frame) for frame in frames[-MODEL_CONFIG["sequence_length"]:]]
        while len(images) < MODEL_CONFIG["sequence_length"]:
            images.insert(0, images[0])
        tensor = torch.stack([self.transform(image) for image in images]).unsqueeze(0).to(self.device)
        with torch.no_grad():
            logits = self.model(tensor)
            probs = torch.softmax(logits, dim=1)[0]
            confidence, index = torch.max(probs, dim=0)
        return GESTURE_LABELS[index.item()], round(confidence.item(), 4)

    def _next_demo_label(self):
        demo_labels = ["swipe_left", "swipe_right", "swipe_up", "swipe_down", "click", "zoom_in", "zoom_out"]
        label = demo_labels[self.demo_index % len(demo_labels)]
        self.demo_index += 1
        return label

    def _is_stable(self, label, confidence):
        if confidence < MODEL_CONFIG["confidence_threshold"] or label == "no_gesture":
            self.history.clear()
            return False
        self.history.append(label)
        return len(self.history) == self.history.maxlen and len(set(self.history)) == 1
```

- [ ] **Step 5: Run the inference tests**

Run: `pytest tests/test_inference.py -v`
Expected: PASS.

## Task 3: Flask API and Collection Helpers

**Files:**
- Create: `gesture/collect.py`
- Create: `routes/api.py`
- Create: `routes/pages.py`
- Create: `app.py`
- Test: `tests/test_collect.py`

- [ ] **Step 1: Write collection tests**

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_collect.py -v`
Expected: FAIL because collection code does not exist.

- [ ] **Step 3: Implement sample saving**

```python
from datetime import datetime
from pathlib import Path

from config import CUSTOM_SAMPLE_DIR, GESTURE_LABELS
from gesture.inference import decode_base64_frame


def save_sample(label, frames, base_dir=CUSTOM_SAMPLE_DIR):
    if label not in GESTURE_LABELS:
        raise ValueError(f"Unknown gesture label: {label}")
    if not frames:
        raise ValueError("At least one frame is required")
    sample_dir = Path(base_dir) / label / datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    sample_dir.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(frames):
        image = decode_base64_frame(frame)
        image.save(sample_dir / f"{index:04d}.jpg", quality=90)
    return sample_dir


def count_samples(base_dir=CUSTOM_SAMPLE_DIR):
    root = Path(base_dir)
    counts = {}
    for label in GESTURE_LABELS:
        label_dir = root / label
        counts[label] = len([p for p in label_dir.iterdir() if p.is_dir()]) if label_dir.exists() else 0
    return counts
```

- [ ] **Step 4: Implement routes**

```python
from flask import Blueprint, jsonify, request

from config import GESTURE_LABELS, GESTURE_TO_ACTIONS, MODEL_CONFIG
from gesture.collect import count_samples, save_sample
from gesture.inference import GesturePredictor

api_bp = Blueprint("api", __name__, url_prefix="/api")
predictor = GesturePredictor()


@api_bp.post("/predict")
def predict():
    payload = request.get_json(force=True)
    frames = payload.get("frames", [])
    mode = payload.get("mode", "web")
    if not frames:
        return jsonify({"error": "frames is required"}), 400
    return jsonify(predictor.predict(frames, mode=mode))


@api_bp.get("/status")
def status():
    return jsonify({
        "model_name": "ResNet50-LSTM",
        "labels": GESTURE_LABELS,
        "model_config": MODEL_CONFIG,
        "mappings": GESTURE_TO_ACTIONS,
        "demo_mode": predictor.demo_mode,
        "device": predictor.device,
    })


@api_bp.post("/collect")
def collect():
    payload = request.get_json(force=True)
    label = payload.get("label")
    frames = payload.get("frames", [])
    try:
        saved = save_sample(label, frames)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"saved": str(saved), "counts": count_samples()})


@api_bp.get("/sample-counts")
def sample_counts():
    return jsonify(count_samples())
```

- [ ] **Step 5: Implement page route and app entry**

```python
from flask import Blueprint, render_template

pages_bp = Blueprint("pages", __name__)


@pages_bp.get("/")
def index():
    return render_template("index.html")
```

```python
from flask import Flask
from flask_cors import CORS

from routes.api import api_bp
from routes.pages import pages_bp


def create_app():
    app = Flask(__name__)
    CORS(app)
    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp)
    return app


if __name__ == "__main__":
    create_app().run(debug=True, host="127.0.0.1", port=5000)
```

- [ ] **Step 6: Run collection tests**

Run: `pytest tests/test_collect.py -v`
Expected: PASS.

## Task 4: Frontend UI, Camera, Modes, History, and Particles

**Files:**
- Create: `templates/index.html`
- Create: `static/css/styles.css`
- Create: `static/js/app.js`
- Create: `static/js/particles.js`

- [ ] **Step 1: Create the HTML shell**

Build a single page with sections for camera preview, recognition result, mode buttons, mapping table, history table, model status, media demo, particle canvas, and data collection.

- [ ] **Step 2: Create the Canvas particle engine**

Expose `window.ParticleScene.applyGesture(gesture)` and support the seven gesture effects.

- [ ] **Step 3: Implement camera capture and prediction loop**

Use `navigator.mediaDevices.getUserMedia`, capture JPEG frames into a 16-frame buffer, and POST to `/api/predict` every 900ms.

- [ ] **Step 4: Implement mode actions**

Use returned `triggered` and `gesture` to run web, media, or particle actions. Update history only when a result is received; mark action as executed only when `triggered` is true.

- [ ] **Step 5: Implement sample collection**

Record frames for the selected class and POST to `/api/collect`; refresh `/api/sample-counts` after saving.

- [ ] **Step 6: Manual browser verification**

Run: `python app.py`
Expected: page loads at `http://127.0.0.1:5000`, camera permission prompt appears, demo predictions update UI, particle canvas responds to demo gestures.

## Task 5: Training Pipeline

**Files:**
- Create: `gesture/dataset.py`
- Create: `gesture/train.py`

- [ ] **Step 1: Implement frame-folder dataset**

Dataset reads `root/class_name/sample_id/*.jpg`, samples 16 frames evenly, applies ImageNet transforms, and returns `(frames, label_index)`.

- [ ] **Step 2: Implement training script**

Parse `--data-dir`, `--epochs`, `--batch-size`, `--lr`, `--device`, `--output`; train `ResNet50LSTM`; default training device is `cuda`; save checkpoint to `checkpoints/gesture_resnet50_lstm.pth`.

- [ ] **Step 3: Smoke test training on collected data**

Run on GPU: `python -m gesture.train --data-dir data/custom_samples --epochs 1 --batch-size 2`
Expected: if CUDA is available and each class has samples, one epoch completes and checkpoint is saved; if CUDA is unavailable, the script reports that training defaults to GPU. For local CPU smoke checks only, run `python -m gesture.train --data-dir data/custom_samples --epochs 1 --batch-size 2 --device cpu`.

## Task 6: Final Verification

**Files:**
- Modify only if verification exposes defects.

- [ ] **Step 1: Run unit tests**

Run: `pytest -v`
Expected: PASS.

- [ ] **Step 2: Run Flask app**

Run: `python app.py`
Expected: server starts on `http://127.0.0.1:5000`.

- [ ] **Step 3: Verify API status**

Open: `http://127.0.0.1:5000/api/status`
Expected: JSON contains `model_name`, `labels`, `model_config`, `mappings`, `demo_mode`, and `device`.

- [ ] **Step 4: Verify first-version behavior**

Expected: demo mode works before real weights exist; when `checkpoints/gesture_resnet50_lstm.pth` is present, backend loads real model weights instead of demo mode.

## Self-Review

Spec coverage: the plan covers real-time recognition, three interaction modes, mapping display, history, status, collection, ResNet50-LSTM model, training script, Flask APIs, and demo fallback.

Placeholder scan: no task depends on undefined labels, endpoints, or class names. The frontend task describes required behavior but leaves visual polish to implementation because the UI files are naturally easier to build and verify as a coherent slice.

Type consistency: labels, `MODEL_CONFIG`, endpoint names, and response fields match across backend, tests, and frontend requirements.
