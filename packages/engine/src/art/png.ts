/**
 * A small PNG reader and writer for the fighter art pipeline. Reading keeps
 * palette images as palette indices (the source sheets are 8-bit palette
 * PNGs, and IKEMEN sprites are palette sprites too), so colours are never
 * re-quantised. Handles 8-bit, non-interlaced PNGs of every colour type.
 */
import { crc32, deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export interface PngImage {
  width: number;
  height: number;
  /** 0 grey, 2 RGB, 3 palette, 4 grey+alpha, 6 RGBA. */
  colorType: 0 | 2 | 3 | 4 | 6;
  /** Unfiltered samples, row after row, `channels` bytes per pixel. */
  pixels: Uint8Array;
  /** Palette images: RGB triples. */
  palette?: Uint8Array;
  /** Palette images: alpha per palette entry (missing entries are opaque). */
  alpha?: Uint8Array;
}

export function channelsOf(colorType: number): number {
  const c = CHANNELS[colorType];
  if (!c) throw new Error(`unsupported PNG colour type ${colorType}`);
  return c;
}

export function readPng(bytes: Uint8Array): PngImage {
  if (bytes.length < 8 || !SIGNATURE.equals(Buffer.from(bytes.subarray(0, 8)))) throw new Error("not a PNG file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0, height = 0, depth = 0, colorType = -1, interlace = 0;
  let palette: Uint8Array | undefined;
  let alpha: Uint8Array | undefined;
  const data: Uint8Array[] = [];
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (body.length !== length) throw new Error(`PNG chunk ${kind} is cut short`);
    if (kind === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      depth = body[8]!;
      colorType = body[9]!;
      interlace = body[12]!;
    } else if (kind === "PLTE") palette = body;
    else if (kind === "tRNS") alpha = body;
    else if (kind === "IDAT") data.push(body);
    else if (kind === "IEND") break;
    offset += 12 + length;
  }
  const channels = channelsOf(colorType);
  if (depth !== 8) throw new Error(`unsupported PNG bit depth ${depth} (only 8)`);
  if (interlace !== 0) throw new Error("interlaced PNGs are not supported");
  if (width === 0 || height === 0) throw new Error("PNG has no pixels");
  if (colorType === 3 && !palette) throw new Error("palette PNG without a palette");
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) throw new Error("PNG image data is cut short");
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride);
    unfilter(filter, src, out, prev, channels);
  }
  return { width, height, colorType: colorType as PngImage["colorType"], pixels, palette, alpha };
}

function unfilter(filter: number, src: Uint8Array, out: Uint8Array, prev: Uint8Array, bpp: number): void {
  const n = src.length;
  switch (filter) {
    case 0:
      out.set(src);
      return;
    case 1:
      for (let x = 0; x < n; x++) out[x] = (src[x]! + (x >= bpp ? out[x - bpp]! : 0)) & 0xff;
      return;
    case 2:
      for (let x = 0; x < n; x++) out[x] = (src[x]! + prev[x]!) & 0xff;
      return;
    case 3:
      for (let x = 0; x < n; x++) out[x] = (src[x]! + (((x >= bpp ? out[x - bpp]! : 0) + prev[x]!) >> 1)) & 0xff;
      return;
    case 4:
      for (let x = 0; x < n; x++) {
        const a = x >= bpp ? out[x - bpp]! : 0;
        const b = prev[x]!;
        const c = x >= bpp ? prev[x - bpp]! : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        out[x] = (src[x]! + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      return;
    default:
      throw new Error(`bad PNG filter ${filter}`);
  }
}

function chunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])));
  return Buffer.concat([head, body, crc]);
}

/**
 * Encode a PNG. Rows use filter 0 (none) for palette images, which suits
 * palette indices, and filter 1 (sub) for colour images.
 */
export function writePng(img: PngImage): Buffer {
  const channels = channelsOf(img.colorType);
  const stride = img.width * channels;
  if (img.pixels.length !== img.height * stride) throw new Error("pixel data does not match the image size");
  if (img.colorType === 3 && (!img.palette || img.palette.length % 3 !== 0 || img.palette.length > 768)) {
    throw new Error("palette PNGs need 1-256 RGB palette entries");
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(img.width, 0);
  header.writeUInt32BE(img.height, 4);
  header[8] = 8;
  header[9] = img.colorType;
  const filter = img.colorType === 3 ? 0 : 1;
  const raw = Buffer.alloc(img.height * (stride + 1));
  for (let y = 0; y < img.height; y++) {
    const row = img.pixels.subarray(y * stride, (y + 1) * stride);
    const o = y * (stride + 1);
    raw[o] = filter;
    if (filter === 0) raw.set(row, o + 1);
    else for (let x = 0; x < stride; x++) raw[o + 1 + x] = (row[x]! - (x >= channels ? row[x - channels]! : 0)) & 0xff;
  }
  const parts = [SIGNATURE, chunk("IHDR", header)];
  if (img.palette) parts.push(chunk("PLTE", img.palette));
  if (img.alpha) parts.push(chunk("tRNS", img.alpha));
  parts.push(chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", new Uint8Array(0)));
  return Buffer.concat(parts);
}
