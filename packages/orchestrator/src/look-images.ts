/**
 * NFT look images (docs/PHASE3.md "NFTs as fighters"): what kind of image a
 * download is (from its bytes), reading a PNG's colours, and
 * where images are kept: outside git in GI_LOOKS_DIR (default `looks/`,
 * gitignored) as <sha256>.<type>, so a look keeps its image even if the NFT's
 * own address goes away.
 */
import { REPO_ROOT } from "@greed-island/db";
import { readPng, toRgba } from "@greed-island/engine";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

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
 * Decode a PNG to RGBA pixels (any PNG the engine's reader takes), up to
 * `maxPixels`; anything else (or a damaged file) gives null. Enough to read an
 * NFT's colours.
 */
export function decodePng(bytes: Uint8Array, maxPixels = 2048 * 2048): { width: number; height: number; rgba: Uint8Array } | null {
  try {
    if (sniffImage(bytes) !== "png" || bytes.length < 24) return null;
    // The size is in the header chunk, which comes first: check it before inflating anything.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(16) * view.getUint32(20) > maxPixels) return null;
    const img = readPng(bytes);
    return { width: img.width, height: img.height, rgba: toRgba(img) };
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
