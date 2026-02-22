/**
 * gen-icons.js — Generate PWA icon PNGs from a simple canvas drawing.
 * Run with: node scripts/gen-icons.js
 *
 * Creates icon-192.png and icon-512.png in the project root.
 * Uses a minimal PNG encoder (no dependencies).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height, drawFn) {
  // Create RGBA buffer
  const data = Buffer.alloc(width * height * 4);
  drawFn(data, width, height);

  // PNG encoding
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw image data with filter bytes
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // no filter
    data.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(rawData);

  function makeChunk(type, chunkData) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(chunkData.length, 0);
    const typeB = Buffer.from(type);
    const crcData = Buffer.concat([typeB, chunkData]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData) >>> 0, 0);
    return Buffer.concat([len, typeB, chunkData, crc]);
  }

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// CRC32 implementation
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return crc ^ 0xFFFFFFFF;
}

// Draw golden spiral dots on black background
function drawIcon(data, w, h) {
  // Black background
  for (let i = 0; i < w * h; i++) {
    data[i * 4 + 3] = 255; // alpha
  }

  const cx = w / 2, cy = h / 2;
  const GOLDEN_ANGLE = 2.3999632297286533;
  const N = 80;
  const nOff = 3;
  const rMax = w * 0.42;
  const c = rMax / Math.sqrt(N + nOff);
  const pRadius = Math.max(1, c * 0.40);

  for (let i = 0; i < N; i++) {
    const n = nOff + i;
    const theta = n * GOLDEN_ANGLE;
    const r = c * Math.sqrt(n);
    const px = cx + r * Math.cos(theta);
    const py = cy + r * Math.sin(theta);
    const alpha = 0.3 + 0.6 * (i / N);

    // Draw filled circle
    const rad = Math.ceil(pRadius);
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy <= pRadius * pRadius) {
          const ix = Math.round(px + dx);
          const iy = Math.round(py + dy);
          if (ix >= 0 && ix < w && iy >= 0 && iy < h) {
            const idx = (iy * w + ix) * 4;
            const a = alpha;
            // Nixie orange: RGB(255, 180, 100)
            data[idx + 0] = Math.min(255, data[idx + 0] + Math.round(255 * a));
            data[idx + 1] = Math.min(255, data[idx + 1] + Math.round(180 * a));
            data[idx + 2] = Math.min(255, data[idx + 2] + Math.round(100 * a));
          }
        }
      }
    }
  }
}

const root = path.join(__dirname, '..');
for (const size of [192, 512]) {
  const png = createPNG(size, size, drawIcon);
  fs.writeFileSync(path.join(root, `icon-${size}.png`), png);
  console.log(`Created icon-${size}.png (${png.length} bytes)`);
}
