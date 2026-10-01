/**
 * A template's sprites and animations from its sprite sheet: every frame it
 * uses, cleaned and trimmed, with hurtboxes on every frame and hitboxes on
 * attack frames worked out from the pixels (art/clsn.ts). The same cell used
 * in several animations becomes one sprite.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { writeAir, type AirAction, type AirFrame, type Box } from "../art/air.ts";
import { hitbox, hurtboxes } from "../art/clsn.ts";
import { readSff, writeSff, type SffPalette, type SffSprite } from "../art/sff.ts";
import { bounds, cell, cleanStrays, crop, scale, type IndexedImage, type Sheet } from "../art/sheet.ts";
import { readPng } from "../art/png.ts";
import { PROJECTILE_COLORS, PROJECTILE_SLOTS, projectileArt } from "./projectile.ts";
import { cellList, checkSpec, ticksOf, type AnimSpec, type TemplateSpec, type ThrowSpec } from "./spec.ts";

export interface TemplateArt {
  sff: Buffer;
  air: string;
  /** Every animation as built, for previews and checks. */
  actions: AirAction[];
  /** Sprite slot → the sheet cell it came from. */
  slots: Map<string, number>;
  sheet: Sheet;
}

/** Portrait sprites: 9000,0 is the small lifebar face, 9000,1 the large one. */
const FACE = 42;
const LARGE_FACE = 128;

export async function loadTemplateSheet(spec: TemplateSpec, file: string): Promise<Sheet> {
  const bytes = await readFile(file);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== spec.art.sha256) throw new Error(`${file}: checksum ${sha} does not match ${spec.art.sha256} (art/SOURCES.md)`);
  const png = readPng(bytes);
  if (png.colorType !== 3 || !png.palette) throw new Error(`${file}: expected a palette PNG`);
  const { cellWidth, cellHeight, columns, rows } = spec.art;
  if (png.width !== cellWidth * columns || png.height !== cellHeight * rows) throw new Error(`${file}: size does not match the grid`);
  const palette = new Uint8Array(768);
  palette.set(png.palette.subarray(0, 768));
  return { width: png.width, height: png.height, pixels: png.pixels, palette, cellWidth, cellHeight, columns, rows };
}

function hex(c: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  if (!m) throw new Error(`bad colour ${c}`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

export function templatePalettes(spec: TemplateSpec, sheetPalette: Uint8Array): SffPalette[] {
  const recolor = (from: Uint8Array, colors: Readonly<Record<number, string>>) => {
    const out = from.slice();
    for (const [index, color] of Object.entries(colors)) out.set(hex(color), Number(index) * 3);
    return out;
  };
  const projectile = Object.fromEntries(PROJECTILE_SLOTS.map((slot, i) => [slot, PROJECTILE_COLORS[i]!]));
  const base = recolor(recolor(sheetPalette, projectile), spec.colors ?? {});
  return [{ group: 1, number: 1, colors: base }, ...spec.palettes.map((p, i) => ({ group: 1, number: i + 2, colors: recolor(base, p.colors) }))];
}

/** The thrower's two animations of a throw: the reach (action `state`) and the hold (action `state + 10`). */
export function throwAnims(t: ThrowSpec): AnimSpec[] {
  return [t.reach, { action: t.state + 10, cells: t.hold.map((h) => h.cell), ticks: t.hold.map((h) => h.ticks), comment: `${t.name}: hold and throw` }];
}

export function allAnims(spec: TemplateSpec): AnimSpec[] {
  return [...spec.anims, ...spec.attacks.map((a) => a.anim), ...(spec.throws ?? []).flatMap(throwAnims)];
}

/**
 * The victim's animations in a throw use the victim's own sprites, by
 * MUGEN's standard get-hit numbers (every character has them): doubled over
 * while held, knocked back while lifted and thrown, then falling.
 */
export function victimActions(t: ThrowSpec): AirAction[] {
  return [
    { action: t.state + 20, frames: [{ group: 5010, number: 0, ticks: -1 }], comment: `${t.name}: victim held (victim's sprites)` },
    { action: t.state + 21, frames: [{ group: 5030, number: 0, ticks: -1 }], comment: `${t.name}: victim lifted (victim's sprites)` },
    { action: t.state + 22, frames: [{ group: 5030, number: 0, ticks: 8 }, { group: 5060, number: 0, ticks: -1 }], comment: `${t.name}: victim thrown (victim's sprites)` },
  ];
}

export function buildTemplateArt(spec: TemplateSpec, sheet: Sheet): TemplateArt {
  const problems = checkSpec(spec);
  if (problems.length) throw new Error(`${spec.id}: ${problems.join("; ")}`);
  const axis = spec.art.axis;
  const stray = new Set(spec.art.stray);
  const cells = new Map<number, IndexedImage>();
  const cellImage = (i: number) => {
    let img = cells.get(i);
    if (!img) {
      img = cleanStrays(cell(sheet, i), stray);
      if (!bounds(img)) throw new Error(`cell ${i} is empty`);
      cells.set(i, img);
    }
    return img;
  };
  const slotOfCell = new Map<number, [number, number]>();
  const slots = new Map<string, number>();
  const hitFrames = new Map<number, Map<number, Box | undefined>>();
  for (const a of spec.attacks) {
    if (a.anim.action !== a.state) throw new Error(`${a.name}: its animation must use action ${a.state}`);
    if (a.projectile) continue; // the ball hits, not the body
    const frames = new Map<number, Box | undefined>();
    for (const h of a.hits) for (const f of h.frames) frames.set(f, h.box);
    hitFrames.set(a.state, frames);
  }
  for (const t of spec.throws ?? []) hitFrames.set(t.state, new Map(t.catchFrames.map((f) => [f, undefined])));

  const actions: AirAction[] = [];
  const seen = new Set<number>();
  for (const anim of allAnims(spec)) {
    if (seen.has(anim.action)) throw new Error(`action ${anim.action} is defined twice`);
    seen.add(anim.action);
    const list = cellList(anim.cells);
    if (list.length === 0) throw new Error(`action ${anim.action} has no cells`);
    const reference = cellImage(list[0]!);
    const hits = hitFrames.get(anim.action);
    const frames: AirFrame[] = list.map((c, i) => {
      let slot = slotOfCell.get(c);
      if (!slot) {
        slot = [anim.action, i];
        slotOfCell.set(c, slot);
        slots.set(`${slot[0]},${slot[1]}`, c);
      }
      const img = cellImage(c);
      const last = i === list.length - 1;
      const dy = anim.anchor === "feet" ? axis.y - bounds(img)!.y1 : 0;
      const shift = (b: Box): Box => [b[0], b[1] + dy, b[2], b[3] + dy];
      const frame: AirFrame = {
        group: slot[0],
        number: slot[1],
        y: dy,
        ticks: last && anim.loop === false ? -1 : ticksOf(anim, i),
        clsn2: hurtboxes(img, axis).map(shift),
      };
      if (hits?.has(i)) {
        const box = hits.get(i) ?? hitbox(img, reference, axis);
        if (!box) throw new Error(`action ${anim.action} frame ${i} (cell ${c}): nothing reaches out, so there is no hitbox; pick another frame or give a box`);
        frame.clsn1 = [shift(box)];
      }
      return frame;
    });
    for (const f of hits?.keys() ?? []) if (f >= list.length) throw new Error(`action ${anim.action}: hit frame ${f} is past the last frame`);
    actions.push({ action: anim.action, frames, loopStart: anim.loop === false ? undefined : anim.loop, comment: anim.comment ?? spec.attacks.find((a) => a.state === anim.action)?.name ?? spec.throws?.find((t) => t.state === anim.action)?.name });
  }
  const victims = (spec.throws ?? []).flatMap(victimActions);
  const projectiles = spec.attacks.filter((a) => a.projectile).map((a) => projectileArt(a.state));
  for (const extra of [...victims, ...projectiles.flatMap((p) => p.actions)]) {
    if (seen.has(extra.action)) throw new Error(`action ${extra.action} is defined twice`);
    seen.add(extra.action);
  }
  const sprites: SffSprite[] = [];
  for (const [key, c] of slots) {
    const [group, number] = key.split(",").map(Number) as [number, number];
    const img = cellImage(c);
    const b = bounds(img)!;
    sprites.push({ group, number, image: crop(img, b), axisX: axis.x - b.x0, axisY: axis.y - b.y0, palette: 0 });
  }
  // Standard get-hit sprites for other characters' throws, unless a slot already has that number.
  for (const [key, entry] of Object.entries(spec.art.standardSprites)) {
    if (slots.has(key)) continue;
    const [group, number] = key.split(",").map(Number) as [number, number];
    const { cell: c, anchor } = typeof entry === "number" ? { cell: entry, anchor: undefined } : entry;
    const img = cellImage(c);
    const b = bounds(img)!;
    sprites.push({ group, number, image: crop(img, b), axisX: axis.x - b.x0, axisY: anchor === "feet" ? b.y1 - b.y0 : axis.y - b.y0, palette: 0 });
  }
  const portraitCell = cellImage(spec.portrait.cell);
  const [px0, py0, px1, py1] = spec.portrait.box ?? headBox(portraitCell);
  const face = crop(portraitCell, { x0: px0, y0: py0, x1: px1, y1: py1 });
  sprites.push({ group: 9000, number: 0, image: scale(face, FACE, FACE), axisX: 0, axisY: 0, palette: 0 });
  sprites.push({ group: 9000, number: 1, image: scale(face, LARGE_FACE, LARGE_FACE), axisX: 0, axisY: 0, palette: 0 });

  const header = `${spec.name} (${spec.archetype}), a Greed Island fighter template. Generated by pnpm templates:build; do not edit.\n${spec.art.credit}`;
  for (const p of projectiles) sprites.push(...p.sprites);
  const sff = writeSff(sprites, templatePalettes(spec, sheet.palette));
  return { sff, air: writeAir([...actions, ...victims, ...projectiles.flatMap((p) => p.actions)], header), actions, slots, sheet };
}

/**
 * A square around the head: the top of the drawn pixels, centred on the
 * middle of the top rows (the head), 64 pixels a side, kept inside the cell.
 */
export function headBox(img: IndexedImage, side = 64): [number, number, number, number] {
  const b = bounds(img);
  if (!b) throw new Error("empty portrait cell");
  let sum = 0, count = 0;
  for (let y = b.y0; y < Math.min(b.y1, b.y0 + 20); y++) {
    for (let x = 0; x < img.width; x++) if (img.pixels[y * img.width + x] !== 0) { sum += x; count++; }
  }
  const cx = Math.round(sum / count);
  const x0 = Math.max(0, Math.min(img.width - side, cx - side / 2));
  const y0 = Math.max(0, Math.min(img.height - side, b.y0 - 4));
  return [x0, y0, x0 + side, y0 + side];
}

/** Sprites of a built file by slot, for previews. */
export function spritesBySlot(sff: Buffer): Map<string, SffSprite> {
  return new Map(readSff(sff).sprites.map((s) => [`${s.group},${s.number}`, s]));
}
