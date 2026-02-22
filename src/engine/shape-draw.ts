/**
 * shape-draw.ts — THE single source of truth for all particle rendering.
 *
 * Used by spiral-renderer.ts for spiral particle baking & arrival animation.
 * All shapes share the same rgb, alpha, size parameters.
 */

export type ShapeType = 'circle' | 'square' | 'triangle' | 'pentagon';

// Pre-computed polygon vertices (unit size, centered at origin)
const TRI_ANGLES: number[] = [];
for (let i = 0; i < 3; i++) TRI_ANGLES.push(-Math.PI / 2 + (i * 2 * Math.PI) / 3);

const PENT_ANGLES: number[] = [];
for (let i = 0; i < 5; i++) PENT_ANGLES.push(-Math.PI / 2 + (i * 2 * Math.PI) / 5);

/**
 * Draw a single shape particle.
 *
 * @param ctx   - Canvas 2D context
 * @param x     - Center X
 * @param y     - Center Y
 * @param theta - Spiral angle (ignored for circle; rotation for others)
 * @param size  - Radius (circle/polygon circumradius), half-side (square)
 * @param shape - Shape type
 * @param rgb   - Color triplet [r, g, b]
 * @param alpha - Opacity 0..1
 */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theta: number,
  size: number,
  shape: ShapeType,
  rgb: [number, number, number],
  alpha: number,
): void {
  if (alpha <= 0 || size <= 0) return;
  ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;

  switch (shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'square':
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(theta);
      ctx.fillRect(-size, -size, size * 2, size * 2);
      ctx.restore();
      break;

    case 'triangle':
      drawPolygon(ctx, x, y, theta, size, TRI_ANGLES);
      break;

    case 'pentagon':
      drawPolygon(ctx, x, y, theta, size, PENT_ANGLES);
      break;
  }
}

/** Draw a regular polygon given pre-computed base angles. */
function drawPolygon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theta: number,
  size: number,
  baseAngles: number[],
): void {
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

/**
 * Batch-draw circles into a single path for performance.
 * Draws glow pass + core pass in two fills.
 */
export function batchDrawCircles(
  ctx: CanvasRenderingContext2D,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  from: number,
  to: number,
  radius: number,
  rgb: [number, number, number],
  glowRadius: number,
  glowAlpha: number,
  coreAlpha: number,
): void {
  if (from >= to) return;

  // Glow pass
  if (glowAlpha > 0 && glowRadius > 0) {
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${glowAlpha})`;
    ctx.beginPath();
    for (let i = from; i < to; i++) {
      ctx.moveTo(xs[i] + glowRadius, ys[i]);
      ctx.arc(xs[i], ys[i], glowRadius, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // Core pass
  ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${coreAlpha})`;
  ctx.beginPath();
  for (let i = from; i < to; i++) {
    ctx.moveTo(xs[i] + radius, ys[i]);
    ctx.arc(xs[i], ys[i], radius, 0, Math.PI * 2);
  }
  ctx.fill();
}
