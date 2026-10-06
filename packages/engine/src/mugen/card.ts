/**
 * The website's picture of an imported MUGEN character (`card.png` next to
 * its .def, served like our own fighters' pictures): the first frame of its
 * standing animation (action 0), from its own sprite file, in its first
 * colours (the .def's `pal1` .act file when it has one, else the sprite
 * file's palette), trimmed, and doubled when the character is drawn at the
 * old 320-wide resolution so it isn't tiny next to ours.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readAct, readSff, type ReadSff, type SffSprite } from "../art/sff.ts";
import { writePng } from "../art/png.ts";
import { bounds, crop, scale } from "../art/sheet.ts";
import { iniValue, parseIni } from "../roster/ini.ts";

/** The first frame of action 0 in an .air file: its sprite group and number. */
export function standSprite(air: string): [number, number] | undefined {
  const at = air.search(/\[\s*begin\s+action\s+0\s*\]/i);
  if (at < 0) return undefined;
  for (const raw of air.slice(at).split(/\r?\n/).slice(1)) {
    const line = raw.replace(/;.*$/, "").trim();
    if (/^\[/.test(line)) break;
    const m = /^(-?\d+)\s*,\s*(-?\d+)\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+/.exec(line);
    if (m) return [Number(m[1]), Number(m[2])];
  }
  return undefined;
}

/** The colours a sprite is drawn in: the .act palette for the character's own colours, else the sprite file's. */
function paletteOf(sff: ReadSff, sprite: SffSprite, act?: Uint8Array): Uint8Array {
  const own = sff.palettes[sprite.palette];
  const isMain = sff.version === 1 ? sprite.palette === 0 : own?.group === 1 && own.number === 1;
  return act && isMain ? act : own?.colors ?? new Uint8Array(768);
}

/** The picture as a PNG, or null when there's nothing to draw (no readable sprite file or stand sprite). */
export async function mugenCard(defFile: string): Promise<Buffer | null> {
  const dir = path.dirname(defFile);
  const def = parseIni(await readFile(defFile, "latin1"));
  const file = (key: string) => {
    const name = iniValue(def, "Files", key);
    return name && existsSync(path.join(dir, name)) ? path.join(dir, name) : undefined;
  };
  const sffFile = file("sprite");
  if (!sffFile) return null;
  let sff: ReadSff;
  try {
    sff = readSff(await readFile(sffFile));
  } catch {
    return null;
  }
  const airFile = file("anim");
  const [g, n] = (airFile && standSprite(await readFile(airFile, "latin1"))) || [0, 0];
  const sprite = sff.sprites.find((s) => s.group === g && s.number === n) ?? sff.sprites.find((s) => s.group === 0 && s.number === 0);
  if (!sprite) return null;
  const actFile = file("pal1");
  const act = actFile ? readAct(await readFile(actFile)) : undefined;
  const pal = paletteOf(sff, sprite, act);
  const b = bounds(sprite.image);
  if (!b) return null;
  let img = crop(sprite.image, b);
  const localcoord = Number((iniValue(def, "Info", "localcoord") ?? "320").split(",")[0]) || 320;
  if (localcoord <= 320) img = scale(img, img.width * 2, img.height * 2);
  const rgba = new Uint8Array(img.width * img.height * 4);
  img.pixels.forEach((v, i) => {
    if (v) rgba.set([pal[v * 3]!, pal[v * 3 + 1]!, pal[v * 3 + 2]!, 255], i * 4);
  });
  return writePng({ width: img.width, height: img.height, colorType: 6, pixels: rgba });
}
