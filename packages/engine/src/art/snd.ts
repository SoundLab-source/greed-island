/**
 * MUGEN/IKEMEN sound files (.snd): WAV files filed by group and number, the
 * way PlaySnd names them. The layout, as the engine reads it
 * (vendor/Ikemen-GO src/sound.go:810-875): "ElecbyteSnd\0", two version
 * words, the number of sounds and the offset of the first; then each sound
 * as the offset of the next, its length, its group and number, and the WAV
 * file itself (at least 128 bytes, decoded once on load to check it plays).
 */

export interface SndSound {
  group: number;
  number: number;
  /** A whole WAV file. */
  wav: Buffer;
}

const SIGNATURE = "ElecbyteSnd\0";
/** Where the first sound starts: the header, padded like Elecbyte's own files. */
const FIRST = 512;
const SUB_HEADER = 16;

export function writeSnd(sounds: readonly SndSound[]): Buffer {
  const seen = new Set<string>();
  for (const s of sounds) {
    const key = `${s.group},${s.number}`;
    if (seen.has(key)) throw new Error(`duplicate sound ${key}`);
    seen.add(key);
    if (s.wav.length < 128 || s.wav.toString("latin1", 0, 4) !== "RIFF" || s.wav.toString("latin1", 8, 12) !== "WAVE") throw new Error(`sound ${key} isn't a WAV file`);
  }
  const header = Buffer.alloc(FIRST);
  header.write(SIGNATURE, 0, "latin1");
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(1, 14);
  header.writeUInt32LE(sounds.length, 16);
  header.writeUInt32LE(FIRST, 20);
  const parts: Buffer[] = [header];
  let offset = FIRST;
  for (const s of sounds) {
    const sub = Buffer.alloc(SUB_HEADER);
    const next = offset + SUB_HEADER + s.wav.length;
    sub.writeUInt32LE(next, 0);
    sub.writeUInt32LE(s.wav.length, 4);
    sub.writeInt32LE(s.group, 8);
    sub.writeInt32LE(s.number, 12);
    parts.push(sub, s.wav);
    offset = next;
  }
  return Buffer.concat(parts);
}

/** The sounds in a .snd file, as writeSnd writes them (and as the engine reads them). */
export function readSnd(bytes: Buffer): SndSound[] {
  if (bytes.toString("latin1", 0, 12) !== SIGNATURE) throw new Error("not a SND file");
  const count = bytes.readUInt32LE(16);
  let at = bytes.readUInt32LE(20);
  const out: SndSound[] = [];
  for (let i = 0; i < count; i++) {
    const next = bytes.readUInt32LE(at);
    const length = bytes.readUInt32LE(at + 4);
    out.push({ group: bytes.readInt32LE(at + 8), number: bytes.readInt32LE(at + 12), wav: bytes.subarray(at + SUB_HEADER, at + SUB_HEADER + length) });
    at = next;
  }
  return out;
}
