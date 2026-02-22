/**
 * Vogel's Model — spiral math engine.
 *
 * Core formulas:
 *   θ(n) = n × GOLDEN_ANGLE
 *   r(n) = c × √n
 *   x(n) = cx + r(n) × cos(θ(n))
 *   y(n) = cy + r(n) × sin(θ(n))
 *
 * The scaling coefficient c ensures the outermost particle
 * sits exactly at R_max: c = R_max / √(N + n_offset)
 */

/** Golden angle in radians: 137.50776405003785° */
export const GOLDEN_ANGLE = 2.3999632297286533;

// ── Types ──

export type FillDirection = 'in-out' | 'out-in';

export interface SpiralPosition {
  x: number;
  y: number;
  theta: number;
  r: number;
}

export interface SpiralConfig {
  totalParticles: number;
  nOffset: number;
  c: number;
  particleRadius: number;
  rMax: number;
  voidRadius: number;
}

// ── Core computations ──

/**
 * Compute adaptive n_offset so the core void radius stays
 * at ~20% of R_max when dashboard is on.
 */
export function computeNOffset(N: number, dashboardOn: boolean): number {
  if (!dashboardOn) return 0;
  const targetRatio = 0.20;
  const rSq = targetRatio * targetRatio; // 0.04
  const ideal = Math.round((rSq * N) / (1 - rSq));
  return Math.max(10, Math.min(200, ideal));
}

/**
 * Compute the scaling coefficient c and derived values.
 */
export function computeScaling(
  N: number,
  nOffset: number,
  canvasW: number,
  canvasH: number,
): SpiralConfig {
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
    voidRadius,
  };
}

/**
 * Derive particle radius from the Vogel packing density.
 *
 * In a Vogel spiral, each particle occupies an area of π·c².
 * The nearest-neighbor distance is approximately c·√π ≈ 1.77·c.
 * We size particles at ~40% of c for visible gaps with satisfying density.
 */
function computeParticleRadius(c: number, _N: number, _nOffset: number): number {
  return Math.max(0.5, Math.min(8, c * 0.40));
}

/**
 * Map a fill-order index to the actual Vogel spiral index.
 * Inside-Out: natural order (inner → outer).
 * Outside-In: reversed order (outer → inner).
 */
export function spiralIndex(
  fillIndex: number,
  N: number,
  nOffset: number,
  direction: FillDirection,
): number {
  return direction === 'in-out'
    ? nOffset + fillIndex
    : nOffset + (N - 1 - fillIndex);
}

/**
 * Pre-compute all N particle positions in fill order.
 * positions[0] is the first particle to appear,
 * positions[N-1] is the last.
 */
export function precomputeSpiral(
  N: number,
  nOffset: number,
  c: number,
  cx: number,
  cy: number,
  direction: FillDirection,
): SpiralPosition[] {
  const positions: SpiralPosition[] = new Array(N);
  for (let i = 0; i < N; i++) {
    const n = spiralIndex(i, N, nOffset, direction);
    const theta = n * GOLDEN_ANGLE;
    const r = c * Math.sqrt(n);
    positions[i] = {
      x: cx + r * Math.cos(theta),
      y: cy + r * Math.sin(theta),
      theta,
      r,
    };
  }
  return positions;
}
