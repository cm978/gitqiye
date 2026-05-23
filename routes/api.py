from flask import Blueprint, jsonify, request

from config import GESTURE_TO_ACTIONS
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
    try:
        return jsonify(predictor.predict(frames, mode=mode))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@api_bp.get("/status")
def status():
    return jsonify({
        "model_name": "ResNet50-LSTM",
        "labels": predictor.labels,
        "model_config": predictor.model_config,
        "preprocessing": predictor.preprocessing,
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
