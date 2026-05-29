import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CUSTOM_SAMPLE_DIR = DATA_DIR / "custom_samples"
CHECKPOINT_DIR = BASE_DIR / "checkpoints"
DEFAULT_CHECKPOINT = CHECKPOINT_DIR / "ipn_resnet50_lstm"
DEFAULT_MODEL_PATH = Path(os.environ.get("GESTURE_MODEL_PATH", DEFAULT_CHECKPOINT))

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
        "swipe_up": "上滑下翻",
        "swipe_down": "下滑上翻",
        "click": "打开人物档案",
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
