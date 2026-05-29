(function attachRealtimeGestures(root) {
  const TASKS_VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";
  const WASM_ASSET_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
  const GESTURE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

  const CATEGORY_TO_GESTURE = {
    Open_Palm: "open_palm",
    Closed_Fist: "fist",
    Pointing_Up: "point",
    Thumb_Up: "confirm",
    Victory: "victory",
    ILoveYou: "confirm",
  };

  function createRealtimeGestureEngine({ video, onSignal, onStatus, intervalMs = 100 } = {}) {
    let recognizer = null;
    let running = false;
    let busy = false;
    let lastRunAt = 0;
    let lastCenter = null;
    let lastCenterAt = 0;

    async function init() {
      notify("loading");
      try {
        const vision = await import(TASKS_VISION_URL);
        const resolver = await vision.FilesetResolver.forVisionTasks(WASM_ASSET_PATH);
        recognizer = await vision.GestureRecognizer.createFromOptions(resolver, {
          baseOptions: {
            modelAssetPath: GESTURE_MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });
        notify("ready");
      } catch (error) {
        notify("error", error);
        throw error;
      }
    }

    async function start() {
      if (!video) throw new Error("video element is required");
      if (!recognizer) await init();
      if (running) return;
      running = true;
      requestAnimationFrame(tick);
    }

    function stop() {
      running = false;
    }

    function tick(now) {
      if (!running) return;
      if (video.readyState >= 2 && !busy && now - lastRunAt >= intervalMs) {
        busy = true;
        lastRunAt = now;
        try {
          const result = recognizer.recognizeForVideo(video, now);
          const signal = buildSignal(result, now);
          if (signal && onSignal) onSignal(signal);
        } catch (error) {
          notify("error", error);
        } finally {
          busy = false;
        }
      }
      requestAnimationFrame(tick);
    }

    function buildSignal(result, now) {
      const landmarks = result.landmarks || [];
      const primaryHand = landmarks[0] || [];
      const category = result.gestures && result.gestures[0] && result.gestures[0][0] ? result.gestures[0][0] : null;
      if (!primaryHand.length && !category) return null;

      const center = primaryHand.length ? computeCenter(primaryHand) : { x: 0.5, y: 0.5 };
      const openness = primaryHand.length ? computeOpenness(primaryHand) : 0;
      const pinch = primaryHand.length ? computePinch(primaryHand) : 0;
      const velocity = computeVelocity(center, now);
      const motion = Math.max(Math.abs(velocity.x), Math.abs(velocity.y));
      const rawGesture = category ? category.categoryName : "Unknown";
      const swipe = detectSwipe(velocity);
      let gesture = swipe || CATEGORY_TO_GESTURE[rawGesture] || null;

      return {
        source: "realtime",
        gesture,
        rawGesture,
        confidence: category ? category.score : 0,
        center,
        velocity,
        openness,
        pinch,
        motion,
        hands: landmarks.length,
        triggered: Boolean(gesture),
      };
    }

    function computeVelocity(center, now) {
      if (!lastCenter) {
        lastCenter = center;
        lastCenterAt = now;
        return { x: 0, y: 0 };
      }
      const elapsed = Math.max((now - lastCenterAt) / 1000, 0.016);
      const velocity = {
        x: clamp((center.x - lastCenter.x) / elapsed / 4, -1, 1),
        y: clamp((center.y - lastCenter.y) / elapsed / 4, -1, 1),
      };
      lastCenter = center;
      lastCenterAt = now;
      return velocity;
    }

    function notify(status, error) {
      if (onStatus) onStatus({ status, error });
    }

    return { init, start, stop };
  }

  function computeCenter(hand) {
    const total = hand.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    return { x: total.x / hand.length, y: total.y / hand.length };
  }

  function computeOpenness(hand) {
    const wrist = hand[0];
    const middleBase = hand[9] || wrist;
    const palmSize = distance(wrist, middleBase) || 0.08;
    const tipIds = [4, 8, 12, 16, 20];
    const spread = tipIds.reduce((sum, index) => sum + distance(hand[index] || wrist, wrist), 0) / tipIds.length;
    return clamp((spread / palmSize - 1.35) / 1.65, 0, 1);
  }

  function computePinch(hand) {
    const thumb = hand[4] || hand[0];
    const index = hand[8] || hand[0];
    const wrist = hand[0];
    const middleBase = hand[9] || wrist;
    const palmSize = distance(wrist, middleBase) || 0.08;
    return clamp(1 - distance(thumb, index) / (palmSize * 1.45), 0, 1);
  }

  function detectSwipe(velocity) {
    const absX = Math.abs(velocity.x);
    const absY = Math.abs(velocity.y);
    if (absX > 0.30 && absX > absY * 1.25) return velocity.x > 0 ? "swipe_right" : "swipe_left";
    if (absY > 0.30 && absY > absX * 1.25) return velocity.y > 0 ? "swipe_down" : "swipe_up";
    return null;
  }

  function distance(a, b) {
    return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  root.RealtimeGestures = { createRealtimeGestureEngine };
})(window);
