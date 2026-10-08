import { describe, expect, it } from "vitest";
import { cut, mix, normalize, readWav, resample, seeded, swoosh, synth, synthSeconds, WAVES, writeWav } from "./wav.ts";

describe("wav", () => {
  it("writes 16-bit mono and reads it back", () => {
    const s = { rate: 8000, data: Float32Array.from([0, 0.5, -0.5, 1, -1]) };
    const back = readWav(writeWav(s));
    expect(back.rate).toBe(8000);
    expect([...back.data].map((v) => Math.round(v * 100) / 100)).toEqual([0, 0.5, -0.5, 1, -1]);
  });

  it("reads 8-bit stereo as mono", () => {
    const h = Buffer.alloc(44);
    h.write("RIFF", 0, "latin1");
    h.write("WAVEfmt ", 8, "latin1");
    h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20);
    h.writeUInt16LE(2, 22);
    h.writeUInt32LE(11025, 24);
    h.writeUInt16LE(8, 34);
    h.write("data", 36, "latin1");
    h.writeUInt32LE(4, 40);
    const wav = Buffer.concat([h, Buffer.from([255, 128, 0, 128])]);
    const s = readWav(wav);
    expect(s.rate).toBe(11025);
    expect([...s.data].map((v) => Math.round(v * 100) / 100)).toEqual([0.5, -0.5]);
  });

  it("cuts with a fade, resamples, mixes and normalizes", () => {
    const s = { rate: 100, data: new Float32Array(100).fill(0.5) };
    const c = cut(s, 0.2, 0.6, 0.1);
    expect(c.data.length).toBe(40);
    expect(c.data[0]).toBe(0.5);
    expect(c.data[39]).toBe(0);
    expect(resample(s, 50).data.length).toBe(50);
    const m = mix(s, { rate: 100, data: new Float32Array(20).fill(0.25) }, 0.9);
    expect(m.data.length).toBe(110);
    expect(m.data[95]).toBeCloseTo(0.75);
    expect(Math.max(...normalize(m, 1).data)).toBeCloseTo(1);
  });

  it("can give a sound's formulas the time in seconds", () => {
    const seen: number[] = [];
    synthSeconds(0.5, () => 0, (t) => (seen.push(t), 1), WAVES.sine, 100);
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBeCloseTo(0.49, 5);
  });

  it("makes a swoosh: one swell, quiet at both ends, and softer than raw noise", () => {
    const s = swoosh(0.2, 2000, seeded(3), 22050);
    const n = s.data.length, loud = (from: number, to: number) => Math.max(...s.data.slice(Math.round(from * n), Math.round(to * n)).map(Math.abs));
    expect(loud(0.4, 0.6)).toBeGreaterThan(5 * loud(0, 0.05));
    expect(loud(0.4, 0.6)).toBeGreaterThan(5 * loud(0.95, 1));
    // Low-passed: it crosses zero far less often than white noise (about every other sample).
    let crossings = 0;
    for (let i = 1; i < n; i++) if (Math.sign(s.data[i]!) !== Math.sign(s.data[i - 1]!)) crossings++;
    expect(crossings / n).toBeLessThan(0.15);
  });

  it("makes the same sound every time", () => {
    const make = () => synth(0.1, (t) => 440 + 440 * t, (t) => 1 - t, WAVES.sine, 8000);
    expect(make().data.length).toBe(800);
    expect([...make().data]).toEqual([...make().data]);
    const a = seeded(3), b = seeded(3);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
