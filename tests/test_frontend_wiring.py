from pathlib import Path


APP_JS = Path("static/js/app.js")
PARTICLES_JS = Path("static/js/particles.js")
REALTIME_JS = Path("static/js/realtime_gestures.js")
INDEX_HTML = Path("templates/index.html")
PAGES_PY = Path("routes/pages.py")


def test_frontend_loads_realtime_gesture_engine_not_old_hands_rule_layer():
    source = APP_JS.read_text(encoding="utf-8-sig")
    html = INDEX_HTML.read_text(encoding="utf-8-sig")
    assert "GestureRules" not in source
    assert "@mediapipe/hands" not in html
    assert "gesture_rules.js" not in html
    assert "@mediapipe/tasks-vision" in html
    assert "realtime_gestures.js" in html


def test_realtime_gesture_engine_exports_standard_signal_shape():
    source = REALTIME_JS.read_text(encoding="utf-8-sig")
    assert "root.RealtimeGestures" in source
    assert "createRealtimeGestureEngine" in source
    for field in ["source: \"realtime\"", "gesture", "confidence", "center", "velocity", "openness", "pinch", "motion", "hands"]:
        assert field in source


def test_predict_loop_posts_camera_frames_to_backend_model():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert 'const body = { frames: state.frames, mode: state.mode };' in source
    assert 'await fetch("/api/predict"' in source
    assert "state.frames = state.frames.slice(-state.sequenceLength);" in source


def test_capture_loop_keeps_buffering_while_model_prediction_is_slow():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert "predicting: false" in source
    assert "function captureLoop()" in source
    assert "setTimeout(captureLoop, 100);" in source
    assert 'state.view !== "recognition"' in source
    assert "state.predicting || state.frames.length < state.sequenceLength" in source
    assert "state.predicting = true;" in source
    assert "state.predicting = false;" in source
    assert "setTimeout(predictLoop, 1500);" in source


def test_realtime_signal_drives_interaction_pages_independently_from_model():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert "const REALTIME_ACTIONS = {" in source
    assert "function handleRealtimeSignal(signal)" in source
    assert "function mapRealtimeSignal(signal)" in source
    assert "function triggerRealtimeAction(action, signal)" in source
    assert "state.particleScene.updateHands(signal);" in source
    assert 'addHistory({ gesture: action, confidence: signal.confidence || 0, mode: state.mode, action: getRealtimeActionLabel(action), triggered: true, source: "realtime" });' in source


def test_realtime_swipe_takes_priority_over_static_hand_shapes():
    source = REALTIME_JS.read_text(encoding="utf-8-sig")
    assert "const swipe = detectSwipe(velocity);" in source
    assert 'let gesture = swipe || CATEGORY_TO_GESTURE[rawGesture] || null;' in source
    assert "function detectSwipe(velocity)" in source
    assert "openness <" not in source[source.index("function detectSwipe"):source.index("function distance")]


def test_realtime_static_click_and_zoom_require_low_motion_hold():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert "lastStaticGesture: null" in source
    assert "function isStaticRealtimeGesture(signal)" in source
    assert "if (!isStaticRealtimeGesture(signal)) return null;" in source
    assert "Date.now() - state.lastStaticGestureAt < holdMs" in source
    assert '["open_palm", "fist"].includes(signal.gesture) ? 500 : 650' in source
    assert "if (signal.motion > 0.12) return resetStaticGesture();" in source
    assert "function resetStaticGesture()" in source


def test_model_prediction_updates_display_without_triggering_interactions():
    source = APP_JS.read_text(encoding="utf-8-sig")
    predict_block = source[source.index("async function predict()"):source.index("function updateModelResult")]
    assert "applyAction(" not in predict_block
    assert "particleScene.applyGesture" not in predict_block
    assert 'result.source = "model";' in predict_block
    assert "updateModelResult(result);" in predict_block


def test_camera_capture_preserves_ipn_video_aspect_before_model_resize():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert "width: { ideal: 640 }" in source
    assert "height: { ideal: 480 }" in source
    assert "frameRate: { ideal: 30, max: 30 }" in source
    assert "const sourceSize = Math.min(sourceWidth, sourceHeight);" in source
    assert "ctx.drawImage(camera, sx, sy, sourceSize, sourceSize, 0, 0, canvas.width, canvas.height);" in source
    assert "ctx.drawImage(camera, 0, 0, canvas.width, canvas.height);" not in source


def test_camera_starts_without_hand_tracking_layer():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert "initHandTracking" not in source
    assert "startCamera().then(startRealtimeEngine).catch" in source
    assert "captureLoop();" in source
    assert "predictLoop();" in source


def test_particle_scene_uses_hand_center_and_pinch_for_continuous_control():
    source = PARTICLES_JS.read_text(encoding="utf-8-sig")
    assert "const center = handData.center || { x: 0.5, y: 0.5 };" in source
    assert "const velocity = handData.velocity || { x: 0, y: 0 };" in source
    assert "const pinch = this.clamp(handData.pinch || 0, 0, 1);" in source
    assert "this.followTarget.x = (center.x - 0.5) * 52;" in source
    assert "this.followTarget.y = (0.5 - center.y) * 34;" in source
    assert "this.group.position.x += (this.followTarget.x - this.group.position.x) * 0.12;" in source
    assert "this.fanForce.x += (this.clamp(velocity.x * 3.8, -1, 1) - this.fanForce.x) * 0.22;" in source
    assert "this.fanForce.y += (this.clamp(velocity.y * 3.8, -1, 1) - this.fanForce.y) * 0.22;" in source
    assert "this.handDrift.x" in source
    assert "this.verticalFlow" in source


def test_particle_demo_buttons_cover_all_discrete_gestures():
    html = Path("templates/index.html").read_text(encoding="utf-8-sig")
    for gesture in [
        "swipe_left",
        "swipe_right",
        "swipe_up",
        "swipe_down",
        "click",
        "zoom_in",
        "zoom_out",
    ]:
        assert f'data-gesture="{gesture}"' in html


def test_demo_button_handler_displays_backend_gesture_names():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert 'gestureName.textContent = gesture;' in source
    assert 'particleState.textContent = getParticleDemoState(gesture);' in source


def test_web_view_embeds_longzu_site():
    html = INDEX_HTML.read_text(encoding="utf-8-sig")
    assert 'id="longzuFrame"' in html
    assert 'src="/longzu-site/"' in html
    assert 'id="longzuGestureHint"' in html


def test_pages_route_serves_longzu_site_directory():
    source = PAGES_PY.read_text(encoding="utf-8-sig")
    assert '@pages_bp.get("/longzu-site/")' in source
    assert '@pages_bp.get("/longzu-site/<path:filename>")' in source
    assert 'LONGZU_SITE_DIR' in source


def test_web_actions_control_longzu_iframe():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert 'const longzuFrame = document.getElementById("longzuFrame");' in source
    assert 'function applyLongzuAction(gesture)' in source
    assert 'longzuWindow.scrollBy' in source
    assert 'scrollLongzuPage(1)' in source
    assert 'scrollLongzuPage(-1)' in source
    assert 'openActiveLongzuCharacter' in source
    assert 'highlightLongzuCharacter' in source
