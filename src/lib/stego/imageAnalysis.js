import { computeRoiHeatmap, buildPixelOrder, getImageCapacityBytes } from '@/lib/stego/imageEmbed.js';

const GRID = 32;

function cloneGray(img) {
  const { width: w, height: h, data } = img;
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      gray[y * w + x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
  }
  return gray;
}

export function analyzeImage(img) {
  const roi = computeRoiHeatmap(img);
  const flat = roi.flat();
  const textureScore = Math.round((flat.reduce((a, b) => a + b, 0) / flat.length) * 100);
  const edgeDensityPct = Math.round(
    (flat.filter((v) => v > 0.5).length / flat.length) * 100
  );
  const complexityScore = Math.round(
    Math.min(100, (Math.max(...flat) - Math.min(...flat)) * 100 + textureScore * 0.3)
  );

  const reasons = [];
  let verdict = 'ACCEPTED';

  if (img.width < 200 || img.height < 200) {
    verdict = 'REJECTED';
    reasons.push('Image too small (<200×200)');
  }

  const gray = cloneGray(img);
  let variance = 0;
  const mean = gray.reduce((a, b) => a + b, 0) / gray.length;
  for (let i = 0; i < gray.length; i++) variance += (gray[i] - mean) ** 2;
  variance /= gray.length;

  if (variance < 50) {
    verdict = 'REJECTED';
    reasons.push('Image too uniform for safe embedding');
  } else if (variance < 200) {
    if (verdict === 'ACCEPTED') verdict = 'WARNING';
    reasons.push('Low variance — limited texture for ROI masking');
  }

  if (textureScore < 25) {
    if (verdict === 'ACCEPTED') verdict = 'WARNING';
    reasons.push('Low texture score — PSNR may suffer');
  }

  if (verdict === 'ACCEPTED' && reasons.length === 0) {
    reasons.push('Sufficient texture and edge regions for ROI-guided LSB');
  }

  const capacityBytes = getImageCapacityBytes(img);

  return {
    textureScore,
    edgeDensityPct,
    complexityScore,
    verdict,
    reasons,
    roi,
    capacityBytes,
  };
}

function histogramPairScore(img) {
  const hist = new Array(256).fill(0);
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) hist[data[i + c]]++;
  }
  let pairEffect = 0;
  for (let i = 0; i < 255; i++) {
    const a = hist[i];
    const b = hist[i + 1];
    if (a + b > 0) pairEffect += Math.abs(a - b) / (a + b);
  }
  return Math.min(100, (1 - pairEffect / 256) * 100);
}

function rsAnalysisScore(img) {
  const { width: w, height: h, data } = img;
  let r = 0;
  let s = 0;
  const groups = [
    [1, 0],
    [0, 1],
  ];

  for (const [dm, dn] of groups) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w - 1; x++) {
        const i0 = (y * w + x) * 4;
        const i1 = (y * w + x + 1) * 4;
        const p0 = data[i0];
        const p1 = data[i1];
        const f0 = Math.floor(p0 / 4);
        const f1 = Math.floor(p1 / 4);
        const d = Math.abs(f1 - f0);
        if (d === 0) r++;
        else if (d === 1) s++;
      }
    }
  }

  const total = r + s || 1;
  const ratio = r / total;
  return Math.min(100, Math.max(0, (0.5 - Math.abs(ratio - 0.5)) * 200));
}

function samplePairsScore(img) {
  const { width: w, height: h, data } = img;
  let close = 0;
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i0 = (y * w + x) * 4;
      const i1 = (y * w + x + 1) * 4;
      const d = Math.abs(data[i0] - data[i1]);
      if (d <= 2) close++;
      total++;
    }
  }
  const pct = close / (total || 1);
  return Math.min(100, pct * 150);
}

function lsbPlaneChiSquare(img) {
  const { width: w, height: h, data } = img;
  let chiSum = 0;
  let blocks = 0;
  const block = 8;

  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      const counts = new Array(256).fill(0);
      for (let y = by; y < Math.min(by + block, h); y++) {
        for (let x = bx; x < Math.min(bx + block, w); x++) {
          for (let ch = 0; ch < 3; ch++) {
            const v = data[(y * w + x) * 4 + ch];
            counts[v]++;
          }
        }
      }
      let chi = 0;
      for (let k = 0; k < 128; k++) {
        const n0 = counts[2 * k] + counts[2 * k + 1];
        if (n0 < 5) continue;
        const exp = n0 / 2;
        chi += ((counts[2 * k] - exp) ** 2) / exp;
        chi += ((counts[2 * k + 1] - exp) ** 2) / exp;
      }
      chiSum += chi;
      blocks++;
    }
  }
  const avgChi = chiSum / Math.max(blocks, 1);
  return Math.min(100, Math.max(0, (avgChi - 50) * 1.2));
}

export function detectImageStego(img) {
  const chi = lsbPlaneChiSquare(img);
  const hist = histogramPairScore(img);
  const rs = rsAnalysisScore(img);
  const pairs = samplePairsScore(img);

  const tests = [
    { name: 'LSB Chi-Square Attack', score: Math.round(chi), detail: 'Pair frequency deviation in 8×8 blocks' },
    { name: 'Histogram Pair Analysis', score: Math.round(hist), detail: 'Adjacent value frequency coupling' },
    { name: 'RS Analysis', score: Math.round(rs), detail: 'Regular vs Singular group balance' },
    { name: 'Sample Pairs Analysis', score: Math.round(pairs), detail: 'Close pixel pair monotonicity' },
  ];

  const suspicionScore = Math.round(
    tests.reduce((a, t) => a + t.score, 0) / tests.length
  );

  const technique =
    suspicionScore > 60 ? 'LSB steganography detected' : suspicionScore > 35 ? 'Possible LSB embedding' : 'None detected';

  return {
    suspicionScore,
    tests,
    technique,
    histogram: computeLsbHistogram(img),
  };
}

function computeLsbHistogram(img) {
  const bins = new Array(16).fill(0);
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) bins[data[i + c] & 0x0f]++;
  }
  return bins.map((v, i) => ({ bin: i, count: v }));
}
