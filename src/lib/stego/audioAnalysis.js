export function detectAudioStego(audio) {
  const { samples } = audio;
  const lsbScore = lsbDistributionScore(samples);
  const ampScore = amplitudeDistributionScore(samples);
  const spectralScore = spectralFlatnessScore(samples);

  const tests = [
    { name: 'LSB Distribution', score: Math.round(lsbScore), detail: 'LSB plane randomization vs natural autocorrelation' },
    { name: 'Amplitude Distribution', score: Math.round(ampScore), detail: 'Deviation from Laplacian-like sample histogram' },
    { name: 'Spectral Flatness', score: Math.round(spectralScore), detail: 'High-frequency noise from hidden data' },
  ];

  const suspicionScore = Math.round(
    tests.reduce((a, t) => a + t.score, 0) / tests.length
  );

  const technique =
    suspicionScore > 60
      ? 'LSB steganography detected'
      : suspicionScore > 35
        ? 'Possible LSB embedding'
        : 'None detected';

  return {
    suspicionScore,
    tests,
    technique,
    histogram: buildAmplitudeHistogram(samples),
    spectrum: buildSpectrumBins(samples),
  };
}

function lsbDistributionScore(samples) {
  let zeros = 0;
  let ones = 0;
  for (let i = 0; i < samples.length; i++) {
    const int16 = Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767);
    if (int16 & 1) ones++;
    else zeros++;
  }
  const total = zeros + ones || 1;
  const ratio = Math.abs(zeros / total - 0.5);
  let transitions = 0;
  let prev = samples.length ? Math.round(samples[0] * 32767) & 1 : 0;
  for (let i = 1; i < Math.min(samples.length, 50000); i++) {
    const bit = Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767) & 1;
    if (bit !== prev) transitions++;
    prev = bit;
  }
  const transRate = transitions / Math.min(samples.length, 50000);
  return Math.min(100, ratio * 200 + transRate * 120);
}

function amplitudeDistributionScore(samples) {
  const hist = new Array(32).fill(0);
  for (let i = 0; i < samples.length; i++) {
    const bin = Math.min(31, Math.floor(Math.abs(samples[i]) * 32));
    hist[bin]++;
  }
  let smoothness = 0;
  for (let i = 1; i < hist.length; i++) {
    smoothness += Math.abs(hist[i] - hist[i - 1]);
  }
  const maxH = Math.max(...hist, 1);
  const spike = hist.reduce((a, v) => a + (v / maxH > 0.9 ? 1 : 0), 0);
  return Math.min(100, (smoothness / (samples.length / 1000)) * 2 + spike * 15);
}

function spectralFlatnessScore(samples) {
  const n = 512;
  const seg = Math.min(samples.length, n * 40);
  let flatnessSum = 0;
  let segments = 0;

  for (let off = 0; off + n <= seg; off += n) {
    const slice = samples.slice(off, off + n);
    const mag = dftMagnitudes(slice);
    const geo = geometricMean(mag);
    const arith = arithmeticMean(mag);
    const flat = arith > 0 ? geo / arith : 0;
    flatnessSum += flat;
    segments++;
  }

  const avgFlat = flatnessSum / Math.max(segments, 1);
  return Math.min(100, Math.max(0, (avgFlat - 0.15) * 400));
}

function dftMagnitudes(samples) {
  const N = samples.length;
  const mag = [];
  for (let k = 0; k < N / 2; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n++) {
      const ang = (2 * Math.PI * k * n) / N;
      re += samples[n] * Math.cos(ang);
      im -= samples[n] * Math.sin(ang);
    }
    mag.push(Math.hypot(re, im));
  }
  return mag;
}

function geometricMean(arr) {
  const vals = arr.filter((v) => v > 1e-10);
  if (!vals.length) return 0;
  const logSum = vals.reduce((a, v) => a + Math.log(v), 0);
  return Math.exp(logSum / vals.length);
}

function arithmeticMean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function buildAmplitudeHistogram(samples) {
  const bins = new Array(24).fill(0);
  const step = Math.max(1, Math.floor(samples.length / 20000));
  for (let i = 0; i < samples.length; i += step) {
    const bin = Math.min(23, Math.floor(Math.abs(samples[i]) * 24));
    bins[bin]++;
  }
  return bins.map((count, bin) => ({ bin, count }));
}

function buildSpectrumBins(samples) {
  const n = 256;
  if (samples.length < n) return [];
  const slice = samples.slice(0, n);
  const mag = dftMagnitudes(slice);
  const step = Math.max(1, Math.floor(mag.length / 32));
  const out = [];
  for (let i = 0; i < mag.length; i += step) {
    out.push({ bin: out.length, energy: mag[i] });
  }
  return out.slice(0, 32);
}
