/**
 * A template's sprites and animations from its sprite sheet: every frame it
 * uses, cleaned and trimmed, with hurtboxes on every frame and hitboxes on
 * attack frames worked out from the pixels (art/clsn.ts). The same cell used
 * in several animations becomes one sprite.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { writeAir, type AirAction, type AirFrame, type Box } from "../art/air.ts";
import { effectHitbox, hitbox, hurtboxes } from "../art/clsn.ts";
import { gifSheet, readGif } from "../art/gif.ts";
import { EXPLOSION_BOX, EXPLOSION_HIT_ANIM } from "../mugen/gags.ts";
import { readSff, writeSff, type SffPalette, type SffSprite } from "../art/sff.ts";
import { bounds, crop, isCellSource, scale, sheetCells, type CellSource, type IndexedImage, type Sheet } from "../art/sheet.ts";
import { readPng, writePng } from "../art/png.ts";
import { PROJECTILE_COLORS, PROJECTILE_SLOTS, projectileArt } from "./projectile.ts";
import { cellList, checkSpec, ticksOf, type AnimSpec, type ArtSource, type HueShift, type TemplateSpec, type ThrowSpec } from "./spec.ts";
import { reservedGroups, standardSprites } from "./standard.ts";

export interface TemplateArt {
  sff: Buffer;
  air: string;
  /** Every animation as built, for previews and checks. */
  actions: AirAction[];
  /** Sprite slot → the sheet cell it came from. */
  slots: Map<string, number>;
  /** Where the frames came from. */
  source: CellSource;
}

export interface ArtOptions {
  /** The character's palettes; default the template's own colours and outfits (`templatePalettes`). */
  palettes?: readonly SffPalette[];
  /** Lifebar faces with their own palette (a community fighter's portrait); default cut from the portrait cell, in the character's colours. */
  portrait?: { small: IndexedImage; large: IndexedImage; palette: Uint8Array };
}

/** The frame without its effect colours (ArtSource.effects), for hurtboxes: only the body can be hit. */
function bodyOnly(img: IndexedImage, effects: ReadonlySet<number>): IndexedImage {
  return { ...img, pixels: img.pixels.map((v) => (effects.has(v) ? 0 : v)) };
}

/** Added to a fighter's own animation's sprite group when that group is a standard one (5000 hit high → sprites 15000,n). */
export const OWN_SPRITE_OFFSET = 10000;

/** A portrait's own palette, apart from the character's colours 1,1 to 1,n, so choosing a colour doesn't repaint it. */
export const PORTRAIT_PALETTE = { group: 9000, number: 0 } as const;

/** A template's frames: from its sprite sheet (cleaning its stray colours), or as given. */
export function cellsOf(spec: TemplateSpec, from: Sheet | CellSource): CellSource {
  return isCellSource(from) ? from : sheetCells(from, spec.art.stray);
}

/** Portrait sprites, square: 9000,0 is the small lifebar face, 9000,1 the large one. */
export const FACE_SIZES = { small: 42, large: 128 } as const;

export async function loadTemplateSheet(spec: TemplateSpec, file: string): Promise<Sheet> {
  return loadArtSheet(spec.art, file);
}

/** A sprite sheet (or a GIF laid out as one), checked against its checksum and grid. */
export async function loadArtSheet(art: ArtSource, file: string): Promise<Sheet> {
  const bytes = await readFile(file);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== art.sha256) throw new Error(`${file}: checksum ${sha} does not match ${art.sha256} (art/SOURCES.md)`);
  const { cellWidth, cellHeight, columns, rows } = art;
  // An animated GIF of every frame is laid out on the grid first, frame n in cell n.
  const png = /\.gif$/i.test(file) ? gifSheet(readGif(bytes), columns) : readPng(bytes);
  if (png.colorType !== 3 || !png.palette) throw new Error(`${file}: expected a palette PNG`);
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
  // The energy ball's slots, unless every projectile the fighter has brings its own art (whose colours are its sheet's).
  const ownArtOnly = spec.attacks.some((a) => a.projectile) && spec.attacks.every((a) => !a.projectile || a.projectile.art);
  const projectile = ownArtOnly ? {} : Object.fromEntries(PROJECTILE_SLOTS.map((slot, i) => [slot, PROJECTILE_COLORS[i]!]));
  const base = recolor(recolor(sheetPalette, projectile), spec.colors ?? {});
  return [{ group: 1, number: 1, colors: base }, ...spec.palettes.map((p, i) => ({ group: 1, number: i + 2, colors: recolor(shiftHues(base, p.shifts ?? []), p.colors) }))];
}

/** Palette `from` with each hue shift applied to the colours in its band (index 0, transparency, stays). */
export function shiftHues(from: Uint8Array, shifts: readonly HueShift[]): Uint8Array {
  const out = from.slice();
  for (let i = 1; i < out.length / 3; i++) {
    const [h, s, l] = rgbToHsl(out[i * 3]!, out[i * 3 + 1]!, out[i * 3 + 2]!);
    const shift = shifts.find(
      (x) =>
        s >= (x.minSat ?? 0.25) && s <= (x.maxSat ?? 1) && l >= (x.lights?.[0] ?? 0) && l <= (x.lights?.[1] ?? 1) && (x.from <= x.to ? h >= x.from && h <= x.to : h >= x.from || h <= x.to),
    );
    if (!shift) continue;
    const sat = shift.hue === null ? 0 : Math.min(1, Math.max(shift.tint ?? 0, s * (shift.sat ?? 1)));
    out.set(hslToRgb(shift.hue ?? h, sat, Math.min(1, l * (shift.light ?? 1))), i * 3);
  }
  return out;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d + 6) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
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
    { action: t.state + 22, frames: [{ group: 5030, number: 0, ticks: 8 }, { group: 5030, number: 20, ticks: -1 }], comment: `${t.name}: victim thrown (victim's sprites)` },
  ];
}

export function buildTemplateArt(spec: TemplateSpec, from: Sheet | CellSource, options: ArtOptions = {}): TemplateArt {
  const problems = checkSpec(spec);
  if (problems.length) throw new Error(`${spec.id}: ${problems.join("; ")}`);
  const axis = spec.art.axis;
  const effects = new Set(spec.art.effects ?? []);
  const source = cellsOf(spec, from);
  const cellImage = (i: number) => {
    const img = source.cell(i);
    if (!bounds(img)) throw new Error(`cell ${i} is empty`);
    return img;
  };
  const slotOfCell = new Map<number, [number, number]>();
  const slots = new Map<string, number>();
  // The fighter's own animations number their sprites after themselves, away from the standard groups other characters borrow.
  const standard = spec.art.standardSprites;
  const reserved = reservedGroups(standard);
  const hitFrames = new Map<number, Map<number, Box | undefined>>();
  for (const a of spec.attacks) {
    if (a.anim.action !== a.state) throw new Error(`${a.name}: its animation must use action ${a.state}`);
    if (a.projectile) continue; // the ball hits, not the body
    const frames = new Map<number, Box | undefined>();
    for (const h of a.hits) for (const f of h.frames) frames.set(f, h.box);
    hitFrames.set(a.state, frames);
  }
  for (const t of spec.throws ?? []) hitFrames.set(t.state, new Map(t.catchFrames.map((f) => [f, t.box])));

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
        slot = [reserved.has(anim.action) ? anim.action + OWN_SPRITE_OFFSET : anim.action, i];
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
        clsn2: hurtboxes(effects.size ? bodyOnly(img, effects) : img, axis).map(shift),
      };
      if (hits?.has(i)) {
        const opts = spec.art.pixel ? { minPixels: 20 * spec.art.pixel ** 2 } : {};
        const box = hits.get(i) ?? (spec.art.effectHits ? effectHitbox(img, reference, axis, effects, opts) : null) ?? hitbox(img, reference, axis, opts);
        if (!box) throw new Error(`action ${anim.action} frame ${i} (cell ${c}): nothing reaches out, so there is no hitbox; pick another frame or give a box`);
        frame.clsn1 = [shift(box)];
      }
      return frame;
    });
    for (const f of hits?.keys() ?? []) if (f >= list.length) throw new Error(`action ${anim.action}: hit frame ${f} is past the last frame`);
    actions.push({ action: anim.action, frames, loopStart: anim.loop === false ? undefined : anim.loop, comment: anim.comment ?? spec.attacks.find((a) => a.state === anim.action)?.name ?? spec.throws?.find((t) => t.state === anim.action)?.name });
  }
  // The explosion gag's hit: no picture, one big hitbox around the opponent (in this fighter's units).
  if (spec.gags?.includes("explosion")) {
    const k = spec.art.localcoord / 320;
    const box = EXPLOSION_BOX.map((v) => Math.round(v * k)) as unknown as Box;
    actions.push({ action: EXPLOSION_HIT_ANIM, comment: "explosion gag: the hit (no picture)", frames: [{ group: -1, number: 0, ticks: 30, clsn1: [box] }] });
    seen.add(EXPLOSION_HIT_ANIM);
  }
  const victims = (spec.throws ?? []).flatMap(victimActions);
  const projectiles = spec.attacks.filter((a) => a.projectile).map((a) => (a.projectile!.art ?? projectileArt)(a.state));
  const extra = spec.effectArt?.() ?? { sprites: [], actions: [] };
  for (const more of [...victims, ...projectiles.flatMap((p) => p.actions), ...extra.actions]) {
    if (seen.has(more.action)) throw new Error(`action ${more.action} is defined twice`);
    seen.add(more.action);
  }
  const sprites: SffSprite[] = [];
  for (const [key, c] of slots) {
    const [group, number] = key.split(",").map(Number) as [number, number];
    const img = cellImage(c);
    const b = bounds(img)!;
    sprites.push({ group, number, image: crop(img, b), axisX: axis.x - b.x0, axisY: axis.y - b.y0, palette: 0 });
  }
  // The standard get-hit sprites other characters' throws borrow (templates/standard.ts).
  sprites.push(...standardSprites(standard, cellImage, axis));
  const palettes = [...(options.palettes ?? templatePalettes(spec, source.palette))];
  if (options.portrait) {
    const own = palettes.push({ ...PORTRAIT_PALETTE, colors: options.portrait.palette }) - 1;
    sprites.push({ group: 9000, number: 0, image: options.portrait.small, axisX: 0, axisY: 0, palette: own });
    sprites.push({ group: 9000, number: 1, image: options.portrait.large, axisX: 0, axisY: 0, palette: own });
  } else {
    const portraitCell = cellImage(spec.portrait.cell);
    const [px0, py0, px1, py1] = spec.portrait.box ?? headBox(portraitCell);
    const face = crop(portraitCell, { x0: px0, y0: py0, x1: px1, y1: py1 });
    sprites.push({ group: 9000, number: 0, image: scale(face, FACE_SIZES.small, FACE_SIZES.small), axisX: 0, axisY: 0, palette: 0 });
    sprites.push({ group: 9000, number: 1, image: scale(face, FACE_SIZES.large, FACE_SIZES.large), axisX: 0, axisY: 0, palette: 0 });
  }

  const header = `${spec.name} (${spec.archetype}), a Greed Island fighter template. Generated by pnpm templates:build; do not edit.\n${spec.art.credit}`;
  for (const p of projectiles) sprites.push(...p.sprites);
  sprites.push(...extra.sprites);
  const sff = writeSff(sprites, palettes);
  return { sff, air: writeAir([...actions, ...victims, ...projectiles.flatMap((p) => p.actions), ...extra.actions], header), actions, slots, source };
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

/**
 * A picture of the fighter for the website (shop, profiles): its stance,
 * trimmed, in its main colours (or `palette`), as an RGBA PNG.
 */
export function cardImage(spec: TemplateSpec, from: Sheet | CellSource, palette?: Uint8Array): Buffer {
  const stand = spec.anims.find((a) => a.action === 0);
  if (!stand) throw new Error(`${spec.id}: no stand animation`);
  const source = cellsOf(spec, from);
  const img = source.cell(cellList(stand.cells)[0]!);
  const trimmed = crop(img, bounds(img)!);
  const pal = palette ?? templatePalettes(spec, source.palette)[0]!.colors;
  const rgba = new Uint8Array(trimmed.width * trimmed.height * 4);
  trimmed.pixels.forEach((v, i) => {
    if (v) rgba.set([pal[v * 3]!, pal[v * 3 + 1]!, pal[v * 3 + 2]!, 255], i * 4);
  });
  return writePng({ width: trimmed.width, height: trimmed.height, colorType: 6, pixels: rgba });
}

/** Sprites of a built file by slot, for previews. */
export function spritesBySlot(sff: Buffer): Map<string, SffSprite> {
  return new Map(readSff(sff).sprites.map((s) => [`${s.group},${s.number}`, s]));
}
