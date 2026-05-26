# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This is a gesture recognition + virtual interaction demo. Per the README:
- Currently only the **particle interaction** mode is implemented and working.
- The ResNet50-LSTM model pipeline is designed but **no trained weights exist** — the app runs in **demo mode** by default (rule-based, no real inference).
- The intended full pipeline: MediaPipe hand ROI → ResNet-50 CNN per-frame features → LSTM sequence classification → Flask serving.

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
pytest tests/test_inference.py::test_demo_predictor_defaults_to_no_gesture

# Train the model (requires collected data in data/custom_samples/)
python -m gesture.train --data-dir data/custom_samples --epochs 12
```

## Architecture

**Flask app** (`app.py`) uses the application factory pattern, registering two blueprints:
- `routes/pages.py` — serves the single-page UI at `/`
- `routes/api.py` — REST API at `/api/*`

**API endpoints:**
- `POST /api/predict` — accepts `{frames: [base64...], mode: "web"|"media"|"particles", demo_gesture?}`, returns gesture label, confidence, action string, and `triggered` boolean
- `GET /api/status` — returns model config, labels, gesture→action mappings, and whether demo mode is active
- `POST /api/collect` — saves labeled frame sequences to `data/custom_samples/` for training
- `GET /api/sample-counts` — returns per-label sample counts

**`GesturePredictor`** (`gesture/inference.py`) is instantiated once at module load in `routes/api.py`. It auto-detects demo mode when no checkpoint exists at `checkpoints/gesture_resnet50_lstm.pth` (or `GESTURE_MODEL_PATH` env var). In demo mode, it returns a rule-based result using the `demo_gesture` field from the request payload.

**Model** (`gesture/model.py`): `ResNet50LSTM` — ResNet-50 backbone (feature extractor, fc layer removed) feeds into a single-layer LSTM, then a dropout+linear classifier. Input shape: `(batch, seq_len, 3, 224, 224)`.

**Gesture labels** and **gesture→action mappings** for all three modes (`web`, `media`, `particles`) are defined centrally in `config.py`.

**Frontend** (`static/js/app.js`): Captures webcam frames, buffers them, and POSTs to `/api/predict` on an interval. `static/js/gesture_rules.js` contains client-side rule-based gesture detection (used when `window.GestureRules` is available).

## Demo Mode vs. Real Model

`GesturePredictor` sets `demo_mode=True` automatically when the checkpoint file doesn't exist. In demo mode, the frontend drives gesture selection via the `demo_gesture` field — the backend just echoes it back with a fixed confidence of 0.96. To use a real model, place a checkpoint at `checkpoints/gesture_resnet50_lstm.pth` (or set `GESTURE_MODEL_PATH`).

## Training Data Collection

Collected samples are saved under `data/custom_samples/<label>/` as JPEG frame sequences via `gesture/collect.py`. The `gesture/train.py` script supports two dataset formats: `frame-folder` (default) and `manifest` (CSV annotations pointing to video files).
