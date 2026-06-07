const GRID = 32;

function cloneImageData(img) {
  return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
}

function grayAt(data, w, x, y) {
  const i = (y * w + x) * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

function blockEntropy(gray, w, bx0, by0, bw, bh) {
  const hist = new Array(256).fill(0);
  let n = 0;
  for (let y = by0; y < by0 + bh; y++) {
    for (let x = bx0; x < bx0 + bw; x++) {
      const g = Math.min(255, Math.max(0, Math.round(grayAt(gray, w, x, y))));
      hist[g]++;
      n++;
    }
  }
  let e = 0;
  for (let i = 0; i < 256; i++) {
    if (hist[i] > 0) {
      const p = hist[i] / n;
      e -= p * Math.log2(p);
    }
  }
  return e;
}

function blockVariance(gray, w, bx0, by0, bw, bh) {
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = by0; y < by0 + bh; y++) {
    for (let x = bx0; x < bx0 + bw; x++) {
      const g = grayAt(gray, w, x, y);
      sum += g;
      sum2 += g * g;
      n++;
    }
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

function blockSobelMag(gray, w, bx0, by0, bw, bh) {
  let total = 0;
  let count = 0;
  const gxK = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyK = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  for (let y = by0 + 1; y < by0 + bh - 1; y++) {
    for (let x = bx0 + 1; x < bx0 + bw - 1; x++) {
      let gx = 0;
      let gy = 0;
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = grayAt(gray, w, x + dx, y + dy);
          gx += v * gxK[k];
          gy += v * gyK[k];
          k++;
        }
      }
      total += Math.hypot(gx, gy);
      count++;
    }
  }
  return count ? total / count : 0;
}

function blockLaplacianVar(gray, w, bx0, by0, bw, bh) {
  const vals = [];
  for (let y = by0 + 1; y < by0 + bh - 1; y++) {
    for (let x = bx0 + 1; x < bx0 + bw - 1; x++) {
      const c = grayAt(gray, w, x, y);
      const lap =
        -4 * c +
        grayAt(gray, w, x - 1, y) +
        grayAt(gray, w, x + 1, y) +
        grayAt(gray, w, x, y - 1) +
        grayAt(gray, w, x, y + 1);
      vals.push(lap);
    }
  }
  if (!vals.length) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
}

function percentile95(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx] || 1;
}

function normalizeMap(map) {
  const p95 = percentile95(map.flat()) || 1;
  return map.map((row) => row.map((v) => Math.min(1, v / p95)));
}

export function computeRoiHeatmap(img) {
  const { width: w, height: h, data } = img;
  const gray = data;
  const bw = Math.ceil(w / GRID);
  const bh = Math.ceil(h / GRID);
  const sobel = [];
  const lap = [];
  const vari = [];
  const entr = [];

  for (let by = 0; by < GRID; by++) {
    for (let bx = 0; bx < GRID; bx++) {
      const x0 = bx * bw;
      const y0 = by * bh;
      const rw = Math.min(bw, w - x0);
      const rh = Math.min(bh, h - y0);
      sobel.push(blockSobelMag(gray, w, x0, y0, rw, rh));
      lap.push(blockLaplacianVar(gray, w, x0, y0, rw, rh));
      vari.push(blockVariance(gray, w, x0, y0, rw, rh));
      entr.push(blockEntropy(gray, w, x0, y0, rw, rh));
    }
  }

  const toGrid = (flat) => {
    const g = [];
    let i = 0;
    for (let y = 0; y < GRID; y++) {
      const row = [];
      for (let x = 0; x < GRID; x++) row.push(flat[i++]);
      g.push(row);
    }
    return g;
  };

  const sG = normalizeMap(toGrid(sobel));
  const lG = normalizeMap(toGrid(lap));
  const vG = normalizeMap(toGrid(vari));
  const eG = normalizeMap(toGrid(entr));

  const roi = [];
  for (let y = 0; y < GRID; y++) {
    const row = [];
    for (let x = 0; x < GRID; x++) {
      row.push(0.3 * sG[y][x] + 0.25 * lG[y][x] + 0.2 * vG[y][x] + 0.25 * eG[y][x]);
    }
    roi.push(row);
  }
  return roi;
}

export function buildPixelOrder(img, roi) {
  const { width: w, height: h } = img;
  const bw = Math.ceil(w / GRID);
  const bh = Math.ceil(h / GRID);
  const blocks = [];

  for (let by = 0; by < GRID; by++) {
    for (let bx = 0; bx < GRID; bx++) {
      const score = roi[by][bx];
      const x0 = bx * bw;
      const y0 = by * bh;
      const rw = Math.min(bw, w - x0);
      const rh = Math.min(bh, h - y0);
      const pixels = [];
      for (let y = y0; y < y0 + rh; y++) {
        for (let x = x0; x < x0 + rw; x++) {
          pixels.push({ x, y });
        }
      }
      blocks.push({ score, pixels });
    }
  }

  blocks.sort((a, b) => b.score - a.score);
  const order = [];
  for (const b of blocks) {
    for (const p of b.pixels) order.push(p);
  }
  return order;
}

function capacityBits(order) {
  return order.length * 3;
}

export function getImageCapacityBytes(img) {
  const roi = computeRoiHeatmap(img);
  const order = buildPixelOrder(img, roi);
  const bits = capacityBits(order) - 32;
  return Math.max(0, Math.floor(bits / 8));
}

function setBitInChannel(data, w, x, y, ch, bit) {
  const i = (y * w + x) * 4 + ch;
  data[i] = (data[i] & 0xfe) | (bit & 1);
}

function getBitFromChannel(data, w, x, y, ch) {
  const i = (y * w + x) * 4 + ch;
  return data[i] & 1;
}

function writeBits(stego, w, order, bits, startIdx) {
  let bi = 0;
  let touched = new Set();
  for (let i = startIdx; i < order.length && bi < bits.length; i++) {
    const { x, y } = order[i];
    for (let ch = 0; ch < 3 && bi < bits.length; ch++) {
      setBitInChannel(stego.data, w, x, y, ch, bits[bi++]);
      touched.add(`${x},${y}`);
    }
  }
  return { bitsWritten: bi, pixelsTouched: touched.size };
}

function readBitsStream(data, w, order, bitCount, skipBits = 0) {
  const bits = [];
  let bi = 0;
  let skipped = 0;
  for (let i = 0; i < order.length && bi < bitCount; i++) {
    const { x, y } = order[i];
    for (let ch = 0; ch < 3 && bi < bitCount; ch++) {
      if (skipped < skipBits) { skipped++; continue; }
      bits.push(getBitFromChannel(data, w, x, y, ch));
      bi++;
    }
  }
  return bits;
}

function bitsToBytes(bits) {
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) {
      v = (v << 1) | (bits[i * 8 + b] & 1);
    }
    bytes[i] = v;
  }
  return bytes;
}

function bytesToBits(bytes) {
  const bits = [];
  for (let i = 0; i < bytes.length; i++) {
    for (let b = 7; b >= 0; b--) bits.push((bytes[i] >> b) & 1);
  }
  return bits;
}

function uint32ToBits(n) {
  const bits = [];
  for (let b = 31; b >= 0; b--) bits.push((n >> b) & 1);
  return bits;
}

function bitsToUint32(bits) {
  let n = 0;
  for (let i = 0; i < 32 && i < bits.length; i++) {
    n = (n << 1) | (bits[i] & 1);
  }
  return n >>> 0;
}

function computePsnr(orig, stego) {
  let mse = 0;
  const n = orig.data.length / 4;
  for (let i = 0; i < orig.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = orig.data[i + c] - stego.data[i + c];
      mse += d * d;
    }
  }
  mse /= n * 3;
  if (mse === 0) return 99;
  return 10 * Math.log10((255 * 255) / mse);
}

export function embedInImage(img, payload) {
  const roi = computeRoiHeatmap(img);
  const order = buildPixelOrder(img, roi);
  const capBits = capacityBits(order);
  const needBits = 32 + payload.length * 8;
  if (needBits > capBits) {
    throw new Error(`Payload too large. Max ${Math.floor((capBits - 32) / 8)} bytes.`);
  }

  const stego = cloneImageData(img);
  const headerBits = uint32ToBits(payload.length);
  const dataBits = bytesToBits(payload);
  const allBits = [...headerBits, ...dataBits];

  const { bitsWritten, pixelsTouched } = writeBits(stego, img.width, order, allBits, 0);

  return {
    stego,
    psnr: computePsnr(img, stego),
    densityUsed: pixelsTouched / order.length,
    bitsEmbedded: bitsWritten,
    roi,
  };
}

export function extractFromImage(img) {
  const roi = computeRoiHeatmap(img);
  const order = buildPixelOrder(img, roi);
  const headerBits = readBitsStream(img.data, img.width, order, 32);
  const len = bitsToUint32(headerBits);
  if (len === 0 || len > 10 * 1024 * 1024) {
    throw new Error('Invalid embedded length');
  }
  const payloadBits = readBitsStream(img.data, img.width, order, len * 8, 32);
  if (payloadBits.length < len * 8) {
    throw new Error('Incomplete payload');
  }
  return bitsToBytes(payloadBits);
}

// ─── STANDARD LSB (compatible with other steganography tools) ────────────────

export function embedStandard(img, text) {
  const payload = new TextEncoder().encode(text);
  const stego = cloneImageData(img);
  const { width: w } = img;
  const capBits = (img.width * img.height * 3) - 32;
  const needBits = payload.length * 8;

  if (needBits > capBits) {
    throw new Error(`Message too large. Max ${Math.floor(capBits / 8)} bytes.`);
  }

  const headerBits = uint32ToBits(payload.length);
  const dataBits = bytesToBits(payload);
  const allBits = [...headerBits, ...dataBits];

  let bi = 0;
  outer: for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      for (let ch = 0; ch < 3; ch++) {
        if (bi >= allBits.length) break outer;
        setBitInChannel(stego.data, w, x, y, ch, allBits[bi++]);
      }
    }
  }

  return {
    stego,
    psnr: computePsnr(img, stego),
    densityUsed: allBits.length / (img.width * img.height * 3),
    bitsEmbedded: allBits.length,
    roi: null,
  };
}

export function extractStandard(img) {
  const { width: w } = img;

  const headerBits = [];
  let bi = 0;
  outer: for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      for (let ch = 0; ch < 3; ch++) {
        if (bi >= 32) break outer;
        headerBits.push(getBitFromChannel(img.data, w, x, y, ch));
        bi++;
      }
    }
  }

  const len = bitsToUint32(headerBits);
  if (len === 0 || len > 10 * 1024 * 1024) {
    throw new Error('No valid hidden data found');
  }

  const payloadBits = [];
  bi = 0;
  let skip = 32;
  outer2: for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      for (let ch = 0; ch < 3; ch++) {
        if (skip > 0) { skip--; continue; }
        if (bi >= len * 8) break outer2;
        payloadBits.push(getBitFromChannel(img.data, w, x, y, ch));
        bi++;
      }
    }
  }

  const bytes = bitsToBytes(payloadBits);
  return new TextDecoder().decode(bytes);
}