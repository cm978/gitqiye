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


def test_realtime_pointer_hud_shows_hand_focus_and_candidate_action():
    html = INDEX_HTML.read_text(encoding="utf-8-sig")
    source = APP_JS.read_text(encoding="utf-8-sig")
    css = Path("static/css/styles.css").read_text(encoding="utf-8-sig")
    assert 'id="gesturePointer"' in html
    assert 'id="gesturePointerLabel"' in html
    assert 'const gesturePointer = document.getElementById("gesturePointer");' in source
    assert "function updateGesturePointer(signal, action)" in source
    assert "gesturePointer.style.transform" in source
    assert ".gesture-pointer" in css
    assert ".gesture-pointer[data-active=\"true\"]" in css


def test_realtime_swipe_direction_lock_prevents_bounce_back():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert "lastSwipeAction: null" in source
    assert "lastSwipeAt: 0" in source
    assert "function canTriggerSwipeAction(action)" in source
    assert "const opposite = SWIPE_OPPOSITES[action];" in source
    assert "now - state.lastSwipeAt < 900" in source
    assert "if (action.startsWith(\"swipe_\") && !canTriggerSwipeAction(action)) return;" in source


def test_mapped_realtime_actions_trigger_even_when_raw_engine_does_not():
    source = APP_JS.read_text(encoding="utf-8-sig")
    realtime_block = source[source.index("function handleRealtimeSignal"):source.index("function updateGesturePointer")]
    assert "const action = state.view === \"recognition\" ? null : mapRealtimeSignal(signal);" in realtime_block
    assert "if (!action) return;" in realtime_block
    assert "if (!action || !signal.triggered) return;" not in realtime_block
    assert "triggerRealtimeAction(action, signal);" in realtime_block


def test_realtime_signal_exposes_handedness_for_two_finger_controls():
    source = REALTIME_JS.read_text(encoding="utf-8-sig")
    assert "const handedness = getPrimaryHandedness(result);" in source
    assert "handedness," in source
    assert "function getPrimaryHandedness(result)" in source
    assert "result.handednesses" in source
    assert "categoryName.toLowerCase()" in source


def test_web_two_finger_scroll_uses_hand_split_upstroke_only():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert "function mapWebTwoFingerScrollAction(action, signal)" in source
    assert 'if (state.mode !== "web") return action;' in source
    assert 'if (action !== "swipe_up") return null;' in source
    assert 'return isLeftHandSignal(signal) ? "swipe_down" : "swipe_up";' in source
    assert "const webAction = mapWebTwoFingerScrollAction(strokeSwipe, signal);" in source
    assert "const webAdaptiveAction = mapWebTwoFingerScrollAction(adaptiveSwipe, signal);" in source
    assert "const webRawAction = mapWebTwoFingerScrollAction(signal.gesture, signal);" in source
    assert "function isLeftHandSignal(signal)" in source
    assert "signal.handedness === \"left\"" in source
    assert "moveLongzuFocus(-1)" not in source[source.index("function applyLongzuAction"):source.index("function scrollLongzuPage")]
    assert "moveLongzuFocus(1)" not in source[source.index("function applyLongzuAction"):source.index("function scrollLongzuPage")]


def test_two_finger_motion_is_recorded_and_adapted_for_swipes():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert 'const TWO_FINGER_STORAGE_KEY = "gesturelab_two_finger_motion_v1";' in source
    assert "twoFingerMotionSamples: loadTwoFingerMotionSamples()" in source
    assert "twoFingerStroke: null" in source
    assert "function recordTwoFingerMotion(signal)" in source
    assert "localStorage.setItem(TWO_FINGER_STORAGE_KEY" in source
    assert "function mapAdaptiveTwoFingerSwipe(signal)" in source
    assert "const strokeSwipe = mapTwoFingerStrokeSwipe(signal);" in source
    assert "if (strokeSwipe) return strokeSwipe;" in source
    assert "function mapTwoFingerStrokeSwipe(signal)" in source
    assert "const point = signal.pointer || signal.center;" in source
    assert "const maxAge = 720;" in source
    assert "const adaptiveSwipe = mapAdaptiveTwoFingerSwipe(signal);" in source
    assert "return adaptiveSwipe || REALTIME_ACTIONS[signal.gesture] || null;" in source
    assert "function getAdaptiveSwipeThreshold()" in source
    assert "percentile(motions, 0.72)" in source
    assert "function getAdaptiveSwipeDominance()" in source


def test_realtime_swipe_uses_two_finger_navigation_shape():
    source = REALTIME_JS.read_text(encoding="utf-8-sig")
    assert "const handPose = primaryHand.length ? classifyHandPose(primaryHand) : { twoFingerNavigation: false, singleFingerPointer: false };" in source
    assert "const motionPoint = primaryHand.length ? computeMotionPoint(primaryHand, handPose) : center;" in source
    assert "const velocity = computeVelocity(motionPoint, now);" in source
    assert "const swipe = detectSwipe(velocity, handPose);" in source
    assert 'let gesture = swipe || CATEGORY_TO_GESTURE[rawGesture] || null;' in source
    assert "function classifyHandPose(hand)" in source
    assert "function computeMotionPoint(hand, handPose)" in source
    assert "return averagePoints([hand[8], hand[12]], computeCenter(hand));" in source
    assert "twoFingerNavigation: indexExtended && middleExtended && !ringExtended && !pinkyExtended" in source
    assert "function detectSwipe(velocity, handPose)" in source
    assert "if (!handPose.twoFingerNavigation) return null;" in source


def test_realtime_single_finger_pointer_shape_is_exposed():
    source = REALTIME_JS.read_text(encoding="utf-8-sig")
    assert "const pointer = primaryHand.length ? computePointer(primaryHand, handPose) : center;" in source
    assert "pointer," in source
    assert "function computePointer(hand, handPose)" in source
    assert "const indexTip = hand[8];" in source
    assert "singleFingerPointer: indexExtended && !middleExtended && !ringExtended && !pinkyExtended" in source
    assert "{ twoFingerNavigation: false, singleFingerPointer: false }" in source


def test_web_view_maps_single_finger_pointer_into_longzu_iframe():
    source = APP_JS.read_text(encoding="utf-8-sig")
    html = INDEX_HTML.read_text(encoding="utf-8-sig")
    css = Path("static/css/styles.css").read_text(encoding="utf-8-sig")
    assert 'id="longzuFingerRing"' in html
    assert 'const longzuFingerRing = document.getElementById("longzuFingerRing");' in source
    assert "function updateLongzuPointer(signal)" in source
    assert "longzuFrame.getBoundingClientRect()" in source
    assert "const pointer = signal.pointer || signal.center;" in source
    assert "const screenX = rect.left + (1 - pointer.x) * rect.width;" in source
    assert "const target = longzuDocument.elementFromPoint(frameX, frameY);" in source
    assert "closest('a, button, [role=\"button\"], .card')" in source
    assert 'dataset.gesturePointerFocus = "true"' in source
    assert "longzuFingerRing.style.transform" in source
    assert ".longzu-finger-ring" in css
    assert ".longzu-finger-ring[data-active=\"true\"]" in css
    assert 'gesturePointerLabel.textContent = "单指聚焦";' in source


def test_web_single_finger_focus_locks_target_for_thumb_confirm():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert "longzuLockedTarget: null" in source
    assert "longzuLockedAt: 0" in source
    assert "const LONGZU_FOCUS_LOCK_MS = 1500;" in source
    assert "lockLongzuFocusTarget(target);" in source
    assert "function lockLongzuFocusTarget(target)" in source
    assert 'updateLongzuHint("已锁定目标，比赞确认");' in source
    assert "function getValidLongzuLockedTarget()" in source
    assert "Date.now() - state.longzuLockedAt > LONGZU_FOCUS_LOCK_MS" in source
    assert "const lockedTarget = getValidLongzuLockedTarget();" in source
    assert 'updateLongzuHint("正在打开锁定内容");' in source
    assert "longzuHoverTarget" not in source
    assert "LONGZU_HOVER_CLICK_MS" not in source


def test_thumb_confirm_defaults_without_locked_target():
    source = APP_JS.read_text(encoding="utf-8-sig")
    open_block = source[source.index("function openActiveLongzuCharacter"):source.index("function zoomLongzuPage")]
    assert "const lockedTarget = getValidLongzuLockedTarget();" in open_block
    assert "lockedTarget.click();" in open_block
    assert "state.longzuPointerTarget.matches" not in open_block
    assert "focusedLink.click()" not in open_block
    assert "if (cards.length)" in open_block
    assert "cards[state.longzuCharacterIndex].click();" in open_block
    assert 'const profile = longzuDocument.getElementById("profile");' in open_block
    assert 'profile.scrollIntoView({ behavior: "smooth", block: "start" });' in open_block


def test_single_finger_pointer_does_not_trigger_click():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert "point: \"click\"" not in source
    assert "if (signal.handPose && signal.handPose.singleFingerPointer) return null;" in source
    assert '["open_palm", "fist", "confirm", "victory"].includes(signal.gesture)' in source


def test_realtime_static_click_and_zoom_require_low_motion_hold():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert "lastStaticGesture: null" in source
    assert "function isStaticRealtimeGesture(signal)" in source
    assert "if (!isStaticRealtimeGesture(signal)) return null;" in source
    assert "Date.now() - state.lastStaticGestureAt < holdMs" in source
    assert '["open_palm", "fist"].includes(signal.gesture) ? 500 : 650' in source
    assert "if (signal.motion > 0.12) return resetStaticGesture();" in source
    assert "function resetStaticGesture()" in source


def test_media_view_embeds_video_player_and_playlist():
    html = INDEX_HTML.read_text(encoding="utf-8-sig")
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert 'id="mediaPlayer"' in html
    assert "<video" in html
    assert "playsinline" in html
    assert "preload=\"metadata\"" in html
    assert "const MEDIA_TRACKS = [" in source
    assert 'src: "/static/media/gesture-video-01.mp4"' in source
    assert 'src: "/static/media/gesture-video-02.mp4"' in source
    assert 'src: "/static/media/gesture-video-03.mp4"' in source
    assert "mediaIndex: 0" in source
    assert 'const mediaPlayer = document.getElementById("mediaPlayer");' in source
    assert 'id="mediaGestureHint"' in html
    assert "两指左右滑动切视频" in html
    assert 'const mediaGestureHint = document.getElementById("mediaGestureHint");' in source


def test_media_actions_control_real_video_player():
    source = APP_JS.read_text(encoding="utf-8-sig")
    media_block = source[source.index("function applyMediaAction"):source.index("async function collectSample")]
    assert "if (gesture === \"swipe_right\") switchMediaTrack(1);" in media_block
    assert "if (gesture === \"swipe_left\") switchMediaTrack(-1);" in media_block
    assert "gesture === \"swipe_up\"" not in media_block
    assert "gesture === \"swipe_down\"" not in media_block
    assert "if (gesture === \"zoom_in\") state.volume = Math.min(100, state.volume + 10);" in media_block
    assert "if (gesture === \"zoom_out\") state.volume = Math.max(0, state.volume - 10);" in media_block
    assert "function switchMediaTrack(direction)" in source
    assert "state.mediaIndex = wrapIndex(state.mediaIndex + direction, MEDIA_TRACKS.length);" in source
    assert "function renderMediaTrack(shouldContinuePlaying = state.playing)" in source
    assert "mediaPlayer.src = track.src;" in source
    assert "mediaPlayer.play();" in source
    assert "mediaPlayer.pause();" in source
    assert "mediaPlayer.volume = state.volume / 100;" in source
    assert "volumeBar.value = state.volume;" in source
    assert "renderMediaTrack(false);" in source


def test_media_two_finger_swipes_use_stroke_recognizer_not_generic_swipes():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert "mediaTwoFingerStroke: null" in source
    assert "mediaNeedsRelease: false" in source
    assert 'mediaTouchState: "idle"' in source
    assert "mediaTouchHoldMs: 140" in source
    assert "mediaSlideDetectDistance: 0.02" in source
    assert "mediaTwoFingerGraceMs: 220" in source
    assert "mediaTouchCommitDistance" not in source
    assert "mediaLastStrokeAt" not in source
    assert "mediaStrokeCooldownMs" not in source
    assert "mediaStrokeMinDistance: 0.065" in source
    assert "mediaStrokeDominance: 1.08" in source
    assert "mediaMirrorHorizontal: true" in source
    assert "function mapMediaTwoFingerStrokeAction(signal)" in source
    assert "function resetMediaTwoFingerStroke()" in source
    assert "function getMediaStrokeDirection(stroke)" in source
    assert "function updateMediaGestureHint(message)" in source
    assert "function updateMediaDragPreview(offset, selected = false)" in source
    assert "function commitMediaDrag(action)" in source
    assert "媒体页只识别左右滑动" in source
    assert 'if (state.mode === "media") {' in source[source.index("function mapRealtimeSignal"):source.index("function recordTwoFingerMotion")]
    assert "handleMediaTwoFingerLost()" in source[source.index("function mapRealtimeSignal"):source.index("function recordTwoFingerMotion")]
    assert "function handleMediaTwoFingerLost()" in source
    assert "const mediaAction = mapMediaTwoFingerStrokeAction(signal);" in source
    assert "return mediaAction;" in source
    assert 'if (signal.gesture && signal.gesture.startsWith("swipe_")) return null;' in source


def test_media_two_finger_lock_then_slide_commits_without_drag_threshold():
    source = APP_JS.read_text(encoding="utf-8-sig")
    media_block = source[source.index("function mapMediaTwoFingerStrokeAction"):source.index("function resetMediaTwoFingerStroke")]
    direction_block = source[source.index("function getMediaStrokeDirection"):source.index("function updateMediaGestureHint")]
    assert "state.mediaNeedsRelease" in media_block
    assert 'updateMediaGestureHint("松开两指后可继续");' in media_block
    assert "return null;" in media_block[media_block.index("if (state.mediaNeedsRelease)"):media_block.index("const point = signal.pointer")]
    assert "state.mediaTwoFingerStroke = {" in media_block
    assert 'phase: "holding"' in media_block
    assert "holdX: point.x" in media_block
    assert "holdY: point.y" in media_block
    assert "state.mediaTouchState = \"holding\";" in media_block
    assert "holdMovement" not in media_block
    assert 'stroke.phase = "locked";' in media_block
    assert "state.mediaTouchState = \"locked\";" in media_block
    assert 'updateMediaGestureHint("已锁定，左右滑动切视频");' in media_block
    assert "updateMediaDragPreview(0, true);" in media_block
    assert "if (Math.abs(dx) < state.mediaSlideDetectDistance)" in media_block
    assert "if (Math.abs(dx) <= Math.abs(dy) * state.mediaStrokeDominance)" in media_block
    assert "return commitMediaDrag(direction);" in media_block
    assert "points: [{ x: point.x, y: point.y, at: now }]" in media_block
    assert "minX: point.x" in media_block
    assert "maxX: point.x" in media_block
    assert "minY: point.y" in media_block
    assert "maxY: point.y" in media_block
    assert "stroke.minX = Math.min(stroke.minX, point.x);" in media_block
    assert "stroke.maxX = Math.max(stroke.maxX, point.x);" in media_block
    assert "state.mediaTouchCommitDistance" not in media_block
    assert "now - stroke.lastAt > state.mediaTwoFingerGraceMs" in media_block
    assert "const right = stroke.maxX - stroke.startX;" in direction_block
    assert "const left = stroke.startX - stroke.minX;" in direction_block
    assert 'const rightAction = state.mediaMirrorHorizontal ? "swipe_left" : "swipe_right";' in direction_block
    assert 'const leftAction = state.mediaMirrorHorizontal ? "swipe_right" : "swipe_left";' in direction_block
    assert "const down = stroke.maxY - stroke.startY;" in direction_block
    assert "const up = stroke.startY - stroke.minY;" in direction_block
    assert 'updateMediaGestureHint("媒体页只识别左右滑动");' in direction_block
    assert "if (horizontal.amount < state.mediaStrokeMinDistance) return null;" in direction_block
    assert "if (horizontal.amount < vertical.amount * state.mediaStrokeDominance) return null;" in direction_block
    assert "return horizontal.action;" in direction_block
    assert 'action: "swipe_down"' not in direction_block
    assert 'action: "swipe_up"' not in direction_block


def test_realtime_engine_runs_faster_for_media_interaction():
    source = APP_JS.read_text(encoding="utf-8-sig")
    assert "intervalMs: 60" in source


def test_media_lock_slide_commit_animates_once_until_release():
    source = APP_JS.read_text(encoding="utf-8-sig")
    css = Path("static/css/styles.css").read_text(encoding="utf-8-sig")
    preview_block = source[source.index("function updateMediaDragPreview"):source.index("function commitMediaDrag")]
    commit_block = source[source.index("function commitMediaDrag"):source.index("function updateMediaGestureHint")]
    assert "mediaPlayer.style.transform = `translate3d(${clamped * 82}%, 0, 0) scale(${selected ? 0.985 : 1})`;" in preview_block
    assert "mediaPlayer.style.opacity = String(1 - Math.abs(clamped) * 0.28);" in preview_block
    assert "mediaPlayer.dataset.selected = selected ? \"true\" : \"false\";" in preview_block
    assert "state.mediaNeedsRelease = true;" in commit_block
    assert "updateMediaDragPreview(direction === 1 ? 1 : -1, true);" in commit_block
    assert 'updateMediaGestureHint("已识别，正在切换视频");' in commit_block
    assert "setTimeout(() => updateMediaDragPreview(0, true), 180);" in commit_block
    assert "return action;" in commit_block
    assert "switchMediaTrack(direction);" not in commit_block
    assert ".media-screen[data-selected=\"true\"]" in css
    assert ".media-screen video" in css
    assert "transition: transform 180ms ease, opacity 180ms ease;" in css
    assert ".media-screen[data-dragging=\"true\"] video" in css
    assert "transition: none;" in css


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
    assert "const openness = this.clamp(handData.openness || 0, 0, 1);" in source
    assert "const motion = this.clamp(handData.motion || 0, 0, 1);" in source
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
