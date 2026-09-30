/**
 * NFT look images (docs/PHASE3.md "NFTs as fighters"): what kind of image a
 * download is (from its bytes), a small PNG decoder to read its colours, and
 * where images are kept: outside git in GI_LOOKS_DIR (default `looks/`,
 * gitignored) as <sha256>.<type>, so a look keeps its image even if the NFT's
 * own address goes away.
 */
import { REPO_ROOT } from "@greed-island/db";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";

export const LOOK_IMAGE_TYPES = { png: "image/png", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" } as const;
export type LookImageType = keyof typeof LOOK_IMAGE_TYPES;

/** The image's type from its first bytes, or null for anything else. */
export function sniffImage(b: Uint8Array): LookImageType | null {
  const starts = (...bytes: number[]) => bytes.every((x, i) => b[i] === x);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (starts(0xff, 0xd8, 0xff)) return "jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "gif";
  if (starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

/**
 * Decode a PNG to RGBA pixels. Handles 8-bit greyscale, RGB, palette,
 * grey+alpha and RGBA, not interlaced, up to `maxPixels`; anything else (or
 * a damaged file) gives null. Enough to read an NFT's colours.
 */
export function decodePng(bytes: Uint8Array, maxPixels = 2048 * 2048): { width: number; height: number; rgba: Uint8Array } | null {
  try {
    if (sniffImage(bytes) !== "png") return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 8;
    let width = 0, height = 0, depth = 0, type = -1, interlace = 0;
    let palette: Uint8Array | null = null;
    let alpha: Uint8Array | null = null;
    const data: Uint8Array[] = [];
    while (offset + 8 <= bytes.length) {
      const length = view.getUint32(offset);
      const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      const body = bytes.subarray(offset + 8, offset + 8 + length);
      if (body.length !== length) return null;
      if (kind === "IHDR") {
        width = view.getUint32(offset + 8);
        height = view.getUint32(offset + 12);
        depth = body[8]!;
        type = body[9]!;
        interlace = body[12]!;
      } else if (kind === "PLTE") palette = body;
      else if (kind === "tRNS") alpha = body;
      else if (kind === "IDAT") data.push(body);
      else if (kind === "IEND") break;
      offset += 12 + length;
    }
    const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
    if (!channels || depth !== 8 || interlace !== 0 || width === 0 || height === 0 || width * height > maxPixels) return null;
    if (type === 3 && !palette) return null;
    const raw = inflateSync(Buffer.concat(data));
    const stride = width * channels;
    if (raw.length < height * (stride + 1)) return null;
    const lines = new Uint8Array(height * stride);
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)]!;
      const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
      const out = lines.subarray(y * stride, (y + 1) * stride);
      const prev = y > 0 ? lines.subarray((y - 1) * stride, y * stride) : null;
      for (let x = 0; x < stride; x++) {
        const left = x >= channels ? out[x - channels]! : 0;
        const up = prev ? prev[x]! : 0;
        const upLeft = prev && x >= channels ? prev[x - channels]! : 0;
        let v = src[x]!;
        if (filter === 1) v += left;
        else if (filter === 2) v += up;
        else if (filter === 3) v += (left + up) >> 1;
        else if (filter === 4) {
          const p = left + up - upLeft;
          const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
          v += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        } else if (filter !== 0) return null;
        out[x] = v & 0xff;
      }
    }
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const s = i * channels;
      const o = i * 4;
      if (type === 0) rgba.set([lines[s]!, lines[s]!, lines[s]!, 255], o);
      else if (type === 4) rgba.set([lines[s]!, lines[s]!, lines[s]!, lines[s + 1]!], o);
      else if (type === 2) rgba.set([lines[s]!, lines[s + 1]!, lines[s + 2]!, 255], o);
      else if (type === 6) rgba.set(lines.subarray(s, s + 4), o);
      else {
        const idx = lines[s]!;
        rgba.set([palette![idx * 3] ?? 0, palette![idx * 3 + 1] ?? 0, palette![idx * 3 + 2] ?? 0, alpha?.[idx] ?? 255], o);
      }
    }
    return { width, height, rgba };
  } catch {
    return null;
  }
}

export class LookStore {
  constructor(readonly dir: string) {}

  private file(sha256: string, type: LookImageType): string {
    if (!/^[0-9a-f]{64}$/.test(sha256) || !(type in LOOK_IMAGE_TYPES)) throw new Error("bad look image reference");
    return path.join(this.dir, `${sha256}.${type}`);
  }

  async save(bytes: Uint8Array, type: LookImageType): Promise<string> {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const target = this.file(sha256, type);
    if (!(await stat(target).then(() => true, () => false))) {
      await mkdir(this.dir, { recursive: true });
      const temp = `${target}.${randomUUID()}.tmp`;
      await writeFile(temp, bytes, { flag: "wx" });
      await rename(temp, target);
    }
    return sha256;
  }

  read(sha256: string, type: LookImageType): Promise<Buffer> {
    return readFile(this.file(sha256, type));
  }
}

/** GI_LOOKS_DIR, or `looks/` in the repo. */
export function loadLookStore(env: NodeJS.ProcessEnv = process.env): LookStore {
  const dir = env["GI_LOOKS_DIR"]?.trim();
  return new LookStore(dir ? path.resolve(dir) : path.join(REPO_ROOT, "looks"));
}
