# Three Particle Interaction Implementation Plan

Goal: Replace the 2D canvas particle visual with a Three.js 3D particle scene.

Tasks:
1. Add Three.js script to the page and add model preset buttons.
2. Rewrite `static/js/particles.js` around a Three.js scene, camera, renderer, point cloud, and gesture API.
3. Style model preset buttons to appear only in particle focus mode.
4. Update resource versions and verify page returns the new assets.
