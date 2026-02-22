/**
 * renderer.ts — Frame orchestrator.
 *
 * Manages theme, spiral config, resize, and delegates
 * all drawing to SpiralRenderer.
 */

import { SpiralRenderer, type ArrivalParticle } from './spiral-renderer';
import {
  computeNOffset,
  computeScaling,
  precomputeSpiral,
  type FillDirection,
  type SpiralConfig,
  type SpiralPosition,
} from './vogel-engine';
import type { ShapeType } from './shape-draw';
import { drawClock } from './seven-seg';

// ── Theme ──

export interface ClockTheme {
  name: string;
  segmentRGB: [number, number, number];
  grainRGB: [number, number, number];
  glowIntensity: number;
}

export const CLOCK_THEMES: ClockTheme[] = [
  { name: 'Seed',   segmentRGB: [200, 168, 64],   grainRGB: [210, 185, 90],  glowIntensity: 1.1 },
  { name: 'Nixie',  segmentRGB: [255, 147, 41],   grainRGB: [255, 180, 100], glowIntensity: 1.2 },
  { name: 'System', segmentRGB: [0, 255, 65],     grainRGB: [120, 255, 140], glowIntensity: 0.8 },
  { name: 'Studio', segmentRGB: [220, 220, 230],  grainRGB: [230, 230, 240], glowIntensity: 1.0 },
  { name: 'Cyber',  segmentRGB: [0, 150, 255],    grainRGB: [80, 180, 255],  glowIntensity: 1.0 },
];

export function getThemeByName(name: string): ClockTheme {
  const lower = name.toLowerCase();
  return CLOCK_THEMES.find(t => t.name.toLowerCase() === lower) || CLOCK_THEMES[0];
}

// ── Completion animation ──

type CompletionPhase = 'flash' | 'hold';

interface CompletionState {
  phase: CompletionPhase;
  startMs: number;
}

const FLASH_CYCLE_MS = 800;
const FLASH_CYCLES = 5;

// ── Renderer ──

export class Renderer {
  private sr: SpiralRenderer;
  private theme: ClockTheme = CLOCK_THEMES[0];
  private shapeType: ShapeType = 'circle';
  private direction: FillDirection = 'in-out';
  private dashboardOn = true;

  // Spiral state
  private config!: SpiralConfig;
  private positions: SpiralPosition[] = [];
  private totalDurationMs = 0;

  // Arrival queue
  private arrivals: ArrivalParticle[] = [];
  private placedCount = 0;

  // Completion
  private completion: CompletionState | null = null;

  // Resize debounce
  private resizeTimer: number | null = null;

  constructor(container: HTMLElement) {
    this.sr = new SpiralRenderer(container);
  }

  // ── Configuration ──

  configure(opts: {
    duration: number;
    resolution: number;
    direction: FillDirection;
    shapeType: ShapeType;
    dashboardOn: boolean;
    theme: ClockTheme;
  }): void {
    this.theme = opts.theme;
    this.shapeType = opts.shapeType;
    this.direction = opts.direction;
    this.dashboardOn = opts.dashboardOn;
    this.totalDurationMs = opts.duration * 1000;

    const N = Math.ceil(opts.duration / opts.resolution);
    const nOffset = computeNOffset(N, opts.dashboardOn);

    this.sr.resize();
    const W = this.sr.width;
    const H = this.sr.height;

    this.config = computeScaling(N, nOffset, W, H);
    this.positions = precomputeSpiral(
      N, nOffset, this.config.c,
      W / 2, H / 2,
      this.direction,
    );
    this.sr.setPositions(this.positions);

    // Reset visual state
    this.placedCount = 0;
    this.arrivals = [];
    this.completion = null;
    this.sr.resetBaked();

    // Draw background on static canvas
    this.sr.drawBackground(this.theme.grainRGB);
  }

  /** Handle window resize with debounce. */
  handleResize(duration: number, resolution: number): void {
    // Immediate: CSS-only resize (stretches existing content)
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (const cvs of [this.sr.staticCanvas, this.sr.dynamicCanvas]) {
      cvs.style.width = `${W}px`;
      cvs.style.height = `${H}px`;
    }

    // Debounced: full recomputation + rebake
    if (this.resizeTimer !== null) clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      this.sr.resize();
      const newW = this.sr.width;
      const newH = this.sr.height;

      const N = this.config.totalParticles;
      this.config = computeScaling(N, this.config.nOffset, newW, newH);
      this.positions = precomputeSpiral(
        N, this.config.nOffset, this.config.c,
        newW / 2, newH / 2,
        this.direction,
      );
      this.sr.setPositions(this.positions);
      this.sr.drawBackground(this.theme.grainRGB);
      this.sr.rebakeAll(
        this.placedCount,
        this.positions,
        this.shapeType,
        this.config.particleRadius,
        this.theme.grainRGB,
      );
    }, 150);
  }

  // ── Frame rendering ──

  /** Main frame call during 'running' state. */
  drawFrame(now: number, elapsedMs: number, remainingMs: number): void {
    const N = this.config.totalParticles;
    const msPerParticle = this.totalDurationMs / N;
    const expectedCount = Math.min(N, Math.floor(elapsedMs / msPerParticle));

    // Queue new arrivals
    if (expectedCount > this.placedCount + this.arrivals.length) {
      const newFrom = this.placedCount + this.arrivals.length;
      for (let i = newFrom; i < expectedCount; i++) {
        this.arrivals.push({ posIndex: i, startTime: now });
      }
    }

    // Clear dynamic
    this.sr.clearDynamic();

    // Draw arrival animations; bake completed ones
    const doneIndices = this.sr.drawArrivals(
      now, this.positions, this.arrivals,
      this.shapeType, this.config.particleRadius, this.theme.grainRGB,
    );

    // Bake completed arrivals to static
    if (doneIndices.length > 0) {
      // Sort descending so splicing doesn't shift indices
      for (let i = doneIndices.length - 1; i >= 0; i--) {
        this.arrivals.splice(doneIndices[i], 1);
      }
      this.sr.bakeUpTo(
        expectedCount - this.arrivals.length,
        this.positions,
        this.shapeType,
        this.config.particleRadius,
        this.theme.grainRGB,
      );
      this.placedCount = expectedCount - this.arrivals.length;
    }

    // Progress bar
    const progress = this.totalDurationMs > 0 ? elapsedMs / this.totalDurationMs : 0;
    this.sr.drawProgressBar(progress, this.theme.grainRGB);

    // Dashboard (7-segment clock)
    if (this.dashboardOn) {
      this.drawDashboard(remainingMs);
    }
  }

  /** Draw idle state (ghost spiral preview + dashboard). */
  drawIdle(): void {
    this.sr.clearDynamic();
    this.sr.drawGhostSpiral(
      this.positions,
      this.shapeType,
      this.config.particleRadius,
      this.theme.grainRGB,
    );
    if (this.dashboardOn) {
      this.drawDashboard(this.totalDurationMs);
    }
  }

  /** Draw paused state (progress bar + dashboard). */
  drawPaused(elapsedMs: number): void {
    this.sr.clearDynamic();
    const progress = this.totalDurationMs > 0 ? elapsedMs / this.totalDurationMs : 0;
    this.sr.drawProgressBar(progress, this.theme.grainRGB);
    const remainingMs = Math.max(0, this.totalDurationMs - elapsedMs);
    if (this.dashboardOn) {
      this.drawDashboard(remainingMs);
    }
  }

  /** Draw the 7-segment dashboard in the core void. */
  private drawDashboard(remainingMs: number): void {
    const dCtx = this.sr.dynamicCtx;
    const W = this.sr.width;
    const H = this.sr.height;
    drawClock(
      dCtx,
      remainingMs,
      W / 2, H / 2,
      this.config.voidRadius,
      this.shapeType,
      this.theme.segmentRGB,
      this.theme.glowIntensity,
    );
  }

  // ── Completion sequence ──

  startCompletion(): void {
    // Bake any remaining arrivals immediately
    this.flushArrivals();

    this.completion = {
      phase: 'flash',
      startMs: performance.now(),
    };
  }

  /**
   * Draw completion animation.
   * Returns 'animating' during flash, 'hold' when dots should stay lit.
   */
  drawCompletion(now: number): 'animating' | 'hold' {
    if (!this.completion) return 'hold';

    this.sr.clearDynamic();

    if (this.completion.phase === 'flash') {
      const elapsed = now - this.completion.startMs;
      if (elapsed < FLASH_CYCLE_MS * FLASH_CYCLES) {
        // Pulse dot opacity via staticCanvas: 1.0 → 0.25 → 1.0
        const cycle = (elapsed / FLASH_CYCLE_MS) % 1;
        const pulse = 0.25 + 0.75 * (0.5 + 0.5 * Math.cos(cycle * Math.PI * 2));
        this.sr.staticCanvas.style.opacity = String(pulse);
      } else {
        // Flash done — restore full opacity, hold
        this.sr.staticCanvas.style.opacity = '1';
        this.completion.phase = 'hold';
      }
    }

    // In 'hold' phase: dots stay lit, no more animation needed
    if (this.completion.phase === 'hold') {
      return 'hold';
    }

    return 'animating';
  }

  /** Clear completion state and reset visuals. */
  clearCompletion(): void {
    if (this.completion) {
      this.sr.staticCanvas.style.opacity = '1';
      this.completion = null;
    }
    this.sr.resetBaked();
    this.placedCount = 0;
  }

  /** Instantly bake all pending arrivals (for tab restore / completion). */
  flushArrivals(): void {
    if (this.arrivals.length === 0) return;
    const maxIdx = Math.max(...this.arrivals.map(a => a.posIndex)) + 1;
    this.sr.bakeUpTo(
      maxIdx,
      this.positions,
      this.shapeType,
      this.config.particleRadius,
      this.theme.grainRGB,
    );
    this.placedCount = maxIdx;
    this.arrivals = [];
  }

  /** Instant-snap all particles up to given elapsed (tab restore). */
  instantSnap(elapsedMs: number): void {
    const N = this.config.totalParticles;
    const msPerParticle = this.totalDurationMs / N;
    const expectedCount = Math.min(N, Math.floor(elapsedMs / msPerParticle));

    this.arrivals = [];
    this.sr.bakeUpTo(
      expectedCount,
      this.positions,
      this.shapeType,
      this.config.particleRadius,
      this.theme.grainRGB,
    );
    this.placedCount = expectedCount;
  }

  // ── Getters ──

  get spiralConfig(): SpiralConfig {
    return this.config;
  }

  get currentTheme(): ClockTheme {
    return this.theme;
  }
}
