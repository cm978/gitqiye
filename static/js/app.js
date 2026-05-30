const TWO_FINGER_STORAGE_KEY = "gesturelab_two_finger_motion_v1";
const TWO_FINGER_SAMPLE_LIMIT = 180;
const ADAPTIVE_SWIPE_MIN_THRESHOLD = 0.14;
const ADAPTIVE_SWIPE_MAX_THRESHOLD = 0.30;
const LONGZU_FOCUS_LOCK_MS = 1500;
const MEDIA_TRACKS = [
  { title: "Gesture Video 01", src: "/static/media/gesture-video-01.mp4" },
  { title: "Gesture Video 02", src: "/static/media/gesture-video-02.mp4" },
  { title: "Gesture Video 03", src: "/static/media/gesture-video-03.mp4" },
];

const state = {
  stream: null,
  view: "recognition",
  mode: "web",
  frames: [],
  labels: [],
  mappings: {},
  slideIndex: 0,
  mediaIndex: 0,
  volume: 50,
  playing: false,
  particleScene: null,
  realtimeEngine: null,
  realtimeReady: false,
  realtimeCooldowns: {},
  lastStaticGesture: null,
  lastStaticGestureAt: 0,
  lastSwipeAction: null,
  lastSwipeAt: 0,
  lastCalibrationHintAt: 0,
  twoFingerStroke: null,
  twoFingerMotionSamples: loadTwoFingerMotionSamples(),
  mediaTwoFingerStroke: null,
  mediaReleaseTimer: null,
  mediaSwipeBlockedUntil: 0,
  mediaSlideDetectDistance: 0.045,
  mediaSlideVelocityThreshold: 0.12,
  mediaTwoFingerGraceMs: 220,
  mediaStrokeMinDistance: 0.065,
  mediaStrokeDominance: 0.72,
  mediaMirrorHorizontal: true,
  mediaGestureHint: "",
  mediaGestureHintAt: 0,
  demoMode: true,
  sequenceLength: 16,
  predicting: false,
  demoOverrideUntil: 0,
  longzuSectionIndex: 0,
  longzuCharacterIndex: 0,
  longzuPointerTarget: null,
  longzuLockedTarget: null,
  longzuLockedAt: 0,
  longzuZoom: 1,
};

const REALTIME_ACTIONS = {
  open_palm: "zoom_in",
  fist: "zoom_out",
  confirm: "click",
  victory: "switch_preset",
  swipe_left: "swipe_left",
  swipe_right: "swipe_right",
  swipe_up: "swipe_up",
  swipe_down: "swipe_down",
};

const REALTIME_ACTION_LABELS = {
  swipe_left: "实时左滑",
  swipe_right: "实时右滑",
  swipe_up: "实时上滑",
  swipe_down: "实时下滑",
  click: "实时确认",
  zoom_in: "张开手掌 · 最大",
  zoom_out: "握拳 · 最远",
  switch_preset: "切换粒子预设",
};

const SWIPE_OPPOSITES = {
  swipe_left: "swipe_right",
  swipe_right: "swipe_left",
  swipe_up: "swipe_down",
  swipe_down: "swipe_up",
};

const camera = document.getElementById("camera");
const canvas = document.getElementById("captureCanvas");
const ctx = canvas.getContext("2d");
const gestureName = document.getElementById("gestureName");
const confidence = document.getElementById("confidence");
const actionName = document.getElementById("actionName");
const triggerState = document.getElementById("triggerState");
const historyBody = document.getElementById("historyBody");
const trackName = document.getElementById("trackName");
const playerState = document.getElementById("playerState");
const volumeBar = document.getElementById("volumeBar");
const mappingList = document.getElementById("mappingList");
const modelStatus = document.getElementById("modelStatus");
const collectLabel = document.getElementById("collectLabel");
const collectState = document.getElementById("collectState");
const sampleCounts = document.getElementById("sampleCounts");
const modelModePill = document.getElementById("modelModePill");
const devicePill = document.getElementById("devicePill");
const fpsPill = document.getElementById("fpsPill");
const particleConfidence = document.getElementById("particleConfidence");
const particleState = document.getElementById("particleState");
const pageEyebrow = document.getElementById("pageEyebrow");
const pageTitle = document.getElementById("pageTitle");
const mediaPlayer = document.getElementById("mediaPlayer");
const mediaGestureHint = document.getElementById("mediaGestureHint");
const longzuFrame = document.getElementById("longzuFrame");
const longzuGestureHint = document.getElementById("longzuGestureHint");
const realtimePill = document.getElementById("realtimePill");
const gesturePointer = document.getElementById("gesturePointer");
const gesturePointerLabel = document.getElementById("gesturePointerLabel");
const longzuFingerRing = document.getElementById("longzuFingerRing");
const LONGZU_SECTIONS = ["hero", "characters", "world", "enter"];

async function loadStatus() {
  const response = await fetch("/api/status");
  const status = await response.json();
  state.labels = status.labels;
  state.mappings = status.mappings;
  state.demoMode = status.demo_mode;
  state.sequenceLength = status.model_config.sequence_length || 16;
  modelModePill.textContent = status.demo_mode ? "Demo Mode" : "Model Ready";
  devicePill.textContent = status.device.toUpperCase();
  collectLabel.innerHTML = status.labels.map((label) => `<option value="${label}">${label}</option>`).join("");
  modelStatus.innerHTML = `
    <dt>模型</dt><dd>${status.model_name}</dd>
    <dt>设备</dt><dd>${status.device}</dd>
    <dt>模式</dt><dd>${status.demo_mode ? "Demo" : "真实权重"}</dd>
    <dt>帧数</dt><dd>${status.model_config.sequence_length}</dd>
    <dt>阈值</dt><dd>${status.model_config.confidence_threshold}</dd>
    <dt>防抖</dt><dd>${status.model_config.stable_window} 次</dd>
  `;
  renderMapping();
  await refreshCounts();
}

function renderMapping() {
  const mapping = state.mappings[state.mode] || {};
  mappingList.innerHTML = Object.entries(mapping).map(([gesture, action]) => (
    `<div class="mapping-item"><strong>${gesture}</strong><span>${action}</span></div>`
  )).join("");
}

async function startCamera() {
  if (state.stream) return state.stream;
  state.stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
  });
  camera.srcObject = state.stream;
  return state.stream;
}

function stopCamera() {
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  camera.srcObject = null;
  if (state.realtimeEngine) state.realtimeEngine.stop();
  state.realtimeReady = false;
  updateRealtimeStatus("stopped");
}

async function startRealtimeEngine() {
  if (!window.RealtimeGestures) {
    updateRealtimeStatus("unavailable");
    return;
  }
  if (!state.realtimeEngine) {
    state.realtimeEngine = window.RealtimeGestures.createRealtimeGestureEngine({
      video: camera,
      onSignal: handleRealtimeSignal,
      onStatus: ({ status }) => updateRealtimeStatus(status),
      intervalMs: 60,
    });
  }
  try {
    await state.realtimeEngine.start();
  } catch (error) {
    updateRealtimeStatus("error");
  }
}

function updateRealtimeStatus(status) {
  state.realtimeReady = status === "ready";
  if (!realtimePill) return;
  const labels = {
    loading: "Realtime Loading",
    ready: "Realtime Ready",
    error: "Realtime Error",
    unavailable: "Realtime Off",
    stopped: "Realtime Stop",
  };
  realtimePill.textContent = labels[status] || "Realtime --";
}

function captureFrame() {
  if (!state.stream || camera.readyState < 2) return null;
  const sourceWidth = camera.videoWidth || camera.clientWidth || canvas.width;
  const sourceHeight = camera.videoHeight || camera.clientHeight || canvas.height;
  const sourceSize = Math.min(sourceWidth, sourceHeight);
  const sx = Math.round((sourceWidth - sourceSize) / 2);
  const sy = Math.round((sourceHeight - sourceSize) / 2);
  ctx.drawImage(camera, sx, sy, sourceSize, sourceSize, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function captureLoop() {
  const frame = captureFrame();
  if (frame) {
    state.frames.push(frame);
    state.frames = state.frames.slice(-state.sequenceLength);
  }
  setTimeout(captureLoop, 100);
}

async function predictLoop() {
  if (state.view !== "recognition" || state.predicting || state.frames.length < state.sequenceLength) {
    setTimeout(predictLoop, 1500);
    return;
  }
  await predict();
  setTimeout(predictLoop, 1500);
}

async function predict() {
  state.predicting = true;
  const body = { frames: state.frames, mode: state.mode };
  try {
    const response = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (result.error) return;
    result.source = "model";
    updateModelResult(result);
  } finally {
    state.predicting = false;
  }
}

function updateModelResult(result) {
  gestureName.textContent = result.gesture;
  confidence.textContent = `${Math.round(result.confidence * 100)}%`;
  actionName.textContent = result.action;
  triggerState.textContent = result.triggered ? "模型已稳定" : "模型识别中";
  fpsPill.textContent = `Model FPS ${result.fps}`;
  addHistory(result);
}

function handleRealtimeSignal(signal) {
  if (!signal) return;
  updateRealtimeStatus("ready");
  const action = state.view === "recognition" ? null : mapRealtimeSignal(signal);
  updateGesturePointer(signal, action);
  if (state.mode === "particles" && state.particleScene) {
    state.particleScene.updateHands(signal);
  }
  if (state.view === "recognition") return;
  if (!action) return;
  triggerRealtimeAction(action, signal);
}

function updateGesturePointer(signal, action) {
  if (!gesturePointer || !gesturePointerLabel || !signal.center) return;
  const longzuPointer = updateLongzuPointer(signal);
  const x = longzuPointer ? longzuPointer.x : Math.round(signal.center.x * window.innerWidth);
  const y = longzuPointer ? longzuPointer.y : Math.round(signal.center.y * window.innerHeight);
  const singleFinger = Boolean(signal.handPose && signal.handPose.singleFingerPointer);
  const twoFinger = Boolean(signal.handPose && signal.handPose.twoFingerNavigation);
  const active = singleFinger || twoFinger;
  gesturePointer.dataset.active = signal.hands ? "true" : "false";
  gesturePointer.dataset.locked = state.lastSwipeAction && Date.now() - state.lastSwipeAt < 900 ? "true" : "false";
  gesturePointer.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  if (singleFinger && state.view === "web") {
    gesturePointerLabel.textContent = "单指聚焦";
  } else if (state.mode === "media" && state.mediaGestureHint && Date.now() - state.mediaGestureHintAt < 1200) {
    gesturePointerLabel.textContent = state.mediaGestureHint;
  } else if (action) {
    gesturePointerLabel.textContent = `${twoFinger ? "两指" : "手势"} · ${getRealtimeActionLabel(action)}`;
  } else if (twoFinger) {
    gesturePointerLabel.textContent = "两指滑动";
  } else if (active) {
    gesturePointerLabel.textContent = "手指已聚焦";
  } else {
    gesturePointerLabel.textContent = signal.rawGesture || "检测到手";
  }
}

function mapRealtimeSignal(signal) {
  if (signal.handPose && signal.handPose.singleFingerPointer) return null;
  if (signal.handPose && signal.handPose.twoFingerNavigation) recordTwoFingerMotion(signal);
  if (state.mode === "media") {
    if (signal.handPose && signal.handPose.twoFingerNavigation) {
      const mediaAction = mapMediaTwoFingerStrokeAction(signal);
      return mediaAction;
    }
    handleMediaTwoFingerLost();
    if (signal.gesture && signal.gesture.startsWith("swipe_")) return null;
    if (!isStaticRealtimeGesture(signal)) return null;
    return REALTIME_ACTIONS[signal.gesture] || null;
  }
  if (signal.gesture && signal.gesture.startsWith("swipe_")) {
    state.lastStaticGesture = null;
    state.lastStaticGestureAt = 0;
    const strokeSwipe = mapTwoFingerStrokeSwipe(signal);
    const webAction = mapWebTwoFingerScrollAction(strokeSwipe, signal);
    if (webAction) return webAction;
    if (state.mode === "web") return null;
    if (strokeSwipe) return strokeSwipe;
    const adaptiveSwipe = mapAdaptiveTwoFingerSwipe(signal);
    const webAdaptiveAction = mapWebTwoFingerScrollAction(adaptiveSwipe, signal);
    if (webAdaptiveAction) return webAdaptiveAction;
    const webRawAction = mapWebTwoFingerScrollAction(signal.gesture, signal);
    if (webRawAction) return webRawAction;
    if (state.mode === "web") return null;
    return adaptiveSwipe || REALTIME_ACTIONS[signal.gesture] || null;
  }
  const strokeSwipe = mapTwoFingerStrokeSwipe(signal);
  const webAction = mapWebTwoFingerScrollAction(strokeSwipe, signal);
  if (webAction) return webAction;
  if (state.mode === "web" && strokeSwipe) return null;
  if (strokeSwipe) return strokeSwipe;
  const adaptiveSwipe = mapAdaptiveTwoFingerSwipe(signal);
  const webAdaptiveAction = mapWebTwoFingerScrollAction(adaptiveSwipe, signal);
  if (webAdaptiveAction) return webAdaptiveAction;
  if (state.mode === "web" && adaptiveSwipe) return null;
  if (adaptiveSwipe) return adaptiveSwipe;
  if (!isStaticRealtimeGesture(signal)) return null;
  return REALTIME_ACTIONS[signal.gesture] || null;
}

function recordTwoFingerMotion(signal) {
  if (!signal.velocity) return;
  const sample = {
    at: Date.now(),
    vx: roundMotion(signal.velocity.x || 0),
    vy: roundMotion(signal.velocity.y || 0),
    motion: roundMotion(Math.max(Math.abs(signal.velocity.x || 0), Math.abs(signal.velocity.y || 0))),
    rawGesture: signal.rawGesture || null,
    detectedGesture: signal.gesture || null,
  };
  state.twoFingerMotionSamples.push(sample);
  state.twoFingerMotionSamples = state.twoFingerMotionSamples.slice(-TWO_FINGER_SAMPLE_LIMIT);
  if (state.twoFingerMotionSamples.length % 8 === 0) {
    saveTwoFingerMotionSamples();
  }
  updateTwoFingerCalibrationHint();
}

function mapAdaptiveTwoFingerSwipe(signal) {
  if (!signal.handPose || !signal.handPose.twoFingerNavigation || !signal.velocity) return null;
  const absX = Math.abs(signal.velocity.x || 0);
  const absY = Math.abs(signal.velocity.y || 0);
  const threshold = getAdaptiveSwipeThreshold();
  const dominance = getAdaptiveSwipeDominance();
  if (absX < threshold && absY < threshold) return null;
  if (absX > absY * dominance) return signal.velocity.x > 0 ? "swipe_right" : "swipe_left";
  if (absY > absX * dominance) return signal.velocity.y > 0 ? "swipe_down" : "swipe_up";
  return null;
}

function mapTwoFingerStrokeSwipe(signal) {
  if (!signal.handPose || !signal.handPose.twoFingerNavigation) {
    state.twoFingerStroke = null;
    return null;
  }
  const point = signal.pointer || signal.center;
  if (!point) return null;

  const now = Date.now();
  const maxAge = 720;
  if (!state.twoFingerStroke || now - state.twoFingerStroke.startedAt > maxAge) {
    state.twoFingerStroke = { startedAt: now, x: point.x, y: point.y };
    return null;
  }

  const dx = point.x - state.twoFingerStroke.x;
  const dy = point.y - state.twoFingerStroke.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const distanceThreshold = Math.max(0.055, getAdaptiveSwipeThreshold() * 0.34);
  const dominance = 1.04;
  if (absX < distanceThreshold && absY < distanceThreshold) return null;

  state.twoFingerStroke = { startedAt: now, x: point.x, y: point.y };
  if (absX > absY * dominance) return dx > 0 ? "swipe_right" : "swipe_left";
  if (absY > absX * dominance) return dy > 0 ? "swipe_down" : "swipe_up";
  return null;
}

function mapWebTwoFingerScrollAction(action, signal) {
  if (state.mode !== "web") return action;
  if (!action) return null;
  if (action !== "swipe_up") return null;
  return isLeftHandSignal(signal) ? "swipe_down" : "swipe_up";
}

function mapMediaTwoFingerStrokeAction(signal) {
  const now = Date.now();
  if (Date.now() < state.mediaSwipeBlockedUntil) {
    updateMediaGestureHint("切换完成，可继续滑动");
    return null;
  }

  const point = signal.pointer || signal.center;
  if (!point) return null;
  let stroke = state.mediaTwoFingerStroke;
  if (!stroke || now - stroke.lastAt > state.mediaTwoFingerGraceMs) {
    state.mediaTwoFingerStroke = {
      startedAt: now,
      lastAt: now,
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: point.y,
      minX: point.x,
      maxX: point.x,
      minY: point.y,
      maxY: point.y,
      maxMotion: 0,
      lastVelocityX: signal.velocity ? signal.velocity.x || 0 : 0,
      points: [{ x: point.x, y: point.y, at: now }],
    };
    updateMediaDragPreview(0, true);
    updateMediaGestureHint("两指左右滑动切视频");
    return null;
  }

  stroke.lastAt = now;
  stroke.endX = point.x;
  stroke.endY = point.y;
  stroke.minX = Math.min(stroke.minX, point.x);
  stroke.maxX = Math.max(stroke.maxX, point.x);
  stroke.minY = Math.min(stroke.minY, point.y);
  stroke.maxY = Math.max(stroke.maxY, point.y);
  stroke.maxMotion = Math.max(stroke.maxMotion, signal.motion || 0);
  stroke.lastVelocityX = signal.velocity ? signal.velocity.x || 0 : 0;
  stroke.points.push({ x: point.x, y: point.y, at: now });
  stroke.points = stroke.points.slice(-18);

  updateMediaDragPreview(0, true);
  const direction = getMediaStrokeDirection(stroke);
  if (!direction) return null;
  return commitMediaDrag(direction);
}

function handleMediaTwoFingerLost() {
  const stroke = state.mediaTwoFingerStroke;
  if (!stroke) return;
  if (Date.now() - stroke.lastAt <= state.mediaTwoFingerGraceMs) {
    updateMediaGestureHint("两指左右滑动切视频");
    return;
  }
  resetMediaTwoFingerStroke();
}

function resetMediaTwoFingerStroke() {
  state.mediaTwoFingerStroke = null;
  updateMediaDragPreview(0, false);
}

function getMediaStrokeDirection(stroke) {
  if (!stroke) return null;
  const right = stroke.maxX - stroke.startX;
  const left = stroke.startX - stroke.minX;
  const rightAction = state.mediaMirrorHorizontal ? "swipe_left" : "swipe_right";
  const leftAction = state.mediaMirrorHorizontal ? "swipe_right" : "swipe_left";
  const down = stroke.maxY - stroke.startY;
  const up = stroke.startY - stroke.minY;
  const horizontal = [
    { action: rightAction, amount: right },
    { action: leftAction, amount: left },
  ].sort((a, b) => b.amount - a.amount)[0];
  const vertical = [
    { amount: down },
    { amount: up },
  ].sort((a, b) => b.amount - a.amount)[0];
  if (vertical.amount >= state.mediaStrokeMinDistance && vertical.amount > horizontal.amount) {
    updateMediaGestureHint("媒体页只识别左右滑动");
    return null;
  }
  const velocityX = Math.abs(stroke.lastVelocityX || 0);
  if (horizontal.amount < state.mediaSlideDetectDistance && velocityX < state.mediaSlideVelocityThreshold) return null;
  if (horizontal.amount < vertical.amount * state.mediaStrokeDominance) return null;
  return horizontal.action;
}

function updateMediaDragPreview(offset, selected = false) {
  const clamped = clampValue(offset, -0.34, 0.34);
  if (mediaPlayer) {
    mediaPlayer.style.transform = `translate3d(${clamped * 82}%, 0, 0) scale(${selected ? 0.985 : 1})`;
    mediaPlayer.style.opacity = String(1 - Math.abs(clamped) * 0.28);
    mediaPlayer.dataset.selected = selected ? "true" : "false";
  }
  const mediaScreen = mediaPlayer ? mediaPlayer.closest(".media-screen") : null;
  if (mediaScreen) {
    mediaScreen.dataset.selected = selected ? "true" : "false";
    mediaScreen.dataset.dragging = Math.abs(clamped) > 0.02 ? "true" : "false";
  }
}

function commitMediaDrag(action) {
  const direction = action === "swipe_right" ? 1 : -1;
  state.mediaSwipeBlockedUntil = Date.now() + 320;
  updateMediaDragPreview(direction === 1 ? 1 : -1, true);
  updateMediaGestureHint("已识别，正在切换视频");
  clearTimeout(state.mediaReleaseTimer);
  state.mediaReleaseTimer = setTimeout(() => {
    state.mediaTwoFingerStroke = null;
    updateMediaDragPreview(0, false);
    updateMediaGestureHint("切换完成，可继续滑动");
  }, 260);
  return action;
}

function updateMediaGestureHint(message) {
  state.mediaGestureHint = message;
  state.mediaGestureHintAt = Date.now();
  if (mediaGestureHint) mediaGestureHint.textContent = message;
}

function isLeftHandSignal(signal) {
  return Boolean(signal && signal.handedness === "left");
}

function getAdaptiveSwipeThreshold() {
  const motions = state.twoFingerMotionSamples
    .map((sample) => sample.motion)
    .filter((motion) => motion > 0.05)
    .sort((a, b) => a - b);
  if (motions.length < 10) return 0.22;
  return clampValue(percentile(motions, 0.72) * 0.78, ADAPTIVE_SWIPE_MIN_THRESHOLD, ADAPTIVE_SWIPE_MAX_THRESHOLD);
}

function getAdaptiveSwipeDominance() {
  const motions = state.twoFingerMotionSamples.filter((sample) => sample.motion > 0.08);
  if (motions.length < 16) return 1.18;
  return 1.10;
}

function updateTwoFingerCalibrationHint() {
  if (state.view !== "web") return;
  const now = Date.now();
  if (now - state.lastCalibrationHintAt < 1200) return;
  state.lastCalibrationHintAt = now;
  const count = Math.min(state.twoFingerMotionSamples.length, 30);
  const threshold = Math.round(getAdaptiveSwipeThreshold() * 100);
  updateLongzuHint(`两指动作记录 ${count}/30，当前触发灵敏度 ${threshold}%`);
}

function loadTwoFingerMotionSamples() {
  try {
    const raw = localStorage.getItem(TWO_FINGER_STORAGE_KEY);
    const samples = raw ? JSON.parse(raw) : [];
    return Array.isArray(samples) ? samples.slice(-TWO_FINGER_SAMPLE_LIMIT) : [];
  } catch (error) {
    return [];
  }
}

function saveTwoFingerMotionSamples() {
  try {
    localStorage.setItem(TWO_FINGER_STORAGE_KEY, JSON.stringify(state.twoFingerMotionSamples.slice(-TWO_FINGER_SAMPLE_LIMIT)));
  } catch (error) {
    // Calibration is optional; interaction should continue if storage is unavailable.
  }
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor(sortedValues.length * ratio)));
  return sortedValues[index];
}

function roundMotion(value) {
  return Math.round(value * 1000) / 1000;
}

function isStaticRealtimeGesture(signal) {
  if (!["open_palm", "fist", "confirm", "victory"].includes(signal.gesture)) return false;
  if (signal.motion > 0.12) return resetStaticGesture();
  const now = Date.now();
  if (state.lastStaticGesture !== signal.gesture) {
    state.lastStaticGesture = signal.gesture;
    state.lastStaticGestureAt = now;
    return false;
  }
  const holdMs = ["open_palm", "fist"].includes(signal.gesture) ? 500 : 650;
  if (Date.now() - state.lastStaticGestureAt < holdMs) return false;
  return true;
}

function resetStaticGesture() {
  state.lastStaticGesture = null;
  state.lastStaticGestureAt = 0;
  return false;
}

function triggerRealtimeAction(action, signal) {
  if (action.startsWith("swipe_") && !canTriggerSwipeAction(action)) return;
  if (!canTriggerRealtimeAction(action)) return;
  const confidenceValue = Math.round((signal.confidence || 0) * 100);
  gestureName.textContent = signal.gesture || action;
  confidence.textContent = `${confidenceValue}%`;
  actionName.textContent = getRealtimeActionLabel(action);
  triggerState.textContent = "实时触发";
  particleConfidence.textContent = `${confidenceValue}%`;
  particleState.textContent = getRealtimeActionLabel(action);

  if (state.mode === "particles") {
    if (action === "switch_preset") {
      cycleParticlePreset();
    } else if (state.particleScene) {
      state.particleScene.applyGesture(action, signal.confidence || 0, true);
    }
  } else if (action === "switch_preset") {
    applyAction("click");
  } else {
    applyAction(action);
  }

  addHistory({ gesture: action, confidence: signal.confidence || 0, mode: state.mode, action: getRealtimeActionLabel(action), triggered: true, source: "realtime" });
}

function canTriggerSwipeAction(action) {
  const now = Date.now();
  const opposite = SWIPE_OPPOSITES[action];
  if (opposite && state.lastSwipeAction === opposite && now - state.lastSwipeAt < 900) return false;
  state.lastSwipeAction = action;
  state.lastSwipeAt = now;
  return true;
}

function canTriggerRealtimeAction(action) {
  const now = Date.now();
  const cooldown = action === "swipe_up" || action === "swipe_down" ? 520 : 720;
  if (state.realtimeCooldowns[action] && now - state.realtimeCooldowns[action] < cooldown) return false;
  state.realtimeCooldowns[action] = now;
  return true;
}

function getRealtimeActionLabel(action) {
  return REALTIME_ACTION_LABELS[action] || action;
}

function cycleParticlePreset() {
  const buttons = [...document.querySelectorAll(".preset-btn")];
  if (!buttons.length) return;
  const current = Math.max(0, buttons.findIndex((button) => button.classList.contains("active")));
  buttons[(current + 1) % buttons.length].click();
}

function addHistory(result) {
  const row = document.createElement("tr");
  row.innerHTML = `<td>${new Date().toLocaleTimeString()}</td><td>${result.source || "model"}</td><td>${result.gesture}</td><td>${Math.round(result.confidence * 100)}%</td><td>${result.mode}</td><td>${result.triggered ? result.action : "未触发"}</td>`;
  historyBody.prepend(row);
  while (historyBody.children.length > 10) historyBody.lastElementChild.remove();
}

function applyAction(gesture) {
  if (state.mode === "web") applyWebAction(gesture);
  if (state.mode === "media") applyMediaAction(gesture);
}

function applyWebAction(gesture) {
  applyLongzuAction(gesture);
}

function getLongzuWindow() {
  try {
    return longzuFrame && longzuFrame.contentWindow ? longzuFrame.contentWindow : null;
  } catch (error) {
    return null;
  }
}

function getLongzuDocument() {
  const longzuWindow = getLongzuWindow();
  try {
    return longzuWindow && longzuWindow.document ? longzuWindow.document : null;
  } catch (error) {
    return null;
  }
}

function updateLongzuPointer(signal) {
  if (state.view !== "web" || !longzuFrame || !signal.center || !signal.handPose || !signal.handPose.singleFingerPointer) {
    clearLongzuPointerFocus();
    updateLongzuFingerRing(null);
    return null;
  }

  const longzuDocument = getLongzuDocument();
  if (!longzuDocument) return null;

  const rect = longzuFrame.getBoundingClientRect();
  const pointer = signal.pointer || signal.center;
  const screenX = rect.left + (1 - pointer.x) * rect.width;
  const screenY = rect.top + pointer.y * rect.height;
  const x = Math.round(clampValue(screenX, rect.left, rect.right));
  const y = Math.round(clampValue(screenY, rect.top, rect.bottom));
  updateLongzuFingerRing({ x, y });
  const frameX = x - rect.left;
  const frameY = y - rect.top;
  const target = longzuDocument.elementFromPoint(frameX, frameY);
  const focusTarget = target ? target.closest('a, button, [role="button"], .card') : null;
  setLongzuPointerFocus(focusTarget);
  return { x, y };
}

function updateLongzuFingerRing(point) {
  if (!longzuFingerRing) return;
  longzuFingerRing.dataset.active = point ? "true" : "false";
  if (!point) return;
  longzuFingerRing.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -50%)`;
}

function setLongzuPointerFocus(target) {
  if (state.longzuPointerTarget === target) return;
  clearLongzuPointerFocus();
  state.longzuPointerTarget = target;
  if (!target) return;

  target.dataset.gesturePointerFocus = "true";
  target.style.outline = "2px solid rgba(66, 232, 255, 0.96)";
  target.style.boxShadow = "0 0 0 6px rgba(66, 232, 255, 0.14), 0 20px 60px rgba(0, 0, 0, 0.38)";
  lockLongzuFocusTarget(target);

  const cards = getLongzuCharacterCards();
  const card = target.matches('a.card[href*="characters/"]') ? target : target.closest('a.card[href*="characters/"]');
  const index = card ? cards.indexOf(card) : -1;
  if (index >= 0) {
    state.longzuCharacterIndex = index;
    updateLongzuHint("单指已聚焦人物档案，确认手势打开");
  } else {
    updateLongzuHint("已锁定目标，比赞确认");
  }
}

function lockLongzuFocusTarget(target) {
  const clickableTarget = getLongzuClickableTarget(target);
  if (!clickableTarget) return;
  state.longzuLockedTarget = clickableTarget;
  state.longzuLockedAt = Date.now();
  updateLongzuHint("已锁定目标，比赞确认");
}

function getLongzuClickableTarget(target) {
  if (!target) return null;
  return target.matches("a, button, [role='button']")
    ? target
    : target.closest("a, button, [role='button']");
}

function getValidLongzuLockedTarget() {
  const target = state.longzuLockedTarget;
  if (!target || !target.isConnected) return null;
  if (Date.now() - state.longzuLockedAt > LONGZU_FOCUS_LOCK_MS) return null;
  return target;
}

function clearLongzuPointerFocus() {
  const target = state.longzuPointerTarget;
  if (!target) return;
  delete target.dataset.gesturePointerFocus;
  if (target.dataset.gestureActive !== "true") {
    target.style.outline = "";
    target.style.boxShadow = "";
  }
  state.longzuPointerTarget = null;
}

function applyLongzuAction(gesture) {
  const longzuWindow = getLongzuWindow();
  const longzuDocument = getLongzuDocument();
  if (!longzuWindow || !longzuDocument) return;

  if (gesture === "swipe_up") {
    scrollLongzuPage(1);
    updateLongzuHint("上滑：向下翻阅龙族网页");
    return;
  }
  if (gesture === "swipe_down") {
    scrollLongzuPage(-1);
    updateLongzuHint("左手上滑：向上返回龙族网页");
    return;
  }
  if (gesture === "swipe_left") {
    updateLongzuHint("网页页已关闭左右滑，使用单指聚焦和确认手势选择内容");
    return;
  }
  if (gesture === "swipe_right") {
    updateLongzuHint("网页页已关闭左右滑，使用单指聚焦和确认手势选择内容");
    return;
  }
  if (gesture === "click") {
    openActiveLongzuCharacter();
    return;
  }
  if (gesture === "zoom_in") {
    zoomLongzuPage(0.08);
    return;
  }
  if (gesture === "zoom_out") {
    zoomLongzuPage(-0.08);
  }
}

function scrollLongzuPage(direction) {
  const longzuWindow = getLongzuWindow();
  const longzuDocument = getLongzuDocument();
  if (!longzuWindow || !longzuDocument) return;

  const distance = Math.round((longzuWindow.innerHeight || longzuFrame.clientHeight || 600) * 0.72) * direction;
  longzuWindow.scrollBy({ top: distance, behavior: "smooth" });
  longzuDocument.documentElement.scrollBy({ top: distance, behavior: "smooth" });
  if (longzuDocument.body) longzuDocument.body.scrollBy({ top: distance, behavior: "smooth" });
}

function moveLongzuFocus(direction) {
  const longzuDocument = getLongzuDocument();
  if (!longzuDocument) return;

  const activeSection = getActiveLongzuSection();
  if (activeSection === "characters" && getLongzuCharacterCards().length) {
    state.longzuCharacterIndex = wrapIndex(state.longzuCharacterIndex + direction, getLongzuCharacterCards().length);
    highlightLongzuCharacter();
    updateLongzuHint("已选择人物档案，点击手势打开");
    return;
  }

  state.longzuSectionIndex = wrapIndex(getLongzuSectionIndex() + direction, LONGZU_SECTIONS.length);
  const target = longzuDocument.getElementById(LONGZU_SECTIONS[state.longzuSectionIndex]);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  updateLongzuHint(`切换到 ${LONGZU_SECTIONS[state.longzuSectionIndex]} 区域`);
}

function getActiveLongzuSection() {
  return LONGZU_SECTIONS[getLongzuSectionIndex()] || "hero";
}

function getLongzuSectionIndex() {
  const longzuWindow = getLongzuWindow();
  const longzuDocument = getLongzuDocument();
  if (!longzuWindow || !longzuDocument) return state.longzuSectionIndex;

  const sections = LONGZU_SECTIONS
    .map((id) => longzuDocument.getElementById(id))
    .filter(Boolean);
  const scrollTop = longzuWindow.scrollY || longzuDocument.documentElement.scrollTop || 0;
  let closestIndex = state.longzuSectionIndex;
  let closestDistance = Number.POSITIVE_INFINITY;
  sections.forEach((section, index) => {
    const distance = Math.abs(section.offsetTop - scrollTop);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  state.longzuSectionIndex = closestIndex;
  return closestIndex;
}

function getLongzuCharacterCards() {
  const longzuDocument = getLongzuDocument();
  if (!longzuDocument) return [];
  return [...longzuDocument.querySelectorAll('a.card[href*="characters/"]')];
}

function highlightLongzuCharacter() {
  const cards = getLongzuCharacterCards();
  cards.forEach((card, index) => {
    const active = index === state.longzuCharacterIndex;
    card.dataset.gestureActive = active ? "true" : "false";
    const pointerFocused = card.dataset.gesturePointerFocus === "true";
    card.style.outline = pointerFocused ? card.style.outline : active ? "2px solid rgba(255, 209, 102, 0.92)" : "";
    card.style.boxShadow = pointerFocused ? card.style.boxShadow : active ? "0 0 0 6px rgba(255, 209, 102, 0.12), 0 22px 70px rgba(0, 0, 0, 0.42)" : "";
  });
  if (cards[state.longzuCharacterIndex]) {
    cards[state.longzuCharacterIndex].scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }
}

function openActiveLongzuCharacter() {
  const longzuDocument = getLongzuDocument();
  const longzuWindow = getLongzuWindow();
  if (!longzuDocument || !longzuWindow) return;

  const cards = getLongzuCharacterCards();
  const lockedTarget = getValidLongzuLockedTarget();
  if (lockedTarget) {
    lockedTarget.click();
    updateLongzuHint("正在打开锁定内容");
    return;
  }

  if (cards.length) {
    highlightLongzuCharacter();
    cards[state.longzuCharacterIndex].click();
    updateLongzuHint("正在打开人物档案");
    return;
  }

  const profile = longzuDocument.getElementById("profile");
  if (profile) {
    profile.scrollIntoView({ behavior: "smooth", block: "start" });
    updateLongzuHint("打开人物 Profile 区域");
    return;
  }

  longzuWindow.scrollBy({ top: Math.round(longzuWindow.innerHeight * 0.72), behavior: "smooth" });
}

function zoomLongzuPage(delta) {
  const longzuDocument = getLongzuDocument();
  if (!longzuDocument || !longzuDocument.body) return;
  state.longzuZoom = Math.max(0.72, Math.min(1.34, state.longzuZoom + delta));
  longzuDocument.body.style.zoom = state.longzuZoom;
  updateLongzuHint(`页面缩放 ${Math.round(state.longzuZoom * 100)}%`);
}

function wrapIndex(index, length) {
  if (!length) return 0;
  return ((index % length) + length) % length;
}

function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateLongzuHint(message) {
  if (longzuGestureHint) longzuGestureHint.textContent = message;
}

function applyMediaAction(gesture) {
  if (gesture === "swipe_right") switchMediaTrack(1);
  if (gesture === "swipe_left") switchMediaTrack(-1);
  if (gesture === "zoom_in") state.volume = Math.min(100, state.volume + 10);
  if (gesture === "zoom_out") state.volume = Math.max(0, state.volume - 10);
  if (gesture === "click") toggleMediaPlayback();
  renderMediaTrack();
  if (gesture === "zoom_in" || gesture === "zoom_out") updateMediaGestureHint(`音量 ${state.volume}%`);
}

function switchMediaTrack(direction) {
  state.mediaIndex = wrapIndex(state.mediaIndex + direction, MEDIA_TRACKS.length);
  renderMediaTrack(state.playing);
  const track = MEDIA_TRACKS[state.mediaIndex] || MEDIA_TRACKS[0];
  updateMediaGestureHint(`已切换：${track.title}`);
}

function toggleMediaPlayback() {
  if (!mediaPlayer) return;
  state.playing = !state.playing;
  if (state.playing) {
    mediaPlayer.play();
  } else {
    mediaPlayer.pause();
  }
}

function renderMediaTrack(shouldContinuePlaying = state.playing) {
  const track = MEDIA_TRACKS[state.mediaIndex] || MEDIA_TRACKS[0];
  if (!track) return;
  if (mediaPlayer && mediaPlayer.getAttribute("src") !== track.src) {
    mediaPlayer.src = track.src;
    mediaPlayer.load();
  }
  mediaPlayer.volume = state.volume / 100;
  trackName.textContent = track.title;
  playerState.textContent = state.playing ? "播放中" : "暂停";
  volumeBar.value = state.volume;
  if (shouldContinuePlaying && mediaPlayer) mediaPlayer.play();
}

async function collectSample() {
  collectState.textContent = "正在录制样本...";
  const frames = [];
  const endAt = Date.now() + 2200;
  while (Date.now() < endAt) {
    const frame = captureFrame();
    if (frame) frames.push(frame);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  const response = await fetch("/api/collect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: collectLabel.value, frames }),
  });
  const result = await response.json();
  collectState.textContent = result.error || "样本已保存";
  await refreshCounts();
}

async function refreshCounts() {
  const response = await fetch("/api/sample-counts");
  const counts = await response.json();
  sampleCounts.innerHTML = Object.entries(counts).map(([label, count]) => `<span>${label}: ${count}</span>`).join("");
}

document.getElementById("startCamera").addEventListener("click", () => {
  startCamera().then(startRealtimeEngine).catch(() => updateRealtimeStatus("error"));
});
document.getElementById("stopCamera").addEventListener("click", stopCamera);
document.getElementById("collectSample").addEventListener("click", collectSample);

document.querySelectorAll(".gesture-demo-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const gesture = button.dataset.gesture;
    if (!state.particleScene) return;
    state.demoOverrideUntil = Date.now() + 1800;
    state.particleScene.applyGesture(gesture, 0.96, true);
    gestureName.textContent = gesture;
    confidence.textContent = "96%";
    triggerState.textContent = "已触发";
    particleConfidence.textContent = "96%";
    particleState.textContent = getParticleDemoState(gesture);
  });
});

function getParticleDemoState(gesture) {
  return {
    swipe_left: "左旋",
    swipe_right: "右旋",
    swipe_up: "上扬",
    swipe_down: "下落",
    click: "换色",
    zoom_in: "最大",
    zoom_out: "最远",
  }[gesture] || "已触发";
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    state.view = view;
    state.mode = button.dataset.mode;
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.remove("active-view-panel"));
    document.getElementById(`${view}View`).classList.add("active-view-panel");
    document.querySelectorAll(".mode-view").forEach((view) => view.classList.remove("active-view"));
    const modePanel = document.getElementById(`${state.mode}Mode`);
    if (modePanel) modePanel.classList.add("active-view");
    if (pageEyebrow) pageEyebrow.textContent = button.dataset.eyebrow || "";
    if (pageTitle) pageTitle.textContent = button.dataset.title || button.textContent.trim();
    document.body.classList.toggle("particle-focus", state.mode === "particles");
    if (state.mode === "canvas") {
      stopCamera();
    }
    if (["web", "media", "particles"].includes(state.mode)) {
      startCamera().then(startRealtimeEngine).catch(() => updateRealtimeStatus("error"));
    }
    renderMapping();
  });
});

window.addEventListener("load", async () => {
  state.particleScene = window.createParticleScene(document.getElementById("particleCanvas"));
  renderMediaTrack(false);
  await loadStatus();
  startCamera().then(startRealtimeEngine).catch(() => updateRealtimeStatus("error"));
  captureLoop();
  predictLoop();
});
