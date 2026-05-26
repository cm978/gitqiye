from pathlib import Path


APP_JS = Path("static/js/app.js")
PARTICLES_JS = Path("static/js/particles.js")


def test_hand_tracking_updates_demo_signal_outside_particles_view():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert 'if (state.mode !== "particles" || !state.particleScene) return;' not in source
    assert "state.handSignal = { hasHands: true" in source


def test_hand_signal_exposes_continuous_mediapipe_fields():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert "const pinch = computeHandPinch(hands);" in source
    assert "const velocity = computeHandVelocity(center);" in source
    assert "state.handSignal = { hasHands: true, hands: hands.length, center, openness, pinch, motion, velocity };" in source
    assert "state.particleScene.updateHands(state.handSignal);" in source


def test_hand_tracking_queues_demo_gestures_before_predict_loop():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert "pendingDemoGesture: null" in source
    assert "const liveGesture = window.GestureRules.classifyDemoGesture(state.handSignal, state.gestureRuleState);" in source
    assert "if (liveGesture) state.pendingDemoGesture = liveGesture;" in source
    assert "const demoGesture = state.demoMode ? state.pendingDemoGesture : null;" in source
    assert "state.pendingDemoGesture = null;" in source


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
