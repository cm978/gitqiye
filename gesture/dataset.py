import csv
import os
from pathlib import Path

from PIL import Image
import torch
from torch.utils.data import Dataset
from torchvision import transforms

from config import GESTURE_LABELS, MODEL_CONFIG
from gesture.preprocess import HandROICropper, PreprocessConfig


IMAGE_EXTENSIONS = ("*.jpg", "*.jpeg", "*.png", "*.bmp")


def build_transform(image_size=MODEL_CONFIG["image_size"]):
    return transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])


def load_label_map(path=None):
    if not path:
        return {}
    mapping = {}
    with open(path, "r", encoding="utf-8") as handle:
        for row in csv.reader(handle):
            if not row or row[0].startswith("#"):
                continue
            if len(row) < 2:
                raise ValueError("label map rows must be: source_label,target_label")
            mapping[row[0].strip()] = row[1].strip()
    return mapping


class FrameFolderGestureDataset(Dataset):
    def __init__(
        self,
        root_dir,
        sequence_length=MODEL_CONFIG["sequence_length"],
        image_size=MODEL_CONFIG["image_size"],
        roi_mode="center",
        label_map=None,
        labels=None,
    ):
        self.root_dir = Path(root_dir)
        self.sequence_length = sequence_length
        self.labels = labels or GESTURE_LABELS
        self.label_map = label_map or {}
        self.samples = []
        for source_label in self.labels:
            label_dir = self.root_dir / source_label
            if not label_dir.exists():
                continue
            for sample_dir in label_dir.iterdir():
                if not sample_dir.is_dir() or not self._frame_paths(sample_dir):
                    continue
                target_label = self.label_map.get(source_label, source_label)
                if target_label in self.labels:
                    self.samples.append((sample_dir, self.labels.index(target_label)))
        self.transform = build_transform(image_size)
        self.cropper = HandROICropper(PreprocessConfig(roi_mode=roi_mode))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, index):
        sample_dir, label = self.samples[index]
        frame_paths = self._frame_paths(sample_dir)
        selected = self._sample_paths(frame_paths)
        frames = [self.transform(self.cropper.crop(Image.open(path).convert("RGB"))) for path in selected]
        return torch.stack(frames), torch.tensor(label, dtype=torch.long)

    def _frame_paths(self, sample_dir):
        paths = []
        for pattern in IMAGE_EXTENSIONS:
            paths.extend(sample_dir.glob(pattern))
        return sorted(paths)

    def _sample_paths(self, frame_paths):
        if len(frame_paths) >= self.sequence_length:
            indices = torch.linspace(0, len(frame_paths) - 1, self.sequence_length).long().tolist()
            return [frame_paths[i] for i in indices]
        padded = list(frame_paths)
        while len(padded) < self.sequence_length:
            padded.append(frame_paths[-1])
        return padded


class ManifestVideoGestureDataset(Dataset):
    def __init__(
        self,
        data_dir,
        annotation_file,
        sequence_length=MODEL_CONFIG["sequence_length"],
        image_size=MODEL_CONFIG["image_size"],
        roi_mode="center",
        label_map=None,
        labels=None,
    ):
        self.data_dir = Path(data_dir)
        self.annotation_file = Path(annotation_file)
        self.sequence_length = sequence_length
        self.image_size = image_size
        self.labels = labels or GESTURE_LABELS
        self.label_map = label_map or {}
        self.transform = build_transform(image_size)
        self.cropper = HandROICropper(PreprocessConfig(roi_mode=roi_mode))
        # Cache VideoCapture objects to avoid repeated open/close overhead
        self._capture_cache = {}
        self.samples = self._read_manifest()

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, index):
        sample = self.samples[index]
        frames = self._read_video_clip(sample["video_path"], sample["start_frame"], sample["end_frame"])
        tensors = [self.transform(self.cropper.crop(frame)) for frame in frames]
        return torch.stack(tensors), torch.tensor(sample["label_index"], dtype=torch.long)

    def _read_manifest(self):
        rows = []
        with open(self.annotation_file, "r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                label = self._first(row, ["target_label", "label", "gesture", "class", "classname"])
                if label is None:
                    raise ValueError("annotation CSV must contain a label/gesture/class column")
                label = self.label_map.get(label.strip(), label.strip())
                if label not in self.labels:
                    continue
                video_value = self._first(row, ["video_path", "video", "file", "filename", "video_id"])
                if video_value is None:
                    raise ValueError("annotation CSV must contain a video_path/video/file column")
                video_path = Path(video_value)
                if not video_path.is_absolute():
                    video_path = self.data_dir / video_path
                start = int(float(self._first(row, ["start_frame", "start", "begin", "first_frame"], default="0")))
                end_raw = self._first(row, ["end_frame", "end", "finish", "last_frame"], default="")
                end = int(float(end_raw)) if end_raw != "" else -1
                rows.append({
                    "video_path": video_path,
                    "start_frame": max(0, start),
                    "end_frame": end,
                    "label_index": self.labels.index(label),
                })
        return rows

    def _read_video_clip(self, video_path, start_frame, end_frame):
        try:
            import cv2
        except ImportError as exc:
            raise ImportError("opencv-python is required for --dataset-format manifest") from exc

        # Use cached capture if available, otherwise open and cache
        if video_path not in self._capture_cache:
            cap = cv2.VideoCapture(str(video_path))
            if not cap.isOpened():
                raise FileNotFoundError(f"cannot open video: {video_path}")
            self._capture_cache[video_path] = cap
        else:
            cap = self._capture_cache[video_path]

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if end_frame < 0 or end_frame >= total_frames:
            end_frame = max(start_frame, total_frames - 1)

        indices = torch.linspace(start_frame, end_frame, self.sequence_length).long().tolist()
        frames = []
        for frame_index in indices:
            # Clamp index to valid range
            if frame_index >= total_frames:
                frame_index = total_frames - 1
            if frame_index < 0:
                frame_index = 0

            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
            ok, frame = cap.read()

            # Retry once if failed
            if not ok:
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
                ok, frame = cap.read()

            if not ok:
                if frames:
                    frames.append(frames[-1])
                else:
                    # Fallback: create a blank frame to avoid crash
                    frames.append(Image.new('RGB', (self.image_size, self.image_size), (0, 0, 0)))
                continue

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(Image.fromarray(rgb))

        # Do NOT release cap here; it stays open in cache for next access
        return frames

    def _first(self, row, names, default=None):
        normalized = {key.lower().strip(): value for key, value in row.items() if key is not None}
        for name in names:
            value = normalized.get(name)
            if value not in (None, ""):
                return value
        return default
