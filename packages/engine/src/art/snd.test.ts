import { describe, expect, it } from "vitest";
import { readSnd, writeSnd } from "./snd.ts";

/** A tiny but valid 8-bit mono WAV of `n` samples. */
function wav(n: number): Buffer {
  const b = Buffer.alloc(44 + n, 128);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(36 + n, 4);
  b.write("WAVEfmt ", 8, "latin1");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(22050, 24);
  b.writeUInt32LE(22050, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write("data", 36, "latin1");
  b.writeUInt32LE(n, 40);
  return b;
}

describe("SND files", () => {
  it("files WAVs by group and number, in the layout the engine reads", () => {
    const a = wav(200), c = wav(300);
    const snd = writeSnd([{ group: 1, number: 0, wav: a }, { group: 5, number: 2, wav: c }]);
    expect(snd.toString("latin1", 0, 12)).toBe("ElecbyteSnd\0");
    expect(snd.readUInt32LE(16)).toBe(2);
    expect(snd.readUInt32LE(20)).toBe(512);
    const back = readSnd(snd);
    expect(back.map((s) => [s.group, s.number, s.wav.length])).toEqual([[1, 0, a.length], [5, 2, c.length]]);
    expect(back[1]!.wav.equals(c)).toBe(true);
  });

  it("refuses what isn't a WAV, and the same sound twice", () => {
    expect(() => writeSnd([{ group: 1, number: 0, wav: Buffer.alloc(200) }])).toThrow(/isn't a WAV/);
    expect(() => writeSnd([{ group: 1, number: 0, wav: wav(200) }, { group: 1, number: 0, wav: wav(200) }])).toThrow(/duplicate/);
  });
});
