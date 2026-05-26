const state = {
  stream: null,
  mode: "web",
  frames: [],
  labels: [],
  mappings: {},
  slideIndex: 0,
  volume: 50,
  playing: false,
  particleScene: null,
  demoMode: true,
  handSignal: null,
  gestureRuleState: window.GestureRules ? window.GestureRules.createGestureRuleState() : null,
  pendingDemoGesture: null,
  demoOverrideUntil: 0,
  handTracker: null,
  handTrackingBusy: false,
  lastHandSignature: null,
  lastHandCenter: null,
};

const camera = document.getElementById("camera");
const canvas = document.getElementById("captureCanvas");
const ctx = canvas.getContext("2d");
const gestureName = document.getElementById("gestureName");
const confidence = document.getElementById("confidence");
const actionName = document.getElementById("actionName");
const triggerState = document.getElementById("triggerState");
const historyBody = document.getElementById("historyBody");
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
const pageTitle = document.getElementById("pageTitle");

async function loadStatus() {
  const response = await fetch("/api/status");
  const status = await response.json();
  state.labels = status.labels;
  state.mappings = status.mappings;
  state.demoMode = status.demo_mode;
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
  if (state.stream) return;
  state.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  camera.srcObject = state.stream;
}

function stopCamera() {
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  camera.srcObject = null;
}

function initHandTracking() {
  if (!window.Hands || state.handTracker) return;
  state.handTracker = new window.Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  state.handTracker.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,
    minDetectionConfidence: 0.55,
    minTrackingConfidence: 0.55,
  });
  state.handTracker.onResults((results) => {
    const hands = results.multiHandLandmarks || [];
    if (!hands.length) {
      state.handSignal = null;
      if (state.mode === "particles" && state.particleScene) state.particleScene.updateHands(null);
      return;
    }
    const opennessValues = hands.map(computeHandOpenness);
    const openness = opennessValues.reduce((sum, value) => sum + value, 0) / opennessValues.length;
    const center = computeHandsCenter(hands);
    const pinch = computeHandPinch(hands);
    const velocity = computeHandVelocity(center);
    const signature = hands.flatMap((hand) => [hand[0].x, hand[0].y, hand[9].x, hand[9].y]).join(",");
    const motion = computeHandMotion(signature);
    state.handSignal = { hasHands: true, hands: hands.length, center, openness, pinch, motion, velocity };
    if (state.demoMode && window.GestureRules && state.gestureRuleState) {
      const liveGesture = window.GestureRules.classifyDemoGesture(state.handSignal, state.gestureRuleState);
      if (liveGesture) state.pendingDemoGesture = liveGesture;
    }
    if (state.mode === "particles" && state.particleScene) {
      state.particleScene.updateHands(state.handSignal);
    }
    particleState.textContent = hands.length > 1 ? "双手交互" : "手势交互";
  });
  requestAnimationFrame(handTrackingLoop);
}

function computeHandOpenness(landmarks) {
  const wrist = landmarks[0];
  const middleBase = landmarks[9];
  const palmSize = Math.hypot(wrist.x - middleBase.x, wrist.y - middleBase.y) || 0.08;
  const tips = [4, 8, 12, 16, 20];
  const spread = tips.reduce((sum, index) => {
    const tip = landmarks[index];
    return sum + Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
  }, 0) / tips.length;
  return Math.max(0, Math.min(1, (spread / palmSize - 1.35) / 1.65));
}

function computeHandMotion(signature) {
  const values = signature.split(",").map(Number);
  let motion = 0;
  if (state.lastHandSignature) {
    motion = values.reduce((sum, value, index) => sum + Math.abs(value - state.lastHandSignature[index]), 0) / values.length;
  }
  state.lastHandSignature = values;
  return Math.max(0, Math.min(1, motion * 18));
}

function computeHandVelocity(center) {
  const previous = state.lastHandCenter;
  state.lastHandCenter = { x: center.x, y: center.y };
  if (!previous) return { x: 0, y: 0 };
  return {
    x: Math.max(-1, Math.min(1, (center.x - previous.x) * 18)),
    y: Math.max(-1, Math.min(1, (center.y - previous.y) * 18)),
  };
}

function computeHandPinch(hands) {
  const values = hands.map((hand) => {
    const thumb = hand[4];
    const index = hand[8];
    const wrist = hand[0];
    const middleBase = hand[9];
    const palmSize = Math.hypot(wrist.x - middleBase.x, wrist.y - middleBase.y) || 0.08;
    const distance = Math.hypot(thumb.x - index.x, thumb.y - index.y);
    return Math.max(0, Math.min(1, 1 - distance / (palmSize * 1.45)));
  });
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function computeHandsCenter(hands) {
  const points = hands.flatMap((hand) => hand);
  const total = points.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y,
  }), { x: 0, y: 0 });
  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

async function handTrackingLoop() {
  if (state.handTracker && state.stream && camera.readyState >= 2 && !state.handTrackingBusy) {
    state.handTrackingBusy = true;
    try {
      await state.handTracker.send({ image: camera });
    } catch (error) {
      state.handSignal = null;
      if (state.particleScene) state.particleScene.updateHands(null);
    } finally {
      state.handTrackingBusy = false;
    }
  } else if (state.mode === "particles" && state.particleScene) {
    state.handSignal = null;
    state.particleScene.updateHands(null);
  }
  requestAnimationFrame(handTrackingLoop);
}

function captureFrame() {
  if (!state.stream || camera.readyState < 2) return null;
  ctx.drawImage(camera, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

async function predictLoop() {
  const frame = captureFrame();
  if (frame) {
    state.frames.push(frame);
    state.frames = state.frames.slice(-16);
    if (state.frames.length >= 4) await predict();
  }
  setTimeout(predictLoop, 900);
}

async function predict() {
  const demoGesture = state.demoMode ? state.pendingDemoGesture : null;
  state.pendingDemoGesture = null;
  const body = { frames: state.frames, mode: state.mode };
  if (demoGesture) body.demo_gesture = demoGesture;
  const response = await fetch("/api/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (result.error) return;
  if (Date.now() < state.demoOverrideUntil && state.mode === "particles") return;
  gestureName.textContent = result.gesture;
  confidence.textContent = `${Math.round(result.confidence * 100)}%`;
  actionName.textContent = result.action;
  triggerState.textContent = result.triggered ? "已触发" : "识别中";
  particleConfidence.textContent = `${Math.round(result.confidence * 100)}%`;
  particleState.textContent = result.triggered ? "已触发" : "待机";
  fpsPill.textContent = `FPS ${result.fps}`;
  addHistory(result);
  if (state.mode === "particles" && state.particleScene) {
    state.particleScene.applyGesture(result.gesture, result.confidence, result.triggered);
  }
  if (result.triggered) applyAction(result.gesture);
}

function addHistory(result) {
  const row = document.createElement("tr");
  row.innerHTML = `<td>${new Date().toLocaleTimeString()}</td><td>${result.gesture}</td><td>${Math.round(result.confidence * 100)}%</td><td>${result.mode}</td><td>${result.triggered ? result.action : "未触发"}</td>`;
  historyBody.prepend(row);
  while (historyBody.children.length > 10) historyBody.lastElementChild.remove();
}

function applyAction(gesture) {
  if (state.mode === "web") applyWebAction(gesture);
  if (state.mode === "media") applyMediaAction(gesture);
}

function applyWebAction(gesture) {
  const slides = [...document.querySelectorAll(".slide")];
  if (gesture === "swipe_left") state.slideIndex = Math.max(0, state.slideIndex - 1);
  if (gesture === "swipe_right") state.slideIndex = Math.min(slides.length - 1, state.slideIndex + 1);
  if (gesture === "swipe_up") document.getElementById("slides").scrollBy({ top: -80, behavior: "smooth" });
  if (gesture === "swipe_down") document.getElementById("slides").scrollBy({ top: 80, behavior: "smooth" });
  slides.forEach((slide, index) => slide.classList.toggle("active", index === state.slideIndex));
  const activeCounter = slides[state.slideIndex].querySelector("span");
  if (activeCounter) activeCounter.textContent = `${state.slideIndex + 1} / ${slides.length}`;
}

function applyMediaAction(gesture) {
  const tracks = ["Gesture Track 01", "Gesture Track 02", "Gesture Track 03"];
  let current = tracks.indexOf(document.getElementById("trackName").textContent);
  if (gesture === "swipe_left") current = (current + tracks.length - 1) % tracks.length;
  if (gesture === "swipe_right") current = (current + 1) % tracks.length;
  if (gesture === "swipe_up") state.volume = Math.min(100, state.volume + 10);
  if (gesture === "swipe_down") state.volume = Math.max(0, state.volume - 10);
  if (gesture === "click") state.playing = !state.playing;
  document.getElementById("trackName").textContent = tracks[current];
  document.getElementById("playerState").textContent = state.playing ? "播放中" : "暂停";
  document.getElementById("volumeBar").value = state.volume;
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

document.getElementById("startCamera").addEventListener("click", startCamera);
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
    zoom_in: "扩散",
    zoom_out: "聚拢",
  }[gesture] || "已触发";
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    state.mode = button.dataset.mode;
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.remove("active-view-panel"));
    document.getElementById(`${view}View`).classList.add("active-view-panel");
    document.querySelectorAll(".mode-view").forEach((view) => view.classList.remove("active-view"));
    const modePanel = document.getElementById(`${state.mode}Mode`);
    if (modePanel) modePanel.classList.add("active-view");
    if (pageTitle) pageTitle.textContent = button.dataset.title || button.textContent.trim();
    document.body.classList.toggle("particle-focus", state.mode === "particles");
    if (state.mode === "particles") {
      startCamera().then(initHandTracking).catch(() => {});
    }
    renderMapping();
  });
});

window.addEventListener("load", async () => {
  state.particleScene = window.createParticleScene(document.getElementById("particleCanvas"));
  await loadStatus();
  startCamera().then(initHandTracking).catch(() => {});
  predictLoop();
});
