/**
 * spiral-renderer.ts — Two-canvas baking system.
 *
 * staticCanvas:  baked (settled) particles — drawn once, never cleared per frame.
 * dynamicCanvas: per-frame overlay — arrival animations, dashboard, effects.
 */

import { drawShape, batchDrawCircles, type ShapeType } from './shape-draw';
import type { SpiralPosition } from './vogel-engine';

// ── Arrival animation ──

export interface ArrivalParticle {
  posIndex: number;
  startTime: number;
}

const ARRIVAL_DURATION_MS = 120;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ── Renderer class ──

export class SpiralRenderer {
  readonly staticCanvas: HTMLCanvasElement;
  readonly dynamicCanvas: HTMLCanvasElement;
  private sCtx: CanvasRenderingContext2D;
  private dCtx: CanvasRenderingContext2D;

  private W = 0;
  private H = 0;
  private dpr = 1;

  // Baking state
  private bakedCount = 0;
  // Flat arrays for batch circle rendering
  private posXs: Float64Array = new Float64Array(0);
  private posYs: Float64Array = new Float64Array(0);

  constructor(container: HTMLElement) {
    this.staticCanvas = document.createElement('canvas');
    this.dynamicCanvas = document.createElement('canvas');

    // Static below dynamic (z-order via DOM order + position: absolute in CSS)
    container.appendChild(this.staticCanvas);
    container.appendChild(this.dynamicCanvas);

    this.sCtx = this.staticCanvas.getContext('2d')!;
    this.dCtx = this.dynamicCanvas.getContext('2d')!;
  }

  get dynamicCtx(): CanvasRenderingContext2D {
    return this.dCtx;
  }

  get width(): number {
    return this.W;
  }

  get height(): number {
    return this.H;
  }

  /** Resize both canvases to match the viewport. */
  resize(): void {
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
  setPositions(positions: SpiralPosition[]): void {
    const N = positions.length;
    this.posXs = new Float64Array(N);
    this.posYs = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      this.posXs[i] = positions[i].x;
      this.posYs[i] = positions[i].y;
    }
  }

  /** Reset baked count (on restart or config change). */
  resetBaked(): void {
    this.bakedCount = 0;
    this.sCtx.clearRect(0, 0, this.W, this.H);
  }

  /** Bake all particles up to `count` onto the static canvas. */
  bakeUpTo(
    count: number,
    positions: SpiralPosition[],
    shapeType: ShapeType,
    radius: number,
    rgb: [number, number, number],
  ): void {
    if (count <= this.bakedCount) return;

    const from = this.bakedCount;
    const to = count;

    if (shapeType === 'circle') {
      batchDrawCircles(
        this.sCtx, this.posXs, this.posYs,
        from, to,
        radius, rgb,
        radius * 2.5, 0.06,
        0.85,
      );
    } else {
      for (let i = from; i < to; i++) {
        const pos = positions[i];
        // Glow
        drawShape(this.sCtx, pos.x, pos.y, pos.theta, radius * 2.5, shapeType, rgb, 0.06);
        // Core
        drawShape(this.sCtx, pos.x, pos.y, pos.theta, radius, shapeType, rgb, 0.85);
      }
    }

    this.bakedCount = to;
  }

  /** Re-bake all placed particles (after resize). */
  rebakeAll(
    count: number,
    positions: SpiralPosition[],
    shapeType: ShapeType,
    radius: number,
    rgb: [number, number, number],
  ): void {
    this.bakedCount = 0;
    this.sCtx.clearRect(0, 0, this.W, this.H);
    this.bakeUpTo(count, positions, shapeType, radius, rgb);
  }

  /** Clear the dynamic canvas for a new frame. */
  clearDynamic(): void {
    this.dCtx.clearRect(0, 0, this.W, this.H);
  }

  /**
   * Draw arrival animations on the dynamic canvas.
   * Returns indices of completed arrivals (ready to bake).
   */
  drawArrivals(
    now: number,
    positions: SpiralPosition[],
    arrivals: ArrivalParticle[],
    shapeType: ShapeType,
    radius: number,
    rgb: [number, number, number],
  ): number[] {
    const done: number[] = [];

    for (let i = 0; i < arrivals.length; i++) {
      const a = arrivals[i];
      const t = Math.min(1, (now - a.startTime) / ARRIVAL_DURATION_MS);
      const scale = easeOutCubic(t);
      const pos = positions[a.posIndex];

      // Glow (scaled)
      drawShape(
        this.dCtx, pos.x, pos.y, pos.theta,
        radius * scale * 2.5, shapeType, rgb, 0.06 * scale,
      );
      // Core (scaled)
      drawShape(
        this.dCtx, pos.x, pos.y, pos.theta,
        radius * scale, shapeType, rgb, 0.85,
      );

      if (t >= 1) done.push(i);
    }

    return done;
  }

  /** Draw a ghost preview of all particles (idle state). */
  drawGhostSpiral(
    positions: SpiralPosition[],
    shapeType: ShapeType,
    radius: number,
    rgb: [number, number, number],
  ): void {
    const N = positions.length;
    if (shapeType === 'circle') {
      batchDrawCircles(
        this.dCtx, this.posXs, this.posYs,
        0, N,
        radius, rgb,
        0, 0,     // no glow for ghost
        0.03,     // barely visible
      );
    } else {
      for (let i = 0; i < N; i++) {
        const pos = positions[i];
        drawShape(this.dCtx, pos.x, pos.y, pos.theta, radius, shapeType, rgb, 0.03);
      }
    }
  }

  /** Draw the background (true black + theme tint). */
  drawBackground(rgb: [number, number, number]): void {
    this.sCtx.fillStyle = '#000000';
    this.sCtx.fillRect(0, 0, this.W, this.H);
    this.sCtx.fillStyle = `rgb(${Math.round(rgb[0] * 0.02)},${Math.round(rgb[1] * 0.02)},${Math.round(rgb[2] * 0.02)})`;
    this.sCtx.fillRect(0, 0, this.W, this.H);
  }

  /** Draw a progress bar at the top edge. */
  drawProgressBar(
    progress: number,
    rgb: [number, number, number],
  ): void {
    if (progress <= 0) return;
    const barH = 2;
    this.dCtx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.4)`;
    this.dCtx.fillRect(0, 0, this.W * Math.min(1, progress), barH);
  }
}
