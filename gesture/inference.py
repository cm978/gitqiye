import base64
import io
import time
from collections import deque
from pathlib import Path

import torch
from PIL import Image

from config import CHECKPOINT_DIR, DEFAULT_CHECKPOINT, DEFAULT_MODEL_PATH, GESTURE_LABELS, GESTURE_TO_ACTIONS, MODEL_CONFIG
from gesture.dataset import build_transform
from gesture.model import ResNet50LSTM
from gesture.preprocess import HandROICropper, PreprocessConfig


def decode_base64_frame(frame_data):
    if "," in frame_data:
        frame_data = frame_data.split(",", 1)[1]
    raw = base64.b64decode(frame_data)
    return Image.open(io.BytesIO(raw)).convert("RGB")


def resolve_checkpoint(path):
    path = Path(path)
    if path.is_dir():
        for name in ("best.pth", "last.pth", "gesture_resnet50_lstm.pth"):
            candidate = path / name
            if candidate.exists():
                return candidate
        raise FileNotFoundError(f"no checkpoint found in directory: {path}")
    if not path.exists() and path == DEFAULT_CHECKPOINT:
        candidates = []
        for name in ("best.pth", "last.pth", "gesture_resnet50_lstm.pth"):
            candidates.extend(CHECKPOINT_DIR.glob(f"*/{name}"))
        if candidates:
            return max(candidates, key=lambda candidate: candidate.stat().st_mtime)
    return path


class GesturePredictor:
    def __init__(self, checkpoint_path=DEFAULT_MODEL_PATH, demo_mode=None):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.checkpoint_path = resolve_checkpoint(checkpoint_path)
        self.demo_mode = demo_mode if demo_mode is not None else not self.checkpoint_path.exists()
        self.history = deque(maxlen=MODEL_CONFIG["stable_window"])
        self.labels = GESTURE_LABELS
        self.model_config = dict(MODEL_CONFIG)
        self.preprocessing = {"roi_mode": "center"}
        self.transform = build_transform(self.model_config["image_size"])
        self.cropper = HandROICropper(PreprocessConfig(roi_mode=self.preprocessing["roi_mode"]))
        self.model = None
        if not self.demo_mode:
            state = torch.load(self.checkpoint_path, map_location=self.device)
            self.labels = state.get("labels", GESTURE_LABELS) if isinstance(state, dict) else GESTURE_LABELS
            self.model_config.update(state.get("config", {}) if isinstance(state, dict) else {})
            self.preprocessing.update(state.get("preprocessing", {}) if isinstance(state, dict) else {})
            self.transform = build_transform(self.model_config["image_size"])
            self.cropper = HandROICropper(PreprocessConfig(roi_mode=self.preprocessing.get("roi_mode", "center")))
            self.model = ResNet50LSTM(
                num_classes=len(self.labels),
                hidden_size=self.model_config["hidden_size"],
                num_layers=self.model_config["num_layers"],
                dropout=self.model_config["dropout"],
                pretrained=False,
            ).to(self.device)
            self.model.load_state_dict(state["model"] if isinstance(state, dict) and "model" in state else state)
            self.model.eval()

    def predict(self, frames, mode="web", demo_gesture=None):
        started = time.perf_counter()
        if self.demo_mode:
            label = demo_gesture if demo_gesture in self.labels else "no_gesture"
            confidence = 0.96 if label != "no_gesture" else 1.0
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
        images = [decode_base64_frame(frame) for frame in frames[-self.model_config["sequence_length"]:]]
        if not images:
            raise ValueError("At least one frame is required")
        while len(images) < self.model_config["sequence_length"]:
            images.insert(0, images[0])
        tensor = torch.stack([self.transform(self.cropper.crop(image)) for image in images]).unsqueeze(0).to(self.device)
        with torch.no_grad():
            logits = self.model(tensor)
            probs = torch.softmax(logits, dim=1)[0]
            confidence, index = torch.max(probs, dim=0)
        return self.labels[index.item()], round(confidence.item(), 4)

    def _is_stable(self, label, confidence):
        if confidence < self.model_config["confidence_threshold"] or label == "no_gesture":
            self.history.clear()
            return False
        self.history.append(label)
        return len(self.history) == self.history.maxlen and len(set(self.history)) == 1
