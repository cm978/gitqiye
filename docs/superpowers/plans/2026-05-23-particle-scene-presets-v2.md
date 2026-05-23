# Particle Scene Presets V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace object-like 3D particle presets with four full-scene visual presets and restore open-palm/fist demo controls to two fixed zoom states.

**Architecture:** Keep the existing Flask page and navigation. Modify the particle preset buttons in `templates/index.html`, replace Three.js particle builders in `static/js/particles.js`, and simplify demo gesture handling in `static/js/app.js`.

**Tech Stack:** HTML, CSS, JavaScript, Three.js.

---

### Task 1: Preset UI

**Files:**
- Modify: `templates/index.html`

- [ ] Change particle presets to 星河, 隧道, 神经, 光幕.
- [ ] Keep 张开手掌 and 握拳 demo buttons.
- [ ] Remove the scale slider because the user wants two fixed states again.

### Task 2: Particle Engine

**Files:**
- Modify: `static/js/particles.js`

- [ ] Replace current point-cloud object presets with full-scene presets: galaxy, tunnel, neural, lightCurtain.
- [ ] Avoid central sphere-like composition.
- [ ] Make open_palm set a fixed zoom-in state and fist set a fixed zoom-out state.

### Task 3: Demo Controls

**Files:**
- Modify: `static/js/app.js`

- [ ] Remove press-and-hold continuous scaling and slider logic.
- [ ] Make 张开手掌 call open_palm once and show 放大.
- [ ] Make 握拳 call fist once and show 缩小.

### Task 4: Verify

- [ ] Update static resource version.
- [ ] Request `http://127.0.0.1:5000/?fresh=<version>` and confirm new resources load.
