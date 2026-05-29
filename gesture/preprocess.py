import math

from PIL import Image


class PreprocessConfig:
    def __init__(self, roi_mode="center", padding=0.32, min_detection_confidence=0.45):
        self.roi_mode = roi_mode
        self.padding = padding
        self.min_detection_confidence = min_detection_confidence


class HandROICropper:
    def __init__(self, config=None):
        self.config = config or PreprocessConfig()

    def crop(self, image):
        if self.config.roi_mode == "none":
            return image
        return self._center_crop(image)

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
