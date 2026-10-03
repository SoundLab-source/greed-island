/**
 * A small PNG reader and writer for the fighter art pipeline. Reading keeps
 * palette images as palette indices (the source sheets are 8-bit palette
 * PNGs, and IKEMEN sprites are palette sprites too), so colours are never
 * re-quantised. Reads every standard PNG: all colour types and bit depths
 * (samples come back as 8 bits; 16-bit keeps the high byte, palette indices
 * stay indices), interlaced or not, and a transparent colour (tRNS) on a grey
 * or RGB image comes back as an alpha channel.
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

/** Bit depths each colour type may use. */
const DEPTHS: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };

/** Adam7 interlacing: each pass's first column and row, and its steps. */
const ADAM7 = [
  [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
] as const;

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
  if (!DEPTHS[colorType]!.includes(depth)) throw new Error(`unsupported PNG bit depth ${depth} for colour type ${colorType}`);
  if (interlace > 1) throw new Error(`unknown PNG interlace method ${interlace}`);
  if (width === 0 || height === 0) throw new Error("PNG has no pixels");
  if (colorType === 3 && !palette) throw new Error("palette PNG without a palette");
  const raw = inflateSync(Buffer.concat(data));
  // A transparent colour on a grey or RGB image: its raw samples (16 bits each in the chunk).
  const key = (colorType === 0 || colorType === 2) && alpha && alpha.length >= channels * 2 ? Array.from({ length: channels }, (_, c) => (alpha![c * 2]! << 8) | alpha![c * 2 + 1]!) : null;

  if (depth === 8 && !interlace && !key) {
    // The usual case, unfiltered straight into place.
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

  const bits = channels * depth;
  const outChannels = key ? channels + 1 : channels;
  const pixels = new Uint8Array(width * height * outChannels);
  const max = (1 << depth) - 1;
  // One raw sample (16-bit as is), and as 8 bits.
  const sampleAt = (row: Uint8Array, k: number) =>
    depth === 16 ? (row[k * 2]! << 8) | row[k * 2 + 1]! : depth === 8 ? row[k]! : (row[(k * depth) >> 3]! >> (8 - depth - ((k * depth) & 7))) & max;
  const to8 = (v: number) => (depth === 16 ? v >> 8 : depth === 8 || colorType === 3 ? v : Math.round((v * 255) / max));
  let pos = 0;
  for (const [x0, y0, dx, dy] of interlace ? ADAM7 : ([[0, 0, 1, 1]] as const)) {
    const pw = Math.ceil((width - x0) / dx), ph = Math.ceil((height - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const stride = Math.ceil((pw * bits) / 8);
    if (raw.length < pos + ph * (stride + 1)) throw new Error("PNG image data is cut short");
    let prev = new Uint8Array(stride);
    for (let r = 0; r < ph; r++) {
      const row = new Uint8Array(stride);
      unfilter(raw[pos]!, raw.subarray(pos + 1, pos + 1 + stride), row, prev, Math.max(1, bits >> 3));
      pos += stride + 1;
      prev = row;
      const y = y0 + r * dy;
      for (let i = 0; i < pw; i++) {
        const o = (y * width + x0 + i * dx) * outChannels;
        let keyed = !!key;
        for (let c = 0; c < channels; c++) {
          const v = sampleAt(row, i * channels + c);
          if (key && v !== key[c]) keyed = false;
          pixels[o + c] = to8(v);
        }
        if (key) pixels[o + channels] = keyed ? 0 : 255;
      }
    }
  }
  if (key) return { width, height, colorType: colorType === 0 ? 4 : 6, pixels };
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

/** Any PNG as RGBA samples. */
export function toRgba(png: PngImage): Uint8Array {
  const n = png.width * png.height;
  const p = png.pixels;
  if (png.colorType === 6) return p;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    switch (png.colorType) {
      case 0:
        out.set([p[i]!, p[i]!, p[i]!, 255], i * 4);
        break;
      case 2:
        out.set([p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!, 255], i * 4);
        break;
      case 3: {
        const v = p[i]!;
        out.set([png.palette?.[v * 3] ?? 0, png.palette?.[v * 3 + 1] ?? 0, png.palette?.[v * 3 + 2] ?? 0, png.alpha?.[v] ?? 255], i * 4);
        break;
      }
      case 4:
        out.set([p[i * 2]!, p[i * 2]!, p[i * 2]!, p[i * 2 + 1]!], i * 4);
        break;
    }
  }
  return out;
}
