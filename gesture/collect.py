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
