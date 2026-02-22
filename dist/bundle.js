// src/engine/shape-draw.ts
var TRI_ANGLES = [];
for (let i = 0; i < 3; i++) TRI_ANGLES.push(-Math.PI / 2 + i * 2 * Math.PI / 3);
var PENT_ANGLES = [];
for (let i = 0; i < 5; i++) PENT_ANGLES.push(-Math.PI / 2 + i * 2 * Math.PI / 5);
function drawShape(ctx, x, y, theta, size, shape, rgb, alpha) {
  if (alpha <= 0 || size <= 0) return;
  ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  switch (shape) {
    case "circle":
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "square":
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(theta);
      ctx.fillRect(-size, -size, size * 2, size * 2);
      ctx.restore();
      break;
    case "triangle":
      drawPolygon(ctx, x, y, theta, size, TRI_ANGLES);
      break;
    case "pentagon":
      drawPolygon(ctx, x, y, theta, size, PENT_ANGLES);
      break;
  }
}
function drawPolygon(ctx, x, y, theta, size, baseAngles) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(theta);
  ctx.beginPath();
  for (let i = 0; i < baseAngles.length; i++) {
    const a = baseAngles[i];
    const px = Math.cos(a) * size;
    const py = Math.sin(a) * size;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function batchDrawCircles(ctx, xs, ys, from, to, radius, rgb, glowRadius, glowAlpha, coreAlpha) {
  if (from >= to) return;
  if (glowAlpha > 0 && glowRadius > 0) {
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${glowAlpha})`;
    ctx.beginPath();
    for (let i = from; i < to; i++) {
      ctx.moveTo(xs[i] + glowRadius, ys[i]);
      ctx.arc(xs[i], ys[i], glowRadius, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${coreAlpha})`;
  ctx.beginPath();
  for (let i = from; i < to; i++) {
    ctx.moveTo(xs[i] + radius, ys[i]);
    ctx.arc(xs[i], ys[i], radius, 0, Math.PI * 2);
  }
  ctx.fill();
}

// src/engine/spiral-renderer.ts
var ARRIVAL_DURATION_MS = 120;
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
var SpiralRenderer = class {
  constructor(container) {
    this.W = 0;
    this.H = 0;
    this.dpr = 1;
    // Baking state
    this.bakedCount = 0;
    // Flat arrays for batch circle rendering
    this.posXs = new Float64Array(0);
    this.posYs = new Float64Array(0);
    this.staticCanvas = document.createElement("canvas");
    this.dynamicCanvas = document.createElement("canvas");
    container.appendChild(this.staticCanvas);
    container.appendChild(this.dynamicCanvas);
    this.sCtx = this.staticCanvas.getContext("2d");
    this.dCtx = this.dynamicCanvas.getContext("2d");
  }
  get dynamicCtx() {
    return this.dCtx;
  }
  get width() {
    return this.W;
  }
  get height() {
    return this.H;
  }
  /** Resize both canvases to match the viewport. */
  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    for (const cvs of [this.staticCanvas, this.dynamicCanvas]) {
      cvs.width = this.W * this.dpr;
      cvs.height = this.H * this.dpr;
      cvs.style.width = `${this.W}px`;
      cvs.style.height = `${this.H}px`;
    }
    this.sCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.dCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
  /** Cache flat position arrays for batch circle drawing. */
  setPositions(positions) {
    const N = positions.length;
    this.posXs = new Float64Array(N);
    this.posYs = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      this.posXs[i] = positions[i].x;
      this.posYs[i] = positions[i].y;
    }
  }
  /** Reset baked count (on restart or config change). */
  resetBaked() {
    this.bakedCount = 0;
    this.sCtx.clearRect(0, 0, this.W, this.H);
  }
  /** Bake all particles up to `count` onto the static canvas. */
  bakeUpTo(count, positions, shapeType, radius, rgb) {
    if (count <= this.bakedCount) return;
    const from = this.bakedCount;
    const to = count;
    if (shapeType === "circle") {
      batchDrawCircles(
        this.sCtx,
        this.posXs,
        this.posYs,
        from,
        to,
        radius,
        rgb,
        radius * 2.5,
        0.06,
        0.85
      );
    } else {
      for (let i = from; i < to; i++) {
        const pos = positions[i];
        drawShape(this.sCtx, pos.x, pos.y, pos.theta, radius * 2.5, shapeType, rgb, 0.06);
        drawShape(this.sCtx, pos.x, pos.y, pos.theta, radius, shapeType, rgb, 0.85);
      }
    }
    this.bakedCount = to;
  }
  /** Re-bake all placed particles (after resize). */
  rebakeAll(count, positions, shapeType, radius, rgb) {
    this.bakedCount = 0;
    this.sCtx.clearRect(0, 0, this.W, this.H);
    this.bakeUpTo(count, positions, shapeType, radius, rgb);
  }
  /** Clear the dynamic canvas for a new frame. */
  clearDynamic() {
    this.dCtx.clearRect(0, 0, this.W, this.H);
  }
  /**
   * Draw arrival animations on the dynamic canvas.
   * Returns indices of completed arrivals (ready to bake).
   */
  drawArrivals(now, positions, arrivals, shapeType, radius, rgb) {
    const done = [];
    for (let i = 0; i < arrivals.length; i++) {
      const a = arrivals[i];
      const t = Math.min(1, (now - a.startTime) / ARRIVAL_DURATION_MS);
      const scale = easeOutCubic(t);
      const pos = positions[a.posIndex];
      drawShape(
        this.dCtx,
        pos.x,
        pos.y,
        pos.theta,
        radius * scale * 2.5,
        shapeType,
        rgb,
        0.06 * scale
      );
      drawShape(
        this.dCtx,
        pos.x,
        pos.y,
        pos.theta,
        radius * scale,
        shapeType,
        rgb,
        0.85
      );
      if (t >= 1) done.push(i);
    }
    return done;
  }
  /** Draw a ghost preview of all particles (idle state). */
  drawGhostSpiral(positions, shapeType, radius, rgb) {
    const N = positions.length;
    if (shapeType === "circle") {
      batchDrawCircles(
        this.dCtx,
        this.posXs,
        this.posYs,
        0,
        N,
        radius,
        rgb,
        0,
        0,
        // no glow for ghost
        0.03
        // barely visible
      );
    } else {
      for (let i = 0; i < N; i++) {
        const pos = positions[i];
        drawShape(this.dCtx, pos.x, pos.y, pos.theta, radius, shapeType, rgb, 0.03);
      }
    }
  }
  /** Draw the background (true black + theme tint). */
  drawBackground(rgb) {
    this.sCtx.fillStyle = "#000000";
    this.sCtx.fillRect(0, 0, this.W, this.H);
    this.sCtx.fillStyle = `rgb(${Math.round(rgb[0] * 0.02)},${Math.round(rgb[1] * 0.02)},${Math.round(rgb[2] * 0.02)})`;
    this.sCtx.fillRect(0, 0, this.W, this.H);
  }
  /** Draw a progress bar at the top edge. */
  drawProgressBar(progress, rgb) {
    if (progress <= 0) return;
    const barH = 2;
    this.dCtx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.4)`;
    this.dCtx.fillRect(0, 0, this.W * Math.min(1, progress), barH);
  }
};

// src/engine/vogel-engine.ts
var GOLDEN_ANGLE = 2.3999632297286535;
function computeNOffset(N, dashboardOn) {
  if (!dashboardOn) return 0;
  const targetRatio = 0.2;
  const rSq = targetRatio * targetRatio;
  const ideal = Math.round(rSq * N / (1 - rSq));
  return Math.max(10, Math.min(200, ideal));
}
function computeScaling(N, nOffset, canvasW, canvasH) {
  const margin = Math.min(canvasW, canvasH) * 0.03;
  const rMax = Math.min(canvasW, canvasH) / 2 - margin;
  const c = rMax / Math.sqrt(N + nOffset);
  const voidRadius = c * Math.sqrt(nOffset);
  const particleRadius = computeParticleRadius(c, N, nOffset);
  return {
    totalParticles: N,
    nOffset,
    c,
    particleRadius,
    rMax,
    voidRadius
  };
}
function computeParticleRadius(c, _N, _nOffset) {
  return Math.max(0.5, Math.min(8, c * 0.4));
}
function spiralIndex(fillIndex, N, nOffset, direction) {
  return direction === "in-out" ? nOffset + fillIndex : nOffset + (N - 1 - fillIndex);
}
function precomputeSpiral(N, nOffset, c, cx, cy, direction) {
  const positions = new Array(N);
  for (let i = 0; i < N; i++) {
    const n = spiralIndex(i, N, nOffset, direction);
    const theta = n * GOLDEN_ANGLE;
    const r = c * Math.sqrt(n);
    positions[i] = {
      x: cx + r * Math.cos(theta),
      y: cy + r * Math.sin(theta),
      theta,
      r
    };
  }
  return positions;
}

// src/engine/seven-seg.ts
var DIGIT_SEGMENTS = [
  [true, true, true, true, true, true, false],
  // 0
  [false, true, true, false, false, false, false],
  // 1
  [true, true, false, true, true, false, true],
  // 2
  [true, true, true, true, false, false, true],
  // 3
  [false, true, true, false, false, true, true],
  // 4
  [true, false, true, true, false, true, true],
  // 5
  [true, false, true, true, true, true, true],
  // 6
  [true, true, true, false, false, false, false],
  // 7
  [true, true, true, true, true, true, true],
  // 8
  [true, true, true, true, false, true, true]
  // 9
];
function getSegmentRect(dx, dy, digitW, digitH, segIndex, thickness, gap) {
  const halfH = digitH / 2;
  const ht = thickness / 2;
  switch (segIndex) {
    case 0:
      return { x: dx + gap, y: dy, w: digitW - gap * 2, h: thickness };
    case 1:
      return { x: dx + digitW - thickness, y: dy + gap, w: thickness, h: halfH - gap * 2 };
    case 2:
      return { x: dx + digitW - thickness, y: dy + halfH + gap, w: thickness, h: halfH - gap * 2 };
    case 3:
      return { x: dx + gap, y: dy + digitH - thickness, w: digitW - gap * 2, h: thickness };
    case 4:
      return { x: dx, y: dy + halfH + gap, w: thickness, h: halfH - gap * 2 };
    case 5:
      return { x: dx, y: dy + gap, w: thickness, h: halfH - gap * 2 };
    case 6:
      return { x: dx + gap, y: dy + halfH - ht, w: digitW - gap * 2, h: thickness };
    default:
      return { x: 0, y: 0, w: 0, h: 0 };
  }
}
function drawSegment(ctx, rect, isOn, rgb, glowIntensity) {
  if (isOn) {
    const color = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.shadowColor = color;
    ctx.shadowBlur = rect.h > rect.w ? Math.max(4, rect.w * 2) * glowIntensity : Math.max(4, rect.h * 2) * glowIntensity;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.03)`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
}
function drawDigit(ctx, dx, dy, digitW, digitH, digit, rgb, glowIntensity, thickness, gap) {
  const segments = DIGIT_SEGMENTS[digit] || DIGIT_SEGMENTS[0];
  for (let s = 0; s < 7; s++) {
    const rect = getSegmentRect(dx, dy, digitW, digitH, s, thickness, gap);
    drawSegment(ctx, rect, segments[s], rgb, glowIntensity);
  }
}
function drawColon(ctx, x, cy, dotSize, digitH, rgb, glowIntensity) {
  const topY = cy - digitH * 0.2;
  const botY = cy + digitH * 0.2;
  const color = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(3, dotSize * 2) * glowIntensity;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.7;
  for (const dy of [topY, botY]) {
    ctx.beginPath();
    ctx.arc(x, dy, dotSize, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}
function drawClock(ctx, remainingMs2, cx, cy, voidRadius, _shapeType, rgb, glowIntensity) {
  const totalSec = Math.max(0, remainingMs2 / 1e3);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor(totalSec % 3600 / 60);
  const ss = Math.floor(totalSec % 60);
  const cs = Math.floor(totalSec % 1 * 100);
  let groups;
  if (totalSec >= 3600) {
    groups = [
      [Math.floor(hh / 10), hh % 10],
      [Math.floor(mm / 10), mm % 10],
      [Math.floor(ss / 10), ss % 10]
    ];
  } else {
    groups = [
      [Math.floor(mm / 10), mm % 10],
      [Math.floor(ss / 10), ss % 10],
      [Math.floor(cs / 10), cs % 10]
    ];
  }
  const totalWidth = voidRadius * 2 * 0.8;
  const numGroups = groups.length;
  const pairK = 2.2;
  const gapK = 0.8;
  const digitW = totalWidth / (numGroups * pairK + (numGroups - 1) * gapK);
  const digitH = digitW * 1.8;
  const pairGap = digitW * 0.2;
  const groupGap = digitW * 0.8;
  const thickness = Math.max(1.5, digitW * 0.14);
  const segGap = Math.max(0.5, thickness * 0.4);
  const squeeze = 0.82;
  const renderW = digitW * squeeze;
  const slotPad = (digitW - renderW) / 2;
  const pairW = digitW * 2 + pairGap;
  const fullW = pairW * numGroups + groupGap * (numGroups - 1);
  const startX = cx - fullW / 2;
  const startY = cy - digitH / 2;
  let dx = startX;
  const dotSize = Math.max(1.2, thickness * 0.6);
  for (let g = 0; g < numGroups; g++) {
    const [d1, d2] = groups[g];
    drawDigit(ctx, dx + slotPad, startY, renderW, digitH, d1, rgb, glowIntensity, thickness, segGap);
    dx += digitW + pairGap;
    drawDigit(ctx, dx + slotPad, startY, renderW, digitH, d2, rgb, glowIntensity, thickness, segGap);
    dx += digitW;
    if (g < numGroups - 1) {
      const colonX = dx + groupGap / 2;
      drawColon(ctx, colonX, cy, dotSize, digitH, rgb, glowIntensity);
      dx += groupGap;
    }
  }
}

// src/engine/renderer.ts
var CLOCK_THEMES = [
  { name: "Seed", segmentRGB: [200, 168, 64], grainRGB: [210, 185, 90], glowIntensity: 1.1 },
  { name: "Nixie", segmentRGB: [255, 147, 41], grainRGB: [255, 180, 100], glowIntensity: 1.2 },
  { name: "System", segmentRGB: [0, 255, 65], grainRGB: [120, 255, 140], glowIntensity: 0.8 },
  { name: "Studio", segmentRGB: [220, 220, 230], grainRGB: [230, 230, 240], glowIntensity: 1 },
  { name: "Cyber", segmentRGB: [0, 150, 255], grainRGB: [80, 180, 255], glowIntensity: 1 }
];
function getThemeByName(name) {
  const lower = name.toLowerCase();
  return CLOCK_THEMES.find((t) => t.name.toLowerCase() === lower) || CLOCK_THEMES[0];
}
var FLASH_CYCLE_MS = 800;
var FLASH_CYCLES = 5;
var Renderer = class {
  constructor(container) {
    this.theme = CLOCK_THEMES[0];
    this.shapeType = "circle";
    this.direction = "in-out";
    this.dashboardOn = true;
    this.positions = [];
    this.totalDurationMs = 0;
    // Arrival queue
    this.arrivals = [];
    this.placedCount = 0;
    // Completion
    this.completion = null;
    // Resize debounce
    this.resizeTimer = null;
    this.sr = new SpiralRenderer(container);
  }
  // ── Configuration ──
  configure(opts) {
    this.theme = opts.theme;
    this.shapeType = opts.shapeType;
    this.direction = opts.direction;
    this.dashboardOn = opts.dashboardOn;
    this.totalDurationMs = opts.duration * 1e3;
    const N = Math.ceil(opts.duration / opts.resolution);
    const nOffset = computeNOffset(N, opts.dashboardOn);
    this.sr.resize();
    const W = this.sr.width;
    const H = this.sr.height;
    this.config = computeScaling(N, nOffset, W, H);
    this.positions = precomputeSpiral(
      N,
      nOffset,
      this.config.c,
      W / 2,
      H / 2,
      this.direction
    );
    this.sr.setPositions(this.positions);
    this.placedCount = 0;
    this.arrivals = [];
    this.completion = null;
    this.sr.resetBaked();
    this.sr.drawBackground(this.theme.grainRGB);
  }
  /** Handle window resize with debounce. */
  handleResize(duration, resolution) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (const cvs of [this.sr.staticCanvas, this.sr.dynamicCanvas]) {
      cvs.style.width = `${W}px`;
      cvs.style.height = `${H}px`;
    }
    if (this.resizeTimer !== null) clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      this.sr.resize();
      const newW = this.sr.width;
      const newH = this.sr.height;
      const N = this.config.totalParticles;
      this.config = computeScaling(N, this.config.nOffset, newW, newH);
      this.positions = precomputeSpiral(
        N,
        this.config.nOffset,
        this.config.c,
        newW / 2,
        newH / 2,
        this.direction
      );
      this.sr.setPositions(this.positions);
      this.sr.drawBackground(this.theme.grainRGB);
      this.sr.rebakeAll(
        this.placedCount,
        this.positions,
        this.shapeType,
        this.config.particleRadius,
        this.theme.grainRGB
      );
    }, 150);
  }
  // ── Frame rendering ──
  /** Main frame call during 'running' state. */
  drawFrame(now, elapsedMs2, remainingMs2) {
    const N = this.config.totalParticles;
    const msPerParticle = this.totalDurationMs / N;
    const expectedCount = Math.min(N, Math.floor(elapsedMs2 / msPerParticle));
    if (expectedCount > this.placedCount + this.arrivals.length) {
      const newFrom = this.placedCount + this.arrivals.length;
      for (let i = newFrom; i < expectedCount; i++) {
        this.arrivals.push({ posIndex: i, startTime: now });
      }
    }
    this.sr.clearDynamic();
    const doneIndices = this.sr.drawArrivals(
      now,
      this.positions,
      this.arrivals,
      this.shapeType,
      this.config.particleRadius,
      this.theme.grainRGB
    );
    if (doneIndices.length > 0) {
      for (let i = doneIndices.length - 1; i >= 0; i--) {
        this.arrivals.splice(doneIndices[i], 1);
      }
      this.sr.bakeUpTo(
        expectedCount - this.arrivals.length,
        this.positions,
        this.shapeType,
        this.config.particleRadius,
        this.theme.grainRGB
      );
      this.placedCount = expectedCount - this.arrivals.length;
    }
    const progress = this.totalDurationMs > 0 ? elapsedMs2 / this.totalDurationMs : 0;
    this.sr.drawProgressBar(progress, this.theme.grainRGB);
    if (this.dashboardOn) {
      this.drawDashboard(remainingMs2);
    }
  }
  /** Draw idle state (ghost spiral preview + dashboard). */
  drawIdle() {
    this.sr.clearDynamic();
    this.sr.drawGhostSpiral(
      this.positions,
      this.shapeType,
      this.config.particleRadius,
      this.theme.grainRGB
    );
    if (this.dashboardOn) {
      this.drawDashboard(this.totalDurationMs);
    }
  }
  /** Draw paused state (progress bar + dashboard). */
  drawPaused(elapsedMs2) {
    this.sr.clearDynamic();
    const progress = this.totalDurationMs > 0 ? elapsedMs2 / this.totalDurationMs : 0;
    this.sr.drawProgressBar(progress, this.theme.grainRGB);
    const remainingMs2 = Math.max(0, this.totalDurationMs - elapsedMs2);
    if (this.dashboardOn) {
      this.drawDashboard(remainingMs2);
    }
  }
  /** Draw the 7-segment dashboard in the core void. */
  drawDashboard(remainingMs2) {
    const dCtx = this.sr.dynamicCtx;
    const W = this.sr.width;
    const H = this.sr.height;
    drawClock(
      dCtx,
      remainingMs2,
      W / 2,
      H / 2,
      this.config.voidRadius,
      this.shapeType,
      this.theme.segmentRGB,
      this.theme.glowIntensity
    );
  }
  // ── Completion sequence ──
  startCompletion() {
    this.flushArrivals();
    this.completion = {
      phase: "flash",
      startMs: performance.now()
    };
  }
  /**
   * Draw completion animation.
   * Returns 'animating' during flash, 'hold' when dots should stay lit.
   */
  drawCompletion(now) {
    if (!this.completion) return "hold";
    this.sr.clearDynamic();
    if (this.completion.phase === "flash") {
      const elapsed = now - this.completion.startMs;
      if (elapsed < FLASH_CYCLE_MS * FLASH_CYCLES) {
        const cycle = elapsed / FLASH_CYCLE_MS % 1;
        const pulse = 0.25 + 0.75 * (0.5 + 0.5 * Math.cos(cycle * Math.PI * 2));
        this.sr.staticCanvas.style.opacity = String(pulse);
      } else {
        this.sr.staticCanvas.style.opacity = "1";
        this.completion.phase = "hold";
      }
    }
    if (this.completion.phase === "hold") {
      return "hold";
    }
    return "animating";
  }
  /** Clear completion state and reset visuals. */
  clearCompletion() {
    if (this.completion) {
      this.sr.staticCanvas.style.opacity = "1";
      this.completion = null;
    }
    this.sr.resetBaked();
    this.placedCount = 0;
  }
  /** Instantly bake all pending arrivals (for tab restore / completion). */
  flushArrivals() {
    if (this.arrivals.length === 0) return;
    const maxIdx = Math.max(...this.arrivals.map((a) => a.posIndex)) + 1;
    this.sr.bakeUpTo(
      maxIdx,
      this.positions,
      this.shapeType,
      this.config.particleRadius,
      this.theme.grainRGB
    );
    this.placedCount = maxIdx;
    this.arrivals = [];
  }
  /** Instant-snap all particles up to given elapsed (tab restore). */
  instantSnap(elapsedMs2) {
    const N = this.config.totalParticles;
    const msPerParticle = this.totalDurationMs / N;
    const expectedCount = Math.min(N, Math.floor(elapsedMs2 / msPerParticle));
    this.arrivals = [];
    this.sr.bakeUpTo(
      expectedCount,
      this.positions,
      this.shapeType,
      this.config.particleRadius,
      this.theme.grainRGB
    );
    this.placedCount = expectedCount;
  }
  // ── Getters ──
  get spiralConfig() {
    return this.config;
  }
  get currentTheme() {
    return this.theme;
  }
};

// src/engine/timer-bridge.ts
var TimerBridge = class {
  constructor() {
    this.onTick = null;
    this.onDone = null;
    this.worker = new Worker("dist/timer-worker.js");
    this.worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "TICK") {
        this.onTick?.(msg.remainingMs, msg.elapsedMs);
      } else if (msg.type === "DONE") {
        this.onDone?.();
      }
    };
  }
  start(totalMs) {
    this.worker.postMessage({
      type: "START",
      totalMs,
      startAbsMs: performance.now()
    });
  }
  addTime(addMs) {
    this.worker.postMessage({ type: "ADD_TIME", addMs });
  }
  pause() {
    this.worker.postMessage({ type: "PAUSE" });
  }
  resume() {
    this.worker.postMessage({
      type: "RESUME",
      resumeAbsMs: performance.now()
    });
  }
  reset() {
    this.worker.postMessage({ type: "RESET" });
  }
};

// src/components/console.ts
var CSS = `
/* \u2500\u2500 On-screen controls \u2500\u2500 */
.vt-controls {
  position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 12px; z-index: 100;
  transition: opacity 0.3s ease;
}
.vt-controls.hidden { opacity: 0; pointer-events: none; }
.vt-btn {
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255,255,255,0.04);
  border: 1.5px solid rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.7); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, border-color 0.15s;
}
.vt-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.25); }
.vt-btn svg { width: 16px; height: 16px; fill: currentColor; }

/* \u2500\u2500 Overlay \u2500\u2500 */
.vt-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: transparent; display: none;
}
.vt-overlay.open { display: block; }

/* \u2500\u2500 Drawer \u2500\u2500 */
.vt-drawer {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: 300px; max-width: 82vw; z-index: 201;
  background: rgba(8,8,12,0.72);
  border-left: 1px solid rgba(255,255,255,0.05);
  backdrop-filter: blur(32px) saturate(1.4);
  -webkit-backdrop-filter: blur(32px) saturate(1.4);
  transform: translateX(100%);
  transition: transform 0.35s cubic-bezier(0.4,0,0.2,1);
  overflow-y: auto; overflow-x: hidden;
  padding: 24px 20px 40px;
}
.vt-drawer.open { transform: translateX(0); }

/* \u2500\u2500 Sections \u2500\u2500 */
.vt-section { margin-bottom: 32px; }
.vt-section-title {
  font-size: 10px; font-weight: 700; letter-spacing: 2px;
  color: rgba(255,255,255,0.22); text-transform: uppercase;
  margin-bottom: 16px;
}
.vt-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.vt-label {
  font-size: 11px; color: rgba(255,255,255,0.50);
  min-width: 60px; flex-shrink: 0;
}

/* \u2500\u2500 Slider \u2500\u2500 */
.vt-slider {
  -webkit-appearance: none; appearance: none;
  flex: 1; height: 2px; background: rgba(255,255,255,0.08);
  border-radius: 1px; outline: none;
}
.vt-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 12px; height: 12px;
  border-radius: 50%; background: rgba(255,255,255,0.40);
  cursor: pointer; transition: background 0.15s;
}
.vt-slider::-webkit-slider-thumb:hover { background: rgba(255,255,255,0.65); }
.vt-value {
  font-size: 11px; color: rgba(255,255,255,0.65);
  min-width: 44px; text-align: right; font-variant-numeric: tabular-nums;
}

/* \u2500\u2500 Button strip \u2500\u2500 */
.vt-strip { display: flex; gap: 0; width: 100%; }
.vt-chip {
  flex: 1; padding: 6px 0; text-align: center;
  font-size: 10px; letter-spacing: 0.5px;
  color: rgba(255,255,255,0.35); cursor: pointer;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.05);
  transition: all 0.15s;
}
.vt-chip:first-child { border-radius: 4px 0 0 4px; }
.vt-chip:last-child  { border-radius: 0 4px 4px 0; }
.vt-chip.active {
  color: rgba(255,255,255,0.85);
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.15);
}

/* \u2500\u2500 Theme strip \u2500\u2500 */
.vt-theme-strip { display: flex; gap: 0; width: 100%; }
.vt-theme-chip {
  flex: 1; padding: 8px 0; text-align: center; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: transparent; border: 1px solid rgba(255,255,255,0.03);
  transition: all 0.15s;
}
.vt-theme-chip:first-child { border-radius: 4px 0 0 4px; }
.vt-theme-chip:last-child  { border-radius: 0 4px 4px 0; }
.vt-theme-chip .vt-led {
  width: 4px; height: 4px; border-radius: 50%;
  background: var(--tc); opacity: 0.3; transition: all 0.2s;
}
.vt-theme-chip.active { background: color-mix(in srgb, var(--tc) 6%, transparent); }
.vt-theme-chip.active .vt-led {
  opacity: 1; box-shadow: 0 0 4px var(--tc), 0 0 8px color-mix(in srgb, var(--tc) 50%, transparent);
}
.vt-theme-chip span {
  font-size: 9px; letter-spacing: 0.5px;
  color: rgba(255,255,255,0.30);
}
.vt-theme-chip.active span { color: rgba(255,255,255,0.70); }

/* \u2500\u2500 Toggle \u2500\u2500 */
.vt-toggle {
  position: relative; width: 32px; height: 18px;
  background: rgba(255,255,255,0.08); border-radius: 9px;
  cursor: pointer; transition: background 0.2s;
}
.vt-toggle.on { background: rgba(255,180,100,0.3); }
.vt-toggle::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 14px; height: 14px; border-radius: 50%;
  background: rgba(255,255,255,0.5); transition: transform 0.2s;
}
.vt-toggle.on::after { transform: translateX(14px); background: rgba(255,200,120,0.9); }

/* \u2500\u2500 Preset buttons \u2500\u2500 */
.vt-presets { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; }
.vt-preset {
  padding: 3px 8px; font-size: 9px; letter-spacing: 0.5px;
  color: rgba(255,255,255,0.30); cursor: pointer;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 3px; transition: all 0.15s;
}
.vt-preset:hover { color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.04); }
.vt-preset.active { color: rgba(255,255,255,0.75); border-color: rgba(255,255,255,0.15); }

/* \u2500\u2500 System buttons \u2500\u2500 */
.vt-sys-btn {
  width: 100%; padding: 8px; margin-bottom: 8px;
  font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
  color: rgba(255,255,255,0.35); cursor: pointer;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 4px; transition: all 0.15s;
  font-family: inherit;
}
.vt-sys-btn:hover { color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.04); }
`;
var LED_COLORS = {
  seed: "#C8A840",
  nixie: "#FF8C00",
  system: "#00FF41",
  studio: "#FFFFFF",
  cyber: "#00D1FF"
};
var ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
var ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>';
var ICON_STOP = '<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>';
var ICON_GEAR = '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z"/></svg>';
function formatMmSs(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function createConsole(container, initialDuration, initialResolution, initialDirection, initialShape, initialDashboard, initialTheme) {
  const style = document.createElement("style");
  style.id = "vt-console-style";
  style.textContent = CSS;
  document.head.appendChild(style);
  let isPaused = false;
  let currentDuration = initialDuration;
  let drawerOpen = false;
  const controls = document.createElement("div");
  controls.className = "vt-controls";
  function makeBtn(icon, title) {
    const btn = document.createElement("button");
    btn.className = "vt-btn";
    btn.innerHTML = icon;
    btn.title = title;
    return btn;
  }
  const btnStart = makeBtn(ICON_PLAY, "Start");
  const btnPause = makeBtn(ICON_PAUSE, "Pause");
  const btnStop = makeBtn(ICON_STOP, "Stop");
  const btnSettings = makeBtn(ICON_GEAR, "Settings");
  btnPause.style.display = "none";
  btnStop.style.display = "none";
  controls.append(btnStart, btnPause, btnStop, btnSettings);
  container.appendChild(controls);
  const overlay = document.createElement("div");
  overlay.className = "vt-overlay";
  container.appendChild(overlay);
  const drawer = document.createElement("div");
  drawer.className = "vt-drawer";
  container.appendChild(drawer);
  function toggleDrawer(open) {
    drawerOpen = open ?? !drawerOpen;
    drawer.classList.toggle("open", drawerOpen);
    overlay.classList.toggle("open", drawerOpen);
  }
  btnSettings.addEventListener("click", () => toggleDrawer());
  overlay.addEventListener("click", () => toggleDrawer(false));
  const logoHeader = document.createElement("div");
  logoHeader.style.cssText = "text-align:center; margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid rgba(255,255,255,0.06);";
  logoHeader.innerHTML = `<img src="logo.svg" alt="VOGEL-TIMER" style="width:220px; height:auto; opacity:0.85;">`;
  drawer.appendChild(logoHeader);
  const timerSection = document.createElement("div");
  timerSection.className = "vt-section";
  timerSection.innerHTML = '<div class="vt-section-title">TIMER</div>';
  const durRow = document.createElement("div");
  durRow.className = "vt-row";
  const durLabel = document.createElement("span");
  durLabel.className = "vt-label";
  durLabel.textContent = "Duration";
  const durSlider = document.createElement("input");
  durSlider.type = "range";
  durSlider.className = "vt-slider";
  durSlider.min = "10";
  durSlider.max = "7200";
  durSlider.step = "10";
  durSlider.value = String(currentDuration);
  const durValue = document.createElement("span");
  durValue.className = "vt-value";
  durValue.textContent = formatMmSs(currentDuration);
  durRow.append(durLabel, durSlider, durValue);
  timerSection.appendChild(durRow);
  durSlider.addEventListener("input", () => {
    currentDuration = parseInt(durSlider.value);
    durValue.textContent = formatMmSs(currentDuration);
    ctrl.onDurationChange?.(currentDuration);
  });
  const durPresets = document.createElement("div");
  durPresets.className = "vt-presets";
  for (const [label, sec] of [["1m", 60], ["3m", 180], ["5m", 300], ["10m", 600], ["30m", 1800], ["60m", 3600]]) {
    const btn = document.createElement("button");
    btn.className = "vt-preset";
    btn.textContent = label;
    if (sec === currentDuration) btn.classList.add("active");
    btn.addEventListener("click", () => {
      currentDuration = sec;
      durSlider.value = String(sec);
      durValue.textContent = formatMmSs(sec);
      durPresets.querySelectorAll(".vt-preset").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      ctrl.onDurationChange?.(sec);
    });
    durPresets.appendChild(btn);
  }
  timerSection.appendChild(durPresets);
  const resRow = document.createElement("div");
  resRow.className = "vt-row";
  resRow.style.marginTop = "16px";
  const resLabel = document.createElement("span");
  resLabel.className = "vt-label";
  resLabel.textContent = "Resolution";
  const resStrip = document.createElement("div");
  resStrip.className = "vt-strip";
  resStrip.style.flex = "1";
  const resOptions = [0.1, 0.25, 0.5, 1];
  for (const res of resOptions) {
    const chip = document.createElement("div");
    chip.className = "vt-chip";
    chip.textContent = `${res}s`;
    if (res === initialResolution) chip.classList.add("active");
    chip.addEventListener("click", () => {
      resStrip.querySelectorAll(".vt-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      ctrl.onResolutionChange?.(res);
    });
    resStrip.appendChild(chip);
  }
  resRow.append(resLabel, resStrip);
  timerSection.appendChild(resRow);
  const dirRow = document.createElement("div");
  dirRow.className = "vt-row";
  dirRow.style.marginTop = "12px";
  const dirLabel = document.createElement("span");
  dirLabel.className = "vt-label";
  dirLabel.textContent = "Direction";
  const dirStrip = document.createElement("div");
  dirStrip.className = "vt-strip";
  dirStrip.style.flex = "1";
  for (const [label, dir] of [["In \u2192 Out", "in-out"], ["Out \u2192 In", "out-in"]]) {
    const chip = document.createElement("div");
    chip.className = "vt-chip";
    chip.textContent = label;
    if (dir === initialDirection) chip.classList.add("active");
    chip.addEventListener("click", () => {
      dirStrip.querySelectorAll(".vt-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      ctrl.onDirectionChange?.(dir);
    });
    dirStrip.appendChild(chip);
  }
  dirRow.append(dirLabel, dirStrip);
  timerSection.appendChild(dirRow);
  const dashRow = document.createElement("div");
  dashRow.className = "vt-row";
  dashRow.style.marginTop = "12px";
  const dashLabel = document.createElement("span");
  dashLabel.className = "vt-label";
  dashLabel.textContent = "Dashboard";
  const dashToggle = document.createElement("div");
  dashToggle.className = "vt-toggle" + (initialDashboard ? " on" : "");
  dashRow.append(dashLabel, dashToggle);
  timerSection.appendChild(dashRow);
  dashToggle.addEventListener("click", () => {
    dashToggle.classList.toggle("on");
    ctrl.onDashboardToggle?.(dashToggle.classList.contains("on"));
  });
  drawer.appendChild(timerSection);
  const shapeSection = document.createElement("div");
  shapeSection.className = "vt-section";
  shapeSection.innerHTML = '<div class="vt-section-title">SHAPE</div>';
  const shapeStrip = document.createElement("div");
  shapeStrip.className = "vt-strip";
  for (const [label, shape] of [["Circle", "circle"], ["Square", "square"], ["Triangle", "triangle"], ["Pentagon", "pentagon"]]) {
    const chip = document.createElement("div");
    chip.className = "vt-chip";
    chip.textContent = label;
    if (shape === initialShape) chip.classList.add("active");
    chip.addEventListener("click", () => {
      shapeStrip.querySelectorAll(".vt-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      ctrl.onShapeChange?.(shape);
    });
    shapeStrip.appendChild(chip);
  }
  shapeSection.appendChild(shapeStrip);
  drawer.appendChild(shapeSection);
  const themeSection = document.createElement("div");
  themeSection.className = "vt-section";
  themeSection.innerHTML = '<div class="vt-section-title">THEME</div>';
  const themeStrip = document.createElement("div");
  themeStrip.className = "vt-theme-strip";
  const themeNames = ["seed", "nixie", "system", "studio", "cyber"];
  for (const name of themeNames) {
    const chip = document.createElement("div");
    chip.className = "vt-theme-chip";
    chip.style.setProperty("--tc", LED_COLORS[name]);
    if (name === initialTheme.toLowerCase()) chip.classList.add("active");
    const led = document.createElement("div");
    led.className = "vt-led";
    const label = document.createElement("span");
    label.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    chip.append(led, label);
    chip.addEventListener("click", () => {
      themeStrip.querySelectorAll(".vt-theme-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      ctrl.onThemeChange?.(name);
    });
    themeStrip.appendChild(chip);
  }
  themeSection.appendChild(themeStrip);
  drawer.appendChild(themeSection);
  const sysSection = document.createElement("div");
  sysSection.className = "vt-section";
  sysSection.innerHTML = '<div class="vt-section-title">SYSTEM</div>';
  const shareBtn = document.createElement("button");
  shareBtn.className = "vt-sys-btn";
  shareBtn.textContent = "Share URL";
  shareBtn.addEventListener("click", () => {
    ctrl.onShareURL?.();
    shareBtn.textContent = "Copied!";
    setTimeout(() => {
      shareBtn.textContent = "Share URL";
    }, 1500);
  });
  sysSection.appendChild(shareBtn);
  const resetBtn = document.createElement("button");
  resetBtn.className = "vt-sys-btn";
  resetBtn.textContent = "Reset to Default";
  resetBtn.addEventListener("click", () => ctrl.onResetDefaults?.());
  sysSection.appendChild(resetBtn);
  drawer.appendChild(sysSection);
  btnStart.addEventListener("click", () => {
    if (isPaused) {
      ctrl.onStart?.();
    } else {
      ctrl.onStart?.();
    }
  });
  btnPause.addEventListener("click", () => ctrl.onPause?.());
  btnStop.addEventListener("click", () => ctrl.onStop?.());
  let hideTimer = null;
  function showControls() {
    controls.classList.remove("hidden");
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (!drawerOpen) controls.classList.add("hidden");
    }, 5e3);
  }
  window.addEventListener("mousemove", showControls);
  window.addEventListener("touchstart", showControls);
  showControls();
  const ctrl = {
    show: showControls,
    hide: () => controls.classList.add("hidden"),
    setTime(_remainingMs) {
    },
    setStatus(status) {
      switch (status) {
        case "ready":
        case "idle":
          btnStart.style.display = "";
          btnPause.style.display = "none";
          btnStop.style.display = "none";
          isPaused = false;
          break;
        case "running":
          btnStart.style.display = "none";
          btnPause.style.display = "";
          btnStop.style.display = "";
          isPaused = false;
          break;
        case "paused":
          btnStart.style.display = "";
          btnPause.style.display = "none";
          btnStop.style.display = "";
          isPaused = true;
          break;
      }
    },
    setPaused(paused) {
      isPaused = paused;
      btnStart.style.display = paused ? "" : "none";
      btnPause.style.display = paused ? "none" : "";
    },
    setThemeName(name) {
      const lower = name.toLowerCase();
      themeStrip.querySelectorAll(".vt-theme-chip").forEach((c) => {
        const label = c.querySelector("span")?.textContent?.toLowerCase();
        c.classList.toggle("active", label === lower);
      });
    },
    setAccentColor(rgb) {
      const color = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      dashToggle.style.setProperty("--accent", color);
    },
    setConfigEnabled(enabled) {
      const inputs = drawer.querySelectorAll("input, .vt-chip, .vt-preset, .vt-toggle, .vt-theme-chip");
      inputs.forEach((el) => {
        if (enabled) {
          el.style.pointerEvents = "";
          el.style.opacity = "";
        } else {
          el.style.pointerEvents = "none";
          el.style.opacity = "0.4";
        }
      });
    },
    // Callbacks (set externally)
    onDurationChange: null,
    onResolutionChange: null,
    onDirectionChange: null,
    onShapeChange: null,
    onDashboardToggle: null,
    onThemeChange: null,
    onStart: null,
    onPause: null,
    onStop: null,
    onResetDefaults: null,
    onShareURL: null
  };
  return ctrl;
}

// src/utils/url-params.ts
var DEFAULTS = {
  t: 300,
  res: 0.5,
  dir: "in-out",
  shape: "circle",
  dash: true,
  theme: "seed",
  s: 0
};
var STORAGE_KEY = "vogel-timer-settings";
function readParams() {
  const url = new URLSearchParams(window.location.search);
  const stored = loadStorage();
  return {
    t: num(url.get("t")) ?? stored.t ?? DEFAULTS.t,
    res: num(url.get("res")) ?? stored.res ?? DEFAULTS.res,
    dir: url.get("dir") ?? stored.dir ?? DEFAULTS.dir,
    shape: validShape(url.get("shape")) ?? validShape(stored.shape) ?? DEFAULTS.shape,
    dash: bool(url.get("dash")) ?? stored.dash ?? DEFAULTS.dash,
    theme: url.get("theme") ?? stored.theme ?? DEFAULTS.theme,
    s: num(url.get("s")) ?? stored.s ?? DEFAULTS.s
  };
}
function writeParams(params2) {
  const url = new URLSearchParams();
  url.set("t", String(params2.t));
  url.set("res", String(params2.res));
  url.set("dir", params2.dir);
  url.set("shape", params2.shape);
  url.set("dash", params2.dash ? "1" : "0");
  url.set("theme", params2.theme);
  if (params2.s) url.set("s", String(params2.s));
  const newUrl = `${window.location.pathname}?${url.toString()}`;
  window.history.replaceState(null, "", newUrl);
  saveStorage(params2);
}
function getShareURL(params2) {
  const url = new URL(window.location.href);
  url.searchParams.set("t", String(params2.t));
  url.searchParams.set("res", String(params2.res));
  url.searchParams.set("dir", params2.dir);
  url.searchParams.set("shape", params2.shape);
  url.searchParams.set("dash", params2.dash ? "1" : "0");
  url.searchParams.set("theme", params2.theme);
  if (params2.s) url.searchParams.set("s", String(params2.s));
  return url.toString();
}
function getDefaults() {
  return { ...DEFAULTS };
}
function num(val) {
  if (val === null) return void 0;
  const n = parseFloat(val);
  return isNaN(n) ? void 0 : n;
}
var VALID_SHAPES = /* @__PURE__ */ new Set(["circle", "square", "triangle", "pentagon"]);
function validShape(val) {
  if (!val) return void 0;
  return VALID_SHAPES.has(val) ? val : void 0;
}
function bool(val) {
  if (val === null) return void 0;
  return val === "1" || val === "true";
}
function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveStorage(params2) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params2));
  } catch {
  }
}

// src/main.ts
var params = readParams();
var CONFIG = {
  duration: params.t,
  resolution: params.res,
  direction: params.dir,
  shapeType: params.shape,
  dashboardOn: params.dash,
  theme: getThemeByName(params.theme)
};
var app = document.getElementById("app");
var renderer = new Renderer(app);
var timerBridge = new TimerBridge();
var consoleCtrl = createConsole(
  app,
  CONFIG.duration,
  CONFIG.resolution,
  CONFIG.direction,
  CONFIG.shapeType,
  CONFIG.dashboardOn,
  CONFIG.theme.name
);
var appState = "idle";
var elapsedMs = 0;
var remainingMs = 0;
var rafId = 0;
timerBridge.onTick = (remaining, elapsed) => {
  remainingMs = remaining;
  elapsedMs = elapsed;
};
timerBridge.onDone = () => {
  renderer.instantSnap(CONFIG.duration * 1e3);
  startCompletion();
};
function initRenderer() {
  renderer.configure({
    duration: CONFIG.duration,
    resolution: CONFIG.resolution,
    direction: CONFIG.direction,
    shapeType: CONFIG.shapeType,
    dashboardOn: CONFIG.dashboardOn,
    theme: CONFIG.theme
  });
}
function startTimer() {
  if (appState === "running") return;
  if (appState === "idle" || appState === "completed") {
    initRenderer();
    elapsedMs = 0;
    remainingMs = CONFIG.duration * 1e3;
    timerBridge.start(CONFIG.duration * 1e3);
  } else if (appState === "paused") {
    timerBridge.resume();
  }
  appState = "running";
  consoleCtrl.setStatus("running");
  consoleCtrl.setConfigEnabled(false);
  scheduleFrame();
}
function pauseTimer() {
  if (appState !== "running") return;
  timerBridge.pause();
  appState = "paused";
  consoleCtrl.setStatus("paused");
  cancelAnimationFrame(rafId);
  renderer.drawPaused(elapsedMs);
}
function stopTimer() {
  timerBridge.reset();
  cancelAnimationFrame(rafId);
  if (appState === "completed" || appState === "completion") {
    renderer.clearCompletion();
  }
  appState = "idle";
  consoleCtrl.setStatus("idle");
  consoleCtrl.setConfigEnabled(true);
  elapsedMs = 0;
  remainingMs = 0;
  initRenderer();
  renderer.drawIdle();
}
function resetIfCompleted() {
  if (appState === "completed" || appState === "completion") {
    cancelAnimationFrame(rafId);
    renderer.clearCompletion();
    appState = "idle";
    consoleCtrl.setStatus("idle");
    consoleCtrl.setConfigEnabled(true);
  }
}
function startCompletion() {
  appState = "completion";
  consoleCtrl.setConfigEnabled(false);
  renderer.startCompletion();
  scheduleFrame();
}
function frame(now) {
  if (appState === "running") {
    renderer.drawFrame(now, elapsedMs, remainingMs);
    rafId = requestAnimationFrame(frame);
  } else if (appState === "completion") {
    const result = renderer.drawCompletion(now);
    if (result === "hold") {
      appState = "completed";
      consoleCtrl.setStatus("idle");
      consoleCtrl.setConfigEnabled(true);
    } else {
      rafId = requestAnimationFrame(frame);
    }
  }
}
function scheduleFrame() {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frame);
}
function persistConfig() {
  writeParams({
    t: CONFIG.duration,
    res: CONFIG.resolution,
    dir: CONFIG.direction,
    shape: CONFIG.shapeType,
    dash: CONFIG.dashboardOn,
    theme: CONFIG.theme.name.toLowerCase(),
    s: 0
  });
}
consoleCtrl.onStart = () => startTimer();
consoleCtrl.onPause = () => pauseTimer();
consoleCtrl.onStop = () => stopTimer();
consoleCtrl.onDurationChange = (sec) => {
  CONFIG.duration = sec;
  persistConfig();
  resetIfCompleted();
  if (appState === "idle") {
    initRenderer();
    renderer.drawIdle();
  }
};
consoleCtrl.onResolutionChange = (res) => {
  CONFIG.resolution = res;
  persistConfig();
  resetIfCompleted();
  if (appState === "idle") {
    initRenderer();
    renderer.drawIdle();
  }
};
consoleCtrl.onDirectionChange = (dir) => {
  CONFIG.direction = dir;
  persistConfig();
  resetIfCompleted();
  if (appState === "idle") {
    initRenderer();
    renderer.drawIdle();
  }
};
consoleCtrl.onShapeChange = (shape) => {
  CONFIG.shapeType = shape;
  persistConfig();
  resetIfCompleted();
  if (appState === "idle") {
    initRenderer();
    renderer.drawIdle();
  }
};
consoleCtrl.onDashboardToggle = (on) => {
  CONFIG.dashboardOn = on;
  persistConfig();
  resetIfCompleted();
  if (appState === "idle") {
    initRenderer();
    renderer.drawIdle();
  }
};
consoleCtrl.onThemeChange = (name) => {
  CONFIG.theme = getThemeByName(name);
  consoleCtrl.setAccentColor(CONFIG.theme.grainRGB);
  persistConfig();
  resetIfCompleted();
  if (appState === "idle") {
    initRenderer();
    renderer.drawIdle();
  }
};
consoleCtrl.onShareURL = () => {
  const url = getShareURL({
    t: CONFIG.duration,
    res: CONFIG.resolution,
    dir: CONFIG.direction,
    shape: CONFIG.shapeType,
    dash: CONFIG.dashboardOn,
    theme: CONFIG.theme.name.toLowerCase(),
    s: 0
  });
  navigator.clipboard.writeText(url);
};
consoleCtrl.onResetDefaults = () => {
  const def = getDefaults();
  CONFIG.duration = def.t;
  CONFIG.resolution = def.res;
  CONFIG.direction = def.dir;
  CONFIG.shapeType = def.shape;
  CONFIG.dashboardOn = def.dash;
  CONFIG.theme = getThemeByName(def.theme);
  persistConfig();
  window.location.reload();
};
var resizeTimer = null;
window.addEventListener("resize", () => {
  if (resizeTimer !== null) clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    renderer.handleResize(CONFIG.duration, CONFIG.resolution);
    if (appState === "idle") renderer.drawIdle();
  }, 150);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(rafId);
  } else {
    if (appState === "running") {
      renderer.instantSnap(elapsedMs);
      scheduleFrame();
    }
  }
});
document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (appState === "idle" || appState === "completed") startTimer();
    else if (appState === "running") pauseTimer();
    else if (appState === "paused") startTimer();
  } else if (e.code === "Escape") {
    e.preventDefault();
    stopTimer();
  }
});
consoleCtrl.setAccentColor(CONFIG.theme.grainRGB);
initRenderer();
renderer.drawIdle();
