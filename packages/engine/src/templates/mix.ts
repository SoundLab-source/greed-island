/**
 * Mixing looks: a new fighter from one model's body with parts of other
 * models pasted on, frame by frame (TemplateSpec.looks). It works for sheets
 * drawn on the same layout (the Universal Prototype 2 sheet and the Bad
 * Company sheets: the same pose in the same cell), because each part can then
 * be taken from the same cell of its own sheet, scaled by the two models'
 * sizes (their localcoords) and aligned at the feet. Hair and caps sit on the
 * head in every pose this way; parts on the limbs (gloves) follow less well,
 * since the models' proportions differ.
 */
import type { CellSource, IndexedImage } from "../art/sheet.ts";
import type { ArtSource, LookPart } from "./spec.ts";

/** The first palette slot a mixed-in part's colours go to (the sheets use 1-72; 240-245 draw projectiles). */
export const MIX_FIRST_SLOT = 100;

export interface MixPart extends LookPart {
  /** The part model's cells (stray specks already cleaned). */
  cells: CellSource;
}

/** Where each part's palette indices go in the mixed palette: part i, index n → slot. */
export function mixSlots(parts: readonly LookPart[]): Map<number, number>[] {
  let next = MIX_FIRST_SLOT;
  return parts.map((p) => new Map(p.indices.map((n) => [n, next++])));
}

/** The base model's cells with the parts pasted on, in a palette that holds the parts' colours in their own slots. */
export function mixLooks(base: CellSource, baseArt: ArtSource, parts: readonly MixPart[]): CellSource {
  const slots = mixSlots(parts);
  const last = Math.max(MIX_FIRST_SLOT - 1, ...slots.flatMap((m) => [...m.values()]));
  if (last >= 240) throw new Error(`the mixed-in parts need ${last - MIX_FIRST_SLOT + 1} palette slots, more than fit below 240`);
  const palette = base.palette.slice();
  parts.forEach((p, i) => {
    for (const [from, to] of slots[i]!) palette.set(p.cells.palette.subarray(from * 3, from * 3 + 3), to * 3);
  });
  const cache = new Map<number, IndexedImage>();
  return {
    palette,
    cellWidth: base.cellWidth,
    cellHeight: base.cellHeight,
    cell(index) {
      let img = cache.get(index);
      if (img) return img;
      const own = base.cell(index);
      const pixels = own.pixels.slice();
      parts.forEach((p, i) => {
        const src = p.cells.cell(index);
        // Part pixels per base pixel: the part model drawn at the base model's size, its feet on the base's feet.
        const k = baseArt.localcoord / p.art.localcoord;
        const dx = p.nudge?.x ?? 0, dy = p.nudge?.y ?? 0;
        const map = slots[i]!;
        for (let y = 0; y < own.height; y++) {
          const sy = Math.round((y - baseArt.axis.y - dy) / k + p.art.axis.y);
          if (sy < 0 || sy >= src.height) continue;
          for (let x = 0; x < own.width; x++) {
            const sx = Math.round((x - baseArt.axis.x - dx) / k + p.art.axis.x);
            if (sx < 0 || sx >= src.width) continue;
            const to = map.get(src.pixels[sy * src.width + sx]!);
            if (to !== undefined) pixels[y * own.width + x] = to;
          }
        }
      });
      img = { width: own.width, height: own.height, pixels };
      cache.set(index, img);
      return img;
    },
  };
}
