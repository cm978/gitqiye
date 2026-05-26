(function attachGestureRules(root) {
  const SWIPE_MIN_DELTA = 0.08;
  const SWIPE_AXIS_RATIO = 1.15;
  const GESTURE_COOLDOWN_MS = 420;
  const TRAIL_WINDOW_MS = 260;

  function createGestureRuleState() {
    return {
      lastCenter: null,
      centerTrail: [],
      lastGestureAt: 0,
    };
  }

  function classifyDemoGesture(handSignal, state, now) {
    const ruleState = state || createGestureRuleState();
    const timestamp = now || Date.now();
    if (!handSignal || !handSignal.hasHands) {
      ruleState.lastCenter = null;
      ruleState.centerTrail = [];
      return null;
    }

    const center = handSignal.center || null;
    let gesture = null;
    if (center) {
      ruleState.centerTrail.push({ x: center.x, y: center.y, at: timestamp });
      ruleState.centerTrail = ruleState.centerTrail.filter((point) => timestamp - point.at <= TRAIL_WINDOW_MS);
    }
    const origin = ruleState.centerTrail.length > 1 ? ruleState.centerTrail[0] : ruleState.lastCenter;
    if (center && origin) {
      const dx = center.x - origin.x;
      const dy = center.y - origin.y;
      const horizontal = Math.abs(dx) > SWIPE_MIN_DELTA && Math.abs(dx) > Math.abs(dy) * SWIPE_AXIS_RATIO;
      const vertical = Math.abs(dy) > SWIPE_MIN_DELTA && Math.abs(dy) > Math.abs(dx) * SWIPE_AXIS_RATIO;
      if (horizontal) gesture = dx > 0 ? "swipe_right" : "swipe_left";
      if (vertical) gesture = dy > 0 ? "swipe_down" : "swipe_up";
    }

    if (!gesture && handSignal.openness >= 0.72) gesture = "zoom_in";
    if (!gesture && handSignal.openness <= 0.2) gesture = "zoom_out";
    if (center) ruleState.lastCenter = { x: center.x, y: center.y };
    if (!gesture) return null;

    if (timestamp - ruleState.lastGestureAt < GESTURE_COOLDOWN_MS) return null;
    ruleState.lastGestureAt = timestamp;
    ruleState.centerTrail = center ? [{ x: center.x, y: center.y, at: timestamp }] : [];
    return gesture;
  }

  const api = { createGestureRuleState, classifyDemoGesture };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GestureRules = api;
})(typeof window !== "undefined" ? window : globalThis);
