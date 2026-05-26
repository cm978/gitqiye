class ParticleScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.mode = "nebula";
    this.count = 26000;
    this.time = 0;
    this.scale = 1;
    this.spread = 0.08;
    this.turbulence = 0.12;
    this.autoShow = true;
    this.lastHandAt = 0;
    this.cameraZ = 132;
    this.targetCameraZ = 132;
    this.paletteShift = 0;
    this.rotationBoost = { x: 0, y: 0 };
    this.handDrift = { x: 0, y: 0 };
    this.fanForce = { x: 0, y: 0 };
    this.followTarget = { x: 0, y: 0 };
    this.verticalFlow = 0;
    this.palette = [
      new THREE.Color("#38f7ff"),
      new THREE.Color("#7b61ff"),
      new THREE.Color("#ff4fd8"),
      new THREE.Color("#45ffb0"),
      new THREE.Color("#fff2b8"),
    ];

    this.currentPositions = new Float32Array(this.count * 3);
    this.targetPositions = new Float32Array(this.count * 3);
    this.basePositions = new Float32Array(this.count * 3);
    this.randomOffsets = new Float32Array(this.count * 3);
    this.colors = new Float32Array(this.count * 3);
    this.targetColors = new Float32Array(this.count * 3);
    this.sizes = new Float32Array(this.count);
    this.alphas = new Float32Array(this.count);
    this.seeds = new Float32Array(this.count);

    this.initArrays();
    this.initThree();
    this.bindPresetButtons();
    this.setPreset("nebula");
    window.addEventListener("resize", () => this.resize());
    requestAnimationFrame(() => this.tick());
  }

  initArrays() {
    for (let i = 0; i < this.count; i += 1) {
      const j = i * 3;
      this.currentPositions[j] = this.rand(-160, 160);
      this.currentPositions[j + 1] = this.rand(-90, 90);
      this.currentPositions[j + 2] = this.rand(-120, 80);
      this.randomOffsets[j] = this.rand(-1, 1);
      this.randomOffsets[j + 1] = this.rand(-1, 1);
      this.randomOffsets[j + 2] = this.rand(-1, 1);
      this.sizes[i] = this.rand(1.0, 2.45);
      this.alphas[i] = this.rand(0.46, 0.95);
      this.seeds[i] = Math.random() * 1000;
    }
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x01030b, 0.0046);
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1800);
    this.camera.position.set(0, 0, this.cameraZ);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x01030b, 1);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.currentPositions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute("aSeed", new THREE.BufferAttribute(this.seeds, 1));
    this.material = this.createParticleMaterial();
    this.points = new THREE.Points(this.geometry, this.material);

    this.group = new THREE.Group();
    this.group.add(this.points);
    this.scene.add(this.group);
    this.starField = this.createBackgroundStars();
    this.scene.add(this.starField);
  }

  createParticleMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.2 },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute float aSeed;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uTime;
        uniform float uEnergy;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vec3 p = position;
          float micro = sin(uTime * 4.0 + aSeed * 11.0) * 0.18 * uEnergy;
          p += normalize(position + vec3(0.001)) * micro;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * (420.0 / max(18.0, -mvPosition.z)) * (1.0 + uEnergy * 0.35);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          float core = smoothstep(0.20, 0.0, d);
          float glow = smoothstep(0.50, 0.0, d) * 0.72;
          float alpha = (core + glow) * vAlpha;
          if (alpha < 0.015) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });
  }

  bindPresetButtons() {
    document.querySelectorAll(".preset-btn").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".preset-btn").forEach((item) => item.classList.toggle("active", item === button));
        this.setPreset(button.dataset.preset);
      });
    });
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setPreset(mode) {
    this.mode = mode;
    const builders = {
      nebula: () => this.buildNebula(),
      galaxy: () => this.buildGalaxy(),
      heart: () => this.buildHeart(),
      saturn: () => this.buildSaturn(),
      lotus: () => this.buildLotus(),
    };
    (builders[mode] || builders.nebula)();
    this.geometry.attributes.color.needsUpdate = true;
  }

  buildNebula() {
    for (let i = 0; i < this.count; i += 1) {
      const j = i * 3;
      const layer = i % 5;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 0.45) * (34 + layer * 16);
      const twist = angle + radius * 0.055 + layer * 0.62;
      const y = this.rand(-22, 22) + Math.sin(twist * 2.0) * 8;
      this.writeTarget(j, Math.cos(twist) * radius, y, Math.sin(twist) * radius * 0.46);
      this.writeColor(j, this.colorMix(i, radius / 110, ["#39f8ff", "#8d6cff", "#ff55df", "#ffffff"]));
    }
  }

  buildGalaxy() {
    for (let i = 0; i < this.count; i += 1) {
      const j = i * 3;
      const arm = i % 4;
      const radius = Math.pow(Math.random(), 0.58) * 92;
      const angle = radius * 0.105 + arm * Math.PI * 0.5 + this.rand(-0.16, 0.16);
      const lift = Math.sin(radius * 0.075 + arm) * 5 + this.rand(-4, 4);
      this.writeTarget(j, Math.cos(angle) * radius, lift, Math.sin(angle) * radius * 0.58);
      this.writeColor(j, this.colorMix(i, radius / 92, ["#fff7be", "#39f8ff", "#5f72ff", "#ff4ccf"]));
    }
  }

  buildHeart() {
    for (let i = 0; i < this.count; i += 1) {
      const j = i * 3;
      const t = Math.random() * Math.PI * 2;
      const shell = Math.pow(Math.random(), 0.34);
      const x2 = 16 * Math.pow(Math.sin(t), 3);
      const y2 = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      const depth = this.rand(-8, 8) * (1 - shell * 0.15);
      const scale = 3.1 * shell;
      this.writeTarget(j, x2 * scale, y2 * scale - 8, depth + Math.sin(t * 3) * 4);
      this.writeColor(j, this.colorMix(i, shell, ["#ff4fd8", "#ff7aa8", "#fff2d0", "#7b61ff"]));
    }
  }

  buildSaturn() {
    for (let i = 0; i < this.count; i += 1) {
      const j = i * 3;
      if (i < this.count * 0.46) {
        const coreRatio = i / (this.count * 0.46);
        const innerCore = coreRatio < 0.22;
        const radius = innerCore ? Math.pow(Math.random(), 0.62) * 15 : 15 + Math.pow(Math.random(), 0.72) * 18;
        const p = this.spherePoint(radius);
        const banding = Math.sin((p.y + radius) * 0.42) * 1.6;
        const softEdge = Math.max(0, 1 - radius / 35);
        this.writeTarget(j, p.x * 1.08, p.y * 0.92 + banding, p.z * 1.02);
        this.writeColor(j, this.colorMix(i, softEdge, ["#ffcf7a", "#fff7ca", "#ff8f6c", "#45f4ff"]));
        this.sizes[i] = innerCore ? this.rand(2.35, 3.55) : this.rand(1.7, 2.85);
        this.alphas[i] = innerCore ? this.rand(0.78, 0.96) : this.rand(0.62, 0.9);
      } else {
        const angle = Math.random() * Math.PI * 2;
        const radius = this.rand(45, 86);
        const band = Math.sin(radius * 0.42) * 1.45;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius * 0.32;
        const centerOcclusion = Math.max(0, 1 - Math.hypot(x / 58, z / 27));
        this.writeTarget(j, x, band + this.rand(-1.4, 1.4), z);
        this.writeColor(j, this.colorMix(i, (radius - 42) / 40, ["#fff6c8", "#39f8ff", "#ff4fd8", "#7b61ff"]));
        this.sizes[i] = this.rand(1.18, 2.35) * (1 - centerOcclusion * 0.46);
        this.alphas[i] = this.rand(0.48, 0.82) * (1 - centerOcclusion * 0.86);
      }
    }
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }

  buildLotus() {
    for (let i = 0; i < this.count; i += 1) {
      const j = i * 3;
      const petal = i % 12;
      const u = Math.random();
      const v = Math.random();
      const angle = petal * Math.PI * 2 / 12 + this.rand(-0.15, 0.15);
      const petalLen = 20 + (petal % 3) * 7;
      const radius = 10 + Math.pow(u, 0.58) * petalLen;
      const width = Math.sin(u * Math.PI) * 8 * (1 - v * 0.42);
      const curl = Math.sin(u * Math.PI) * 16 + Math.cos(petal) * 3;
      const x = Math.cos(angle) * radius + Math.cos(angle + Math.PI / 2) * width * this.rand(-1, 1);
      const z = Math.sin(angle) * radius * 0.58 + Math.sin(angle + Math.PI / 2) * width * this.rand(-1, 1);
      const y = curl - 28 + v * 10;
      this.writeTarget(j, x, y, z);
      this.writeColor(j, this.colorMix(i, u, ["#38f7ff", "#45ffb0", "#fff2b8", "#ff4fd8"]));
    }
  }

  updateHands(handData) {
    if (!handData) {
      if (Date.now() - this.lastHandAt > 900) this.autoShow = true;
      return;
    }
    this.lastHandAt = Date.now();
    this.autoShow = false;
    const center = handData.center || { x: 0.5, y: 0.5 };
    const velocity = handData.velocity || { x: 0, y: 0 };
    const openness = this.clamp(handData.openness || 0, 0, 1);
    const pinch = this.clamp(handData.pinch || 0, 0, 1);
    const motion = this.clamp(handData.motion || 0, 0, 1);
    const hands = handData.hands || 1;
    this.handDrift.x += ((center.x - 0.5) * 2 - this.handDrift.x) * 0.18;
    this.handDrift.y += ((center.y - 0.5) * 2 - this.handDrift.y) * 0.18;
    this.fanForce.x += (this.clamp(velocity.x * 3.8, -1, 1) - this.fanForce.x) * 0.22;
    this.fanForce.y += (this.clamp(velocity.y * 3.8, -1, 1) - this.fanForce.y) * 0.22;
    this.followTarget.x = (center.x - 0.5) * 52;
    this.followTarget.y = (0.5 - center.y) * 34;
    this.verticalFlow += ((this.handDrift.y * 8) + (this.fanForce.y * 22) - this.verticalFlow) * 0.12;
    this.scale = 0.82 + openness * 0.78 - pinch * 0.22 + (hands > 1 ? 0.16 : 0);
    this.spread = Math.max(0.04, 0.08 + openness * 0.62 + motion * 0.45 - pinch * 0.16);
    this.turbulence = 0.10 + motion * 1.2 + openness * 0.45;
    this.targetCameraZ = 148 - openness * 54;
  }

  applyGesture(gesture, confidence = 0, triggered = false) {
    this.confidence = confidence || 0;
    if (gesture === "swipe_left") this.rotationBoost.y = -0.045;
    if (gesture === "swipe_right") this.rotationBoost.y = 0.045;
    if (gesture === "swipe_up") this.rotationBoost.x = -0.035;
    if (gesture === "swipe_down") this.rotationBoost.x = 0.035;
    if (gesture === "zoom_in" || gesture === "open_palm") {
      this.updateHands({ openness: 1, motion: 0.85, hands: 2 });
    }
    if (gesture === "zoom_out" || gesture === "fist") {
      this.updateHands({ openness: 0.08, motion: 0.35, hands: 1 });
    }
    if (gesture === "click" && triggered) {
      this.paletteShift = (this.paletteShift + 1) % this.palette.length;
      this.setPreset(this.mode);
    }
  }

  tick() {
    this.time += 0.01;
    if (Date.now() - this.lastHandAt > 1100) {
      this.autoShow = true;
      this.scale += (1.06 + Math.sin(this.time * 0.9) * 0.08 - this.scale) * 0.035;
      this.spread += (0.18 + Math.sin(this.time * 0.7) * 0.06 - this.spread) * 0.03;
      this.turbulence += (0.22 - this.turbulence) * 0.035;
      this.targetCameraZ = 132;
      this.handDrift.x *= 0.94;
      this.handDrift.y *= 0.94;
      this.fanForce.x *= 0.9;
      this.fanForce.y *= 0.9;
      this.followTarget.x *= 0.92;
      this.followTarget.y *= 0.92;
      this.verticalFlow *= 0.94;
    }
    this.cameraZ += (this.targetCameraZ - this.cameraZ) * 0.08;
    this.camera.position.z = this.cameraZ;

    this.updateParticlePositions();
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uEnergy.value = this.clamp(this.turbulence, 0.08, 1.4);
    this.group.position.x += (this.followTarget.x - this.group.position.x) * 0.12;
    this.group.position.y += (this.followTarget.y - this.group.position.y) * 0.12;
    this.group.rotation.y += (this.autoShow ? 0.0028 : 0.0012) + this.rotationBoost.y + this.handDrift.x * 0.0035 + this.fanForce.x * 0.018;
    this.group.rotation.x += 0.0008 + this.rotationBoost.x - this.handDrift.y * 0.0025 - this.fanForce.y * 0.012;
    if (this.mode === "saturn") this.group.rotation.z = -0.18;
    this.starField.rotation.y -= 0.00042;
    this.rotationBoost.x *= 0.90;
    this.rotationBoost.y *= 0.90;

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.tick());
  }

  updateParticlePositions() {
    const pos = this.geometry.attributes.position.array;
    const color = this.geometry.attributes.color.array;
    const speed = this.autoShow ? 0.038 : 0.16;
    const colorSpeed = 0.08;
    for (let i = 0; i < this.count; i += 1) {
      const j = i * 3;
      const seed = this.seeds[i];
      const noise = Math.sin(this.time * 2.8 + seed) * this.turbulence;
      const breathing = Math.sin(this.time * 1.4 + seed * 0.3) * this.spread;
      const tx = this.targetPositions[j] * this.scale + this.randomOffsets[j] * (14 * this.spread + noise);
      const ty = this.targetPositions[j + 1] * this.scale + this.randomOffsets[j + 1] * (14 * this.spread + breathing) + this.verticalFlow;
      const tz = this.targetPositions[j + 2] * this.scale + this.randomOffsets[j + 2] * (18 * this.spread + noise);
      pos[j] += (tx - pos[j]) * speed;
      pos[j + 1] += (ty - pos[j + 1]) * speed;
      pos[j + 2] += (tz - pos[j + 2]) * speed;
      color[j] += (this.targetColors[j] - color[j]) * colorSpeed;
      color[j + 1] += (this.targetColors[j + 1] - color[j + 1]) * colorSpeed;
      color[j + 2] += (this.targetColors[j + 2] - color[j + 2]) * colorSpeed;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  createBackgroundStars() {
    const count = 5200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const j = i * 3;
      positions[j] = this.rand(-540, 540);
      positions[j + 1] = this.rand(-300, 300);
      positions[j + 2] = this.rand(-980, -120);
      const c = new THREE.Color("#38f7ff").lerp(new THREE.Color("#ff4fd8"), Math.random() * 0.6);
      colors[j] = c.r;
      colors[j + 1] = c.g;
      colors[j + 2] = c.b;
      sizes[i] = this.rand(0.42, 1.3);
      alphas[i] = this.rand(0.18, 0.58);
      seeds[i] = Math.random() * 100;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    return new THREE.Points(geometry, this.createStarMaterial());
  }

  createStarMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * (290.0 / max(28.0, -mvPosition.z));
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float alpha = smoothstep(0.5, 0.0, length(uv)) * vAlpha;
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });
  }

  writeTarget(index, x, y, z) {
    this.targetPositions[index] = x;
    this.targetPositions[index + 1] = y;
    this.targetPositions[index + 2] = z;
  }

  writeColor(index, color) {
    this.targetColors[index] = color.r;
    this.targetColors[index + 1] = color.g;
    this.targetColors[index + 2] = color.b;
  }

  colorMix(index, mix, stops) {
    const shifted = (index + this.paletteShift) % stops.length;
    const a = new THREE.Color(stops[shifted]);
    const b = new THREE.Color(stops[(shifted + 1) % stops.length]);
    return a.lerp(b, this.clamp(mix, 0, 1));
  }

  spherePoint(radius) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    return {
      x: Math.sin(phi) * Math.cos(theta) * radius,
      y: Math.sin(phi) * Math.sin(theta) * radius,
      z: Math.cos(phi) * radius,
    };
  }

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  rand(min, max) {
    return min + Math.random() * (max - min);
  }
}

window.createParticleScene = function createParticleScene(canvas) {
  if (!window.THREE) {
    console.error("Three.js is required for ParticleScene.");
    return { applyGesture() {}, updateHands() {} };
  }
  return new ParticleScene(canvas);
};
