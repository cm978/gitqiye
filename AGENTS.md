# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Status

This is a gesture recognition + virtual interaction demo. Per the README:
- Trained ResNet50-LSTM weights are available under `checkpoints/ipn_resnet50_lstm/`; the app auto-loads `best.pth` by default.
- The recognition page uses the trained ResNet50-LSTM as a training-result display.
- The web/media/particle interaction pages use a browser realtime gesture engine (`static/js/realtime_gestures.js`) built on MediaPipe Tasks Vision for low-latency interaction.

## Commands

```bash
# Install dependencies (use the existing venv)
source .venv/bin/activate
pip install -r requirements.txt

# Run the Flask dev server
python app.py
# App runs at http://127.0.0.1:5000

# Run all tests
pytest

# Run a single test file
pytest tests/test_inference.py

# Run a single test by name
pytest tests/test_inference.py::test_decode_base64_frame_returns_rgb_image

# Train the model (requires collected data in data/custom_samples/)
python -m gesture.train --data-dir data/custom_samples --epochs 12
```

## Architecture

**Flask app** (`app.py`) uses the application factory pattern, registering two blueprints:
- `routes/pages.py` — serves the single-page UI at `/`
- `routes/api.py` — REST API at `/api/*`

**API endpoints:**
- `POST /api/predict` — accepts `{frames: [base64...], mode: "web"|"media"|"particles"}`, returns gesture label, confidence, action string, and `triggered` boolean
- `GET /api/status` — returns model config, labels, gesture→action mappings, and whether demo mode is active
- `POST /api/collect` — saves labeled frame sequences to `data/custom_samples/` for training
- `GET /api/sample-counts` — returns per-label sample counts

**`GesturePredictor`** (`gesture/inference.py`) is instantiated once at module load in `routes/api.py`. It loads `GESTURE_MODEL_PATH` when set, otherwise `checkpoints/gesture_resnet50_lstm.pth`, otherwise the newest checkpoint directory under `checkpoints/*/best.pth` or `last.pth`. If no checkpoint exists, it falls back to demo mode.

**Model** (`gesture/model.py`): `ResNet50LSTM` — ResNet-50 backbone (feature extractor, fc layer removed) feeds into a single-layer LSTM, then a dropout+linear classifier. Input shape: `(batch, seq_len, 3, 224, 224)`.

**Gesture labels** and **gesture→action mappings** for all three modes (`web`, `media`, `particles`) are defined centrally in `config.py`.

**Frontend** (`static/js/app.js`): Captures webcam frames, buffers them, and POSTs to `/api/predict` on an interval. Runtime recognition is handled by the backend model.

**Realtime interaction engine** (`static/js/realtime_gestures.js`): Uses `@mediapipe/tasks-vision` Gesture Recognizer in the browser and emits a normalized signal with `gesture`, `confidence`, `center`, `velocity`, `openness`, `pinch`, `motion`, `hands`, and `source: "realtime"`. `app.js` uses this signal to control web, media, and particle modes. The backend model should not be used as the primary realtime interaction driver.

## Demo Mode vs. Real Model

`GesturePredictor` sets `demo_mode=True` only when no checkpoint can be found. To force a specific trained model, set `GESTURE_MODEL_PATH` to either a checkpoint file or a directory containing `best.pth` / `last.pth`.

## Training Data Collection

Collected samples are saved under `data/custom_samples/<label>/` as JPEG frame sequences via `gesture/collect.py`. The `gesture/train.py` script supports two dataset formats: `frame-folder` (default) and `manifest` (CSV annotations pointing to video files).
