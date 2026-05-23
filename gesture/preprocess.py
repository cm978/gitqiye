import math

import numpy as np
from PIL import Image


class PreprocessConfig:
    def __init__(self, roi_mode="mediapipe", padding=0.32, min_detection_confidence=0.45):
        self.roi_mode = roi_mode
        self.padding = padding
        self.min_detection_confidence = min_detection_confidence


class HandROICropper:
    def __init__(self, config=None):
        self.config = config or PreprocessConfig()
        self._hands = None
        self._mediapipe_available = None

    def crop(self, image):
        if self.config.roi_mode == "none":
            return image
        if self.config.roi_mode == "center":
            return self._center_crop(image)
        cropped = self._mediapipe_crop(image)
        return cropped if cropped is not None else self._center_crop(image)

    def _mediapipe_crop(self, image):
        if not self._ensure_mediapipe():
            return None
        width, height = image.size
        rgb = np.asarray(image.convert("RGB"))
        result = self._hands.process(rgb)
        landmarks = result.multi_hand_landmarks or []
        if not landmarks:
            return None
        xs = []
        ys = []
        for hand in landmarks:
            xs.extend(point.x for point in hand.landmark)
            ys.extend(point.y for point in hand.landmark)
        left = max(0, min(xs) * width)
        right = min(width, max(xs) * width)
        top = max(0, min(ys) * height)
        bottom = min(height, max(ys) * height)
        box_w = max(1, right - left)
        box_h = max(1, bottom - top)
        side = max(box_w, box_h) * (1 + self.config.padding)
        cx = (left + right) / 2
        cy = (top + bottom) / 2
        return self._crop_square(image, cx, cy, side)

    def _ensure_mediapipe(self):
        if self._mediapipe_available is False:
            return False
        if self._hands is not None:
            return True
        try:
            import mediapipe as mp
        except ImportError:
            self._mediapipe_available = False
            return False
        self._hands = mp.solutions.hands.Hands(
            static_image_mode=True,
            max_num_hands=2,
            model_complexity=0,
            min_detection_confidence=self.config.min_detection_confidence,
        )
        self._mediapipe_available = True
        return True

    def _center_crop(self, image):
        width, height = image.size
        side = min(width, height)
        return self._crop_square(image, width / 2, height / 2, side)

    def _crop_square(self, image, cx, cy, side):
        width, height = image.size
        half = side / 2
        left = int(math.floor(cx - half))
        top = int(math.floor(cy - half))
        right = int(math.ceil(cx + half))
        bottom = int(math.ceil(cy + half))
        pad_left = max(0, -left)
        pad_top = max(0, -top)
        pad_right = max(0, right - width)
        pad_bottom = max(0, bottom - height)
        if any((pad_left, pad_top, pad_right, pad_bottom)):
            padded = Image.new("RGB", (width + pad_left + pad_right, height + pad_top + pad_bottom), (0, 0, 0))
            padded.paste(image, (pad_left, pad_top))
            image = padded
            left += pad_left
            right += pad_left
            top += pad_top
            bottom += pad_top
        return image.crop((left, top, right, bottom))
