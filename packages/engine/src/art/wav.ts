/**
 * WAV sounds for the game's sound files (art/snd.ts): read a PCM WAV into
 * samples, cut, fade and resample it, and make sounds in code (tones,
 * sweeps, noise). Everything is mono floats from -1 to 1 until `writeWav`
 * turns it into 16-bit PCM, which IKEMEN plays (docs/ikemen-notes.md §7).
 */

export interface Samples {
  rate: number;
  data: Float32Array;
}

/** A PCM WAV (8 or 16 bits, any channel count) as mono samples. */
export function readWav(bytes: Uint8Array): Samples {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  let at = 12, channels = 0, rate = 0, bits = 0, data: Buffer | undefined;
  while (at + 8 <= b.length) {
    const id = b.toString("latin1", at, at + 4), size = b.readUInt32LE(at + 4);
    if (id === "fmt ") {
      if (b.readUInt16LE(at + 8) !== 1) throw new Error("only PCM WAVs");
      channels = b.readUInt16LE(at + 10);
      rate = b.readUInt32LE(at + 12);
      bits = b.readUInt16LE(at + 22);
    } else if (id === "data") data = b.subarray(at + 8, Math.min(b.length, at + 8 + size));
    at += 8 + size + (size & 1);
  }
  if (!data || !channels || (bits !== 8 && bits !== 16)) throw new Error("unsupported WAV");
  const step = channels * (bits / 8), count = Math.floor(data.length / step);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const o = i * step + c * (bits / 8);
      sum += bits === 16 ? data.readInt16LE(o) / 32768 : (data[o]! - 128) / 128;
    }
    out[i] = sum / channels;
  }
  return { rate, data: out };
}

/** 16-bit mono PCM WAV. */
export function writeWav(s: Samples): Buffer {
  const pcm = Buffer.alloc(s.data.length * 2);
  for (let i = 0; i < s.data.length; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s.data[i]!)) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "latin1");
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8, "latin1");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(s.rate, 24);
  h.writeUInt32LE(s.rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "latin1");
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** The part from `from` to `to` seconds, with `fade` seconds of fade-out at the end. */
export function cut(s: Samples, from: number, to: number, fade = 0): Samples {
  const a = Math.max(0, Math.round(from * s.rate)), z = Math.min(s.data.length, Math.round(to * s.rate));
  const data = s.data.slice(a, z);
  const f = Math.round(fade * s.rate);
  for (let i = 0; i < f && i < data.length; i++) data[data.length - 1 - i]! *= i / f;
  return { rate: s.rate, data };
}

/** Linear resampling to `rate`. */
export function resample(s: Samples, rate: number): Samples {
  if (rate === s.rate) return s;
  const n = Math.floor((s.data.length * rate) / s.rate), data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i * s.rate) / rate, j = Math.floor(t), f = t - j;
    data[i] = (s.data[j] ?? 0) * (1 - f) + (s.data[j + 1] ?? s.data[j] ?? 0) * f;
  }
  return { rate, data };
}

/** Scale to a peak of `peak`. */
export function normalize(s: Samples, peak = 0.9): Samples {
  let m = 0;
  for (const v of s.data) m = Math.max(m, Math.abs(v));
  return m ? { rate: s.rate, data: s.data.map((v) => (v * peak) / m) } : s;
}

/** Add `b` into `a` starting `at` seconds in (the result is as long as needed). */
export function mix(a: Samples, b: Samples, at = 0): Samples {
  const start = Math.round(at * a.rate), data = new Float32Array(Math.max(a.data.length, start + b.data.length));
  data.set(a.data);
  for (let i = 0; i < b.data.length; i++) data[start + i]! += b.data[i]!;
  return { rate: a.rate, data };
}

/**
 * A made sound, `seconds` long: `wave(phase, t)` gives the waveform at a
 * phase (cycles, so the pitch can glide) and time, `pitch(t)` the frequency
 * in Hz and `volume(t)` the envelope, t from 0 to 1.
 */
export function synth(seconds: number, pitch: (t: number) => number, volume: (t: number) => number, wave: (phase: number, t: number) => number, rate = 22050): Samples {
  const n = Math.round(seconds * rate), data = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    phase += pitch(t) / rate;
    data[i] = wave(phase, t) * volume(t);
  }
  return { rate, data };
}

/** `synth`, with `pitch`, `volume` and `wave` given the time in seconds (0 to `seconds`) instead of from 0 to 1. */
export function synthSeconds(seconds: number, pitch: (t: number) => number, volume: (t: number) => number, wave: (phase: number, t: number) => number, rate = 22050): Samples {
  return synth(seconds, (t) => pitch(t * seconds), (t) => volume(t * seconds), (p, t) => wave(p, t * seconds), rate);
}

/**
 * A swoosh: noise through a low-pass filter that opens and closes with one smooth swell, so it sounds like air moved by
 * a swing, not hiss. `bright` is how far the filter opens (Hz above 250).
 */
export function swoosh(seconds: number, bright: number, noise: () => number, rate = 22050): Samples {
  const n = Math.round(seconds * rate), data = new Float32Array(n);
  let a1 = 0, a2 = 0;
  for (let i = 0; i < n; i++) {
    const swell = Math.sin((i / n) * Math.PI) ** 2;
    const k = 1 - Math.exp((-2 * Math.PI * (250 + bright * swell)) / rate);
    a1 += k * (noise() - a1);
    a2 += k * (a1 - a2);
    data[i] = a2 * swell;
  }
  return { rate, data };
}

/** Waveforms for `synth`. `noise` uses a fixed seed so a build always makes the same sound. */
export const WAVES = {
  sine: (p: number) => Math.sin(2 * Math.PI * p),
  square: (p: number) => (p % 1 < 0.5 ? 1 : -1),
  saw: (p: number) => 2 * (p % 1) - 1,
  noise: seeded(1),
};

/** White noise from a seed (a small LCG), as a waveform. */
export function seeded(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2147483648 - 1;
  };
}
