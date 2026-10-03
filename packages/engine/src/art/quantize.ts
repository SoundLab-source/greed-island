/** Reducing a picture's colours to a palette (drawn sheets, portraits, NFT looks). Pure. */

/**
 * At most `max` colours (median cut, weighted by how often each colour is
 * used): the palette, and each colour's palette position. Colours are RGB
 * numbers (0xRRGGBB).
 */
export function quantize(counts: ReadonlyMap<number, number>, max: number): { palette: number[]; index: Map<number, number> } {
  const colors = [...counts.keys()];
  if (colors.length <= max) {
    const palette = colors.sort((a, b) => counts.get(b)! - counts.get(a)! || a - b);
    return { palette, index: new Map(palette.map((c, i) => [c, i])) };
  }
  const ch = (c: number, k: number) => (c >> (16 - 8 * k)) & 255;
  type Box = { colors: number[]; spread: number; channel: number };
  const measure = (list: number[]): Box => {
    let best = 0, channel = 0;
    for (let k = 0; k < 3; k++) {
      let lo = 255, hi = 0;
      for (const c of list) {
        const v = ch(c, k);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > best) [best, channel] = [hi - lo, k];
    }
    return { colors: list, spread: best, channel };
  };
  const boxes: Box[] = [measure(colors)];
  while (boxes.length < max) {
    let at = -1;
    for (let i = 0; i < boxes.length; i++) if (boxes[i]!.colors.length > 1 && (at < 0 || boxes[i]!.spread > boxes[at]!.spread)) at = i;
    if (at < 0 || boxes[at]!.spread === 0) break;
    const box = boxes[at]!;
    const sorted = [...box.colors].sort((a, b) => ch(a, box.channel) - ch(b, box.channel));
    const total = sorted.reduce((s, c) => s + counts.get(c)!, 0);
    let acc = 0, cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += counts.get(sorted[i]!)!;
      cut = i + 1;
      if (acc * 2 >= total) break;
    }
    boxes.splice(at, 1, measure(sorted.slice(0, cut)), measure(sorted.slice(cut)));
  }
  const palette: number[] = [];
  const index = new Map<number, number>();
  for (const box of boxes) {
    let r = 0, g = 0, b = 0, w = 0;
    for (const c of box.colors) {
      const k = counts.get(c)!;
      r += ch(c, 0) * k;
      g += ch(c, 1) * k;
      b += ch(c, 2) * k;
      w += k;
    }
    for (const c of box.colors) index.set(c, palette.length);
    palette.push((Math.round(r / w) << 16) | (Math.round(g / w) << 8) | Math.round(b / w));
  }
  return { palette, index };
}
