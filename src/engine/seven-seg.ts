/**
 * seven-seg.ts — Clean vector 7-segment display.
 *
 * Each segment is a smooth filled rectangle with shadowBlur glow.
 * No particle composition — crisp, readable digits.
 *
 * Segment layout:
 *   ─a─
 *  │   │
 *  f   b
 *  │   │
 *   ─g─
 *  │   │
 *  e   c
 *  │   │
 *   ─d─
 */

// ── Segment map: [a,b,c,d,e,f,g] per digit 0-9 ──

const DIGIT_SEGMENTS: boolean[][] = [
  [true,  true,  true,  true,  true,  true,  false], // 0
  [false, true,  true,  false, false, false, false], // 1
  [true,  true,  false, true,  true,  false, true],  // 2
  [true,  true,  true,  true,  false, false, true],  // 3
  [false, true,  true,  false, false, true,  true],  // 4
  [true,  false, true,  true,  false, true,  true],  // 5
  [true,  false, true,  true,  true,  true,  true],  // 6
  [true,  true,  true,  false, false, false, false], // 7
  [true,  true,  true,  true,  true,  true,  true],  // 8
  [true,  true,  true,  true,  false, true,  true],  // 9
];

// ── Segment geometry ──

interface SegRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Get the filled rectangle for a segment.
 * Horizontal segments (a, d, g): wide and thin.
 * Vertical segments (b, c, e, f): thin and tall.
 */
function getSegmentRect(
  dx: number, dy: number,
  digitW: number, digitH: number,
  segIndex: number,
  thickness: number,
  gap: number,
): SegRect {
  const halfH = digitH / 2;
  const ht = thickness / 2;

  switch (segIndex) {
    case 0: // a — top horizontal
      return { x: dx + gap, y: dy, w: digitW - gap * 2, h: thickness };
    case 1: // b — top-right vertical
      return { x: dx + digitW - thickness, y: dy + gap, w: thickness, h: halfH - gap * 2 };
    case 2: // c — bottom-right vertical
      return { x: dx + digitW - thickness, y: dy + halfH + gap, w: thickness, h: halfH - gap * 2 };
    case 3: // d — bottom horizontal
      return { x: dx + gap, y: dy + digitH - thickness, w: digitW - gap * 2, h: thickness };
    case 4: // e — bottom-left vertical
      return { x: dx, y: dy + halfH + gap, w: thickness, h: halfH - gap * 2 };
    case 5: // f — top-left vertical
      return { x: dx, y: dy + gap, w: thickness, h: halfH - gap * 2 };
    case 6: // g — middle horizontal
      return { x: dx + gap, y: dy + halfH - ht, w: digitW - gap * 2, h: thickness };
    default:
      return { x: 0, y: 0, w: 0, h: 0 };
  }
}

// ── Drawing ──

function drawSegment(
  ctx: CanvasRenderingContext2D,
  rect: SegRect,
  isOn: boolean,
  rgb: [number, number, number],
  glowIntensity: number,
): void {
  if (isOn) {
    const color = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    // Glow via shadowBlur
    ctx.shadowColor = color;
    ctx.shadowBlur = rect.h > rect.w
      ? Math.max(4, rect.w * 2) * glowIntensity
      : Math.max(4, rect.h * 2) * glowIntensity;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    // Reset shadow
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  } else {
    // Ghost — barely visible
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.03)`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
}

function drawDigit(
  ctx: CanvasRenderingContext2D,
  dx: number, dy: number,
  digitW: number, digitH: number,
  digit: number,
  rgb: [number, number, number],
  glowIntensity: number,
  thickness: number,
  gap: number,
): void {
  const segments = DIGIT_SEGMENTS[digit] || DIGIT_SEGMENTS[0];
  for (let s = 0; s < 7; s++) {
    const rect = getSegmentRect(dx, dy, digitW, digitH, s, thickness, gap);
    drawSegment(ctx, rect, segments[s], rgb, glowIntensity);
  }
}

function drawColon(
  ctx: CanvasRenderingContext2D,
  x: number, cy: number,
  dotSize: number,
  digitH: number,
  rgb: [number, number, number],
  glowIntensity: number,
): void {
  const topY = cy - digitH * 0.20;
  const botY = cy + digitH * 0.20;
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

// ── Public: draw full clock display ──

/**
 * Draw the 6-digit 7-segment clock centered at (cx, cy)
 * within a circle of given voidRadius.
 *
 * Format:
 *   remainingSec < 3600 → MM : SS : CC
 *   remainingSec >= 3600 → HH : MM : SS
 */
export function drawClock(
  ctx: CanvasRenderingContext2D,
  remainingMs: number,
  cx: number, cy: number,
  voidRadius: number,
  _shapeType: string,
  rgb: [number, number, number],
  glowIntensity: number,
): void {
  const totalSec = Math.max(0, remainingMs / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = Math.floor(totalSec % 60);
  const cs = Math.floor((totalSec % 1) * 100);

  let groups: number[][];
  if (totalSec >= 3600) {
    groups = [
      [Math.floor(hh / 10), hh % 10],
      [Math.floor(mm / 10), mm % 10],
      [Math.floor(ss / 10), ss % 10],
    ];
  } else {
    groups = [
      [Math.floor(mm / 10), mm % 10],
      [Math.floor(ss / 10), ss % 10],
      [Math.floor(cs / 10), cs % 10],
    ];
  }

  // Layout: fit 6 digits + 2 colons inside the void circle
  const totalWidth = voidRadius * 2 * 0.80;
  const numGroups = groups.length;

  const pairK = 2.20;
  const gapK = 0.80;
  const digitW = totalWidth / (numGroups * pairK + (numGroups - 1) * gapK);
  const digitH = digitW * 1.8;
  const pairGap = digitW * 0.20;
  const groupGap = digitW * 0.80;

  // Segment thickness and gap between segments
  const thickness = Math.max(1.5, digitW * 0.14);
  const segGap = Math.max(0.5, thickness * 0.4);

  // Render digits narrower than layout slot for a sleek, less cramped look
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
