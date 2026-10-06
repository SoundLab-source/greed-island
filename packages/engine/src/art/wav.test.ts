import { describe, expect, it } from "vitest";
import { cut, mix, normalize, readWav, resample, seeded, synth, WAVES, writeWav } from "./wav.ts";

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

  it("makes the same sound every time", () => {
    const make = () => synth(0.1, (t) => 440 + 440 * t, (t) => 1 - t, WAVES.sine, 8000);
    expect(make().data.length).toBe(800);
    expect([...make().data]).toEqual([...make().data]);
    const a = seeded(3), b = seeded(3);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
