import json
import subprocess


def run_node(script):
    completed = subprocess.run(
        ["node", "-e", script],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def test_gesture_rules_return_no_demo_gesture_without_hands():
    result = run_node(
        """
        const rules = require('./static/js/gesture_rules.js');
        const state = rules.createGestureRuleState();
        console.log(JSON.stringify({
          gesture: rules.classifyDemoGesture(null, state, 1000)
        }));
        """
    )
    assert result["gesture"] is None


def test_gesture_rules_map_open_and_closed_hands_to_zoom_gestures():
    result = run_node(
        """
        const rules = require('./static/js/gesture_rules.js');
        const openState = rules.createGestureRuleState();
        const fistState = rules.createGestureRuleState();
        console.log(JSON.stringify({
          open: rules.classifyDemoGesture({ hasHands: true, openness: 0.9, center: { x: 0.5, y: 0.5 } }, openState, 1000),
          fist: rules.classifyDemoGesture({ hasHands: true, openness: 0.1, center: { x: 0.5, y: 0.5 } }, fistState, 1000)
        }));
        """
    )
    assert result == {"open": "zoom_in", "fist": "zoom_out"}


def test_gesture_rules_detect_directional_swipes_from_motion():
    result = run_node(
        """
        const rules = require('./static/js/gesture_rules.js');
        const rightState = rules.createGestureRuleState();
        const leftState = rules.createGestureRuleState();
        rules.classifyDemoGesture({ hasHands: true, openness: 0.45, center: { x: 0.25, y: 0.5 } }, rightState, 1000);
        rules.classifyDemoGesture({ hasHands: true, openness: 0.45, center: { x: 0.75, y: 0.5 } }, leftState, 1000);
        console.log(JSON.stringify({
          right: rules.classifyDemoGesture({ hasHands: true, openness: 0.45, center: { x: 0.42, y: 0.51 } }, rightState, 1300),
          left: rules.classifyDemoGesture({ hasHands: true, openness: 0.45, center: { x: 0.55, y: 0.51 } }, leftState, 1300)
        }));
        """
    )
    assert result == {"right": "swipe_right", "left": "swipe_left"}


def test_gesture_rules_detect_swipes_from_short_motion_trail():
    result = run_node(
        """
        const rules = require('./static/js/gesture_rules.js');
        const state = rules.createGestureRuleState();
        rules.classifyDemoGesture({ hasHands: true, openness: 0.45, center: { x: 0.30, y: 0.50 } }, state, 1000);
        rules.classifyDemoGesture({ hasHands: true, openness: 0.45, center: { x: 0.35, y: 0.50 } }, state, 1060);
        console.log(JSON.stringify({
          gesture: rules.classifyDemoGesture({ hasHands: true, openness: 0.45, center: { x: 0.40, y: 0.51 } }, state, 1120)
        }));
        """
    )
    assert result["gesture"] == "swipe_right"


def test_gesture_rules_use_demo_tuned_swipe_thresholds():
    source = open("static/js/gesture_rules.js", encoding="utf-8-sig").read()
    assert "const SWIPE_MIN_DELTA = 0.08;" in source
    assert "const SWIPE_AXIS_RATIO = 1.15;" in source
    assert "const GESTURE_COOLDOWN_MS = 420;" in source
