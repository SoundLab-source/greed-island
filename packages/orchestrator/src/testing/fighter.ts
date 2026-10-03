// Test helper: a minimal character of ours in an engine folder (chars/<dir>/): a .def and an SFF with a
// stance sprite (0,0) drawn in two shades of one colour, and colours 1 (red) and 2 (blue).
import { writeSff } from "@greed-island/engine";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeTestFighter(ikemenDir: string, dir: string): Promise<string> {
  const W = 12, H = 20;
  const pixels = new Uint8Array(W * H);
  for (let y = 2; y < H - 1; y++) for (let x = 2; x < W - 2; x++) pixels[y * W + x] = x < W / 2 ? 1 : 2;
  const palette = (r: number, g: number, b: number) => {
    const colors = new Uint8Array(768);
    colors.set([r, g, b, Math.round(r * 0.6), Math.round(g * 0.6), Math.round(b * 0.6)], 3);
    return colors;
  };
  const sff = writeSff([{ group: 0, number: 0, image: { width: W, height: H, pixels }, axisX: 6, axisY: 19, palette: 0 }], [
    { group: 1, number: 1, colors: palette(220, 40, 40) },
    { group: 1, number: 2, colors: palette(40, 60, 220) },
  ]);
  const def = ["[Info]", `name = "${dir}"`, "pal.defaults = 1,2", "", "[Files]", "cmd = gi.cmd", "cns = gi.cns", "st = gi-states.cns", "stcommon = common1.cns", "sprite = gi.sff", "anim = gi.air", ""].join("\n");
  await mkdir(path.join(ikemenDir, "chars", dir), { recursive: true });
  await writeFile(path.join(ikemenDir, "chars", dir, `${dir}.def`), def, "latin1");
  await writeFile(path.join(ikemenDir, "chars", dir, "gi.sff"), sff);
  return `chars/${dir}/${dir}.def`;
}
