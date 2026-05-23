from config import GESTURE_LABELS, GESTURE_TO_ACTIONS, MODEL_CONFIG


def test_gesture_labels_are_stable():
    assert GESTURE_LABELS == [
        "no_gesture",
        "swipe_left",
        "swipe_right",
        "swipe_up",
        "swipe_down",
        "click",
        "zoom_in",
        "zoom_out",
    ]


def test_each_mode_has_action_for_known_gestures():
    for mode in ["web", "media", "particles"]:
        assert mode in GESTURE_TO_ACTIONS
        for label in GESTURE_LABELS:
            assert label in GESTURE_TO_ACTIONS[mode]


def test_model_config_defaults():
    assert MODEL_CONFIG["sequence_length"] == 16
    assert MODEL_CONFIG["image_size"] == 224
    assert MODEL_CONFIG["num_classes"] == 8
