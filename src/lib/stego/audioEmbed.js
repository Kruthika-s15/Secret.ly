function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function floatToInt16(f) {
  return Math.round(clamp(f, -1, 1) * 32767);
}

function int16ToFloat(n) {
  return n / 32767;
}

function interleaveSamples(channelData, numChannels) {
  const len = channelData[0].length;
  const out = new Float32Array(len * numChannels);
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      out[i * numChannels + ch] = channelData[ch][i];
    }
  }
  return out;
}

function deinterleaveSamples(samples, numChannels) {
  const frameCount = samples.length / numChannels;
  const channels = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const chData = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
      chData[i] = samples[i * numChannels + ch];
    }
    channels.push(chData);
  }
  return channels;
}

export async function decodeAudioFile(file) {
  const arrayBuffer = await file.arrayBuffer();

  // WAV files: read raw PCM int16 directly to preserve LSBs exactly
  // WebAudio float conversion corrupts LSBs on round-trip
  if (file.name.toLowerCase().endsWith('.wav') || file.type === 'audio/wav') {
    try {
      const view = new DataView(arrayBuffer);
      let numChannels, sampleRate, bitsPerSample, dataOffset;
      let offset = 12;
      while (offset < arrayBuffer.byteLength - 8) {
        const chunkId = String.fromCharCode(
          view.getUint8(offset), view.getUint8(offset + 1),
          view.getUint8(offset + 2), view.getUint8(offset + 3)
        );
        const chunkSize = view.getUint32(offset + 4, true);
        if (chunkId === 'fmt ') {
          numChannels = view.getUint16(offset + 10, true);
          sampleRate = view.getUint32(offset + 12, true);
          bitsPerSample = view.getUint16(offset + 22, true);
        }
        if (chunkId === 'data') {
          dataOffset = offset + 8;
          break;
        }
        offset += 8 + chunkSize;
      }
      if (bitsPerSample === 16 && dataOffset !== undefined) {
        const numSamples = (arrayBuffer.byteLength - dataOffset) / 2;
        const samples = new Float32Array(numSamples);
        const rawInt16 = new Int16Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
          const v = view.getInt16(dataOffset + i * 2, true);
          rawInt16[i] = v;
          samples[i] = v / 32767;
        }
        return {
          samples,
          rawInt16,
          sampleRate,
          numChannels,
          duration: numSamples / (sampleRate * numChannels),
          channelData: deinterleaveSamples(samples, numChannels),
        };
      }
    } catch (e) {
      // fall through to WebAudio
    }
  }

  // Non-WAV: decode via WebAudio
  const ctx = new OfflineAudioContext(2, 44100 * 120, 44100);
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  const channels = [];
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch).slice());
  }
  const samples = interleaveSamples(channels, audioBuffer.numberOfChannels);
  return {
    samples,
    sampleRate: audioBuffer.sampleRate,
    numChannels: audioBuffer.numberOfChannels,
    duration: audioBuffer.duration,
    channelData: channels,
  };
}

export function getAudioCapacityBytes(audio) {
  const bits = audio.samples.length - 32;
  return Math.max(0, Math.floor(bits / 8));
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

function bytesToBits(bytes) {
  const bits = [];
  for (let i = 0; i < bytes.length; i++) {
    for (let b = 7; b >= 0; b--) bits.push((bytes[i] >> b) & 1);
  }
  return bits;
}

function bitsToBytes(bits) {
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | (bits[i * 8 + b] & 1);
    bytes[i] = v;
  }
  return bytes;
}

function embedBitsInSamples(samples, allBits) {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    if (i < allBits.length) {
      const int16 = floatToInt16(samples[i]);
      const modified = (int16 & 0xfffe) | (allBits[i] & 1);
      out[i] = modified / 32767;
    } else {
      out[i] = samples[i];
    }
  }
  return { samples: out, bitsEmbedded: allBits.length };
}

function computeSnr(original, stego) {
  let signal = 0;
  let noise = 0;
  const n = Math.min(original.length, stego.length);
  for (let i = 0; i < n; i++) {
    signal += original[i] ** 2;
    const d = original[i] - stego[i];
    noise += d * d;
  }
  if (noise === 0) return 99;
  return 10 * Math.log10(signal / noise);
}

export function embedInAudio(audio, payload) {
  const capBits = audio.samples.length;
  const needBits = 32 + payload.length * 8;
  if (needBits > capBits) {
    throw new Error(`Payload too large. Max ${Math.floor((capBits - 32) / 8)} bytes.`);
  }
  const headerBits = uint32ToBits(payload.length);
  const dataBits = bytesToBits(payload);
  const allBits = [...headerBits, ...dataBits];
  const { samples: stegoSamples, bitsEmbedded } = embedBitsInSamples(audio.samples, allBits);
  const wavBuffer = encodeWav(stegoSamples, audio.sampleRate, audio.numChannels);
  return {
    wavBuffer,
    stegoSamples,
    snrDb: computeSnr(audio.samples, stegoSamples),
    densityUsed: bitsEmbedded / audio.samples.length,
    capacityBytes: getAudioCapacityBytes(audio),
    bitsEmbedded,
  };
}

export function extractFromAudio(audio) {
  // Use rawInt16 if available (direct WAV read) — preserves LSBs exactly
  const getInt16 = audio.rawInt16
    ? (i) => audio.rawInt16[i]
    : (i) => floatToInt16(audio.samples[i]);

  const headerBits = [];
  for (let i = 0; i < 32; i++) headerBits.push(getInt16(i) & 1);
  const len = bitsToUint32(headerBits);
  if (len === 0 || len > 10 * 1024 * 1024) {
    throw new Error('No valid hidden data found');
  }
  const payloadBits = [];
  for (let i = 0; i < len * 8; i++) payloadBits.push(getInt16(32 + i) & 1);
  if (payloadBits.length < len * 8) throw new Error('Incomplete payload');
  return bitsToBytes(payloadBits);
}

export function encodeWav(samples, sampleRate, channels) {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(offset, floatToInt16(samples[i]), true);
    offset += 2;
  }
  return buffer;
}

export function buildWaveformData(samples, points = 200) {
  const bucket = Math.max(1, Math.floor(samples.length / points));
  const data = [];
  for (let i = 0; i < points; i++) {
    const start = i * bucket;
    const end = Math.min(start + bucket, samples.length);
    let peak = 0;
    for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(samples[j]));
    data.push(peak);
  }
  return data;
}

export { deinterleaveSamples };