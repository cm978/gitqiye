const state = {
  stream: null,
  view: "recognition",
  mode: "web",
  frames: [],
  labels: [],
  mappings: {},
  slideIndex: 0,
  volume: 50,
  playing: false,
  particleScene: null,
  realtimeEngine: null,
  realtimeReady: false,
  realtimeCooldowns: {},
  lastStaticGesture: null,
  lastStaticGestureAt: 0,
  demoMode: true,
  sequenceLength: 16,
  predicting: false,
  demoOverrideUntil: 0,
  longzuSectionIndex: 0,
  longzuCharacterIndex: 0,
  longzuZoom: 1,
};

const REALTIME_ACTIONS = {
  open_palm: "zoom_in",
  fist: "zoom_out",
  point: "click",
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
  zoom_in: "实时扩散/放大",
  zoom_out: "实时聚拢/缩小",
  switch_preset: "切换粒子预设",
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
const longzuFrame = document.getElementById("longzuFrame");
const longzuGestureHint = document.getElementById("longzuGestureHint");
const realtimePill = document.getElementById("realtimePill");
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
      intervalMs: 100,
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
  if (state.mode === "particles" && state.particleScene) {
    state.particleScene.updateHands(signal);
  }
  if (state.view === "recognition") return;
  const action = mapRealtimeSignal(signal);
  if (!action || !signal.triggered) return;
  triggerRealtimeAction(action, signal);
}

function mapRealtimeSignal(signal) {
  if (signal.gesture && signal.gesture.startsWith("swipe_")) {
    state.lastStaticGesture = null;
    state.lastStaticGestureAt = 0;
    return REALTIME_ACTIONS[signal.gesture] || null;
  }
  if (!isStaticRealtimeGesture(signal)) return null;
  return REALTIME_ACTIONS[signal.gesture] || null;
}

function isStaticRealtimeGesture(signal) {
  if (!["open_palm", "fist", "point", "confirm", "victory"].includes(signal.gesture)) return false;
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
    updateLongzuHint("下滑：向上返回龙族网页");
    return;
  }
  if (gesture === "swipe_left") {
    moveLongzuFocus(-1);
    return;
  }
  if (gesture === "swipe_right") {
    moveLongzuFocus(1);
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
    card.style.outline = active ? "2px solid rgba(255, 209, 102, 0.92)" : "";
    card.style.boxShadow = active ? "0 0 0 6px rgba(255, 209, 102, 0.12), 0 22px 70px rgba(0, 0, 0, 0.42)" : "";
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

function updateLongzuHint(message) {
  if (longzuGestureHint) longzuGestureHint.textContent = message;
}

function applyMediaAction(gesture) {
  const tracks = ["Gesture Track 01", "Gesture Track 02", "Gesture Track 03"];
  let current = tracks.indexOf(document.getElementById("trackName").textContent);
  if (gesture === "swipe_left") current = (current + tracks.length - 1) % tracks.length;
  if (gesture === "swipe_right") current = (current + 1) % tracks.length;
  if (gesture === "swipe_up") state.volume = Math.min(100, state.volume + 10);
  if (gesture === "swipe_down") state.volume = Math.max(0, state.volume - 10);
  if (gesture === "zoom_in") state.volume = Math.min(100, state.volume + 5);
  if (gesture === "zoom_out") state.volume = Math.max(0, state.volume - 5);
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
    zoom_in: "扩散",
    zoom_out: "聚拢",
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
    if (pageTitle) pageTitle.textContent = button.dataset.title || button.textContent.trim();
    document.body.classList.toggle("particle-focus", state.mode === "particles");
    if (["web", "media", "particles"].includes(state.mode)) {
      startCamera().then(startRealtimeEngine).catch(() => updateRealtimeStatus("error"));
    }
    renderMapping();
  });
});

window.addEventListener("load", async () => {
  state.particleScene = window.createParticleScene(document.getElementById("particleCanvas"));
  await loadStatus();
  startCamera().then(startRealtimeEngine).catch(() => updateRealtimeStatus("error"));
  captureLoop();
  predictLoop();
});
