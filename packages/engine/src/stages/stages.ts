/**
 * Greed Island's own stages (docs/MVP.md): backgrounds drawn in code, so
 * the art is ours and cleared for commercial use. Each stage is a few
 * layers (sky, far and near scenery, the floor) on IKEMEN's 1280 x 720
 * stage space, like the bundled stage0-720.def. `pnpm stages:build` writes
 * them into $IKEMEN_DIR/stages/.
 */
import { writeSff, type SffPalette, type SffSprite } from "../art/sff.ts";
import { floorTiles, hex, ridge, rng, silhouette, skyline } from "./draw.ts";
import { DRAGONS_HOARD } from "./dragons-hoard.ts";
import { GOLD_RUSH } from "./gold-rush.ts";
import { disc, floor, GROUND, HEIGHT, scenery, sky, stars, WIDE, WIDTH, type Layer, type StageDesign } from "./layers.ts";
import { MINT } from "./mint.ts";
import { PAWN_ALLEY } from "./pawn-alley.ts";
import { PENTHOUSE } from "./penthouse.ts";
import { TRADING_FLOOR } from "./trading-floor.ts";
import { TREASURE_ISLAND } from "./treasure-island.ts";
import { VAULT } from "./vault.ts";

export { GROUND, HEIGHT, WIDE, WIDTH, type Layer, type StageDesign } from "./layers.ts";

export const STAGES: readonly StageDesign[] = [
  {
    id: "gi-dusk-peaks",
    name: "Dusk Peaks",
    draw: () => [
      sky([[0, "#160c2e"], [0.45, "#5a2357"], [0.72, "#c4504a"], [0.86, "#f09a52"], [1, "#f6c27a"]], (c) => {
        stars(c, 3, 140, "#d9c6ff", 220);
        disc(c, 860, 470, 70, "#fff1c4", "#f2a65a");
      }),
      scenery(300, 330, [0.15, 0.08], (c) => silhouette(c, 160, ridge(WIDE, 11, [[3, 70], [7, 30], [17, 12]]), hex("#5b2a55"), hex("#8a4a6a"))),
      scenery(260, 400, [0.35, 0.15], (c) => silhouette(c, 150, ridge(WIDE, 12, [[4, 60], [11, 25], [29, 8]]), hex("#2c1430"), hex("#4b2440"))),
      floor((c) => floorTiles(c, 21, { colors: [hex("#5a4a63"), hex("#544560"), hex("#61506a")], seam: hex("#2e2335"), tileWidth: 96, rows: [20, 28, 36, 46] })),
    ],
  },
  {
    id: "gi-neon-harbor",
    name: "Neon Harbor",
    draw: () => [
      sky([[0, "#03040c"], [0.6, "#0c1430"], [0.85, "#1f1d4a"], [1, "#3a1f52"]], (c) => {
        stars(c, 5, 220, "#b9c6ff", 300);
        disc(c, 300, 140, 34, "#f4f1e0", "#c9c2a6");
      }),
      scenery(320, 300, [0.18, 0.08], (c) => skyline(c, 31, { baseline: 320, minH: 120, maxH: 280, body: hex("#0b1230"), windows: [hex("#3b4c8a"), hex("#4a3b7a")], lit: 0.35, dark: hex("#0e1638") })),
      scenery(300, 330, [0.4, 0.15], (c) => skyline(c, 32, { baseline: 300, minH: 90, maxH: 240, body: hex("#060918"), windows: [hex("#ffd75e"), hex("#5ef2ff"), hex("#ff5ec8")], lit: 0.28, dark: hex("#0a0f24") })),
      floor((c) => {
        floorTiles(c, 41, { colors: [hex("#1d2230"), hex("#20263a"), hex("#1a1f2c")], seam: hex("#0c0f18"), tileWidth: 128, rows: [22, 30, 40, 48] });
        c.fill(0, 0, c.width, 3, hex("#5ef2ff"));
      }),
    ],
  },
  {
    id: "gi-jade-valley",
    name: "Jade Valley",
    draw: () => [
      sky([[0, "#3d8ee6"], [0.55, "#86c3f2"], [0.85, "#d6eefc"], [1, "#eef8ff"]], (c) => {
        const r = rng(7);
        for (let i = 0; i < 9; i++) {
          const cx = Math.floor(r() * WIDTH), cy = 60 + Math.floor(r() * 220), w = 60 + Math.floor(r() * 90);
          for (let k = 0; k < 4; k++) disc(c, cx + (k - 1.5) * w * 0.35, cy + (k % 2) * 8, Math.floor(w * 0.28), "#ffffff", "#e3f1fb");
        }
      }),
      scenery(320, 300, [0.15, 0.08], (c) => silhouette(c, 190, ridge(WIDE, 51, [[2, 80], [6, 35], [15, 10]]), hex("#86b39a"), hex("#a6cdb6"))),
      scenery(280, 380, [0.38, 0.15], (c) => {
        const line = ridge(WIDE, 52, [[3, 50], [9, 20], [23, 6]]);
        silhouette(c, 170, line, hex("#3f7a52"), hex("#5c9a6b"));
        const r = rng(53);
        for (let x = 0; x < WIDE; x += 18 + Math.floor(r() * 40)) {
          const base = Math.round(170 - line(x)), h = 30 + Math.floor(r() * 40);
          for (let y = 0; y < h; y++) {
            const half = Math.floor((y / h) * 12);
            c.fill(x - half, base - h + y, x + half + 1, base - h + y + 1, hex(y % 6 < 3 ? "#2c5c3c" : "#336b45"));
          }
        }
      }),
      floor((c) => floorTiles(c, 61, { colors: [hex("#8a5a35"), hex("#82542f"), hex("#93623b")], seam: hex("#4a2e18"), tileWidth: 160, rows: [18, 26, 34, 44] })),
    ],
  },
  // Greed Island's own places (2026-10-08): richer, with moving parts and light.
  TREASURE_ISLAND,
  VAULT,
  TRADING_FLOOR,
  GOLD_RUSH,
  MINT,
  DRAGONS_HOARD,
  PENTHOUSE,
  PAWN_ALLEY,
];

/** The stage's sprite file and .def for IKEMEN. */
export function stageFiles(design: StageDesign): { sff: Buffer; def: string } {
  const layers = design.draw();
  const sprites: SffSprite[] = [];
  const palettes: SffPalette[] = [];
  const actions: string[] = [];
  layers.forEach((l, i) => {
    [l.canvas, ...(l.frames ?? [])].forEach((frame, k) => {
      if (frame.width !== l.canvas.width || frame.height !== l.canvas.height) throw new Error(`${design.id}: layer ${i}'s frames aren't all one size`);
      palettes.push({ group: 1, number: palettes.length + 1, colors: frame.palette() });
      sprites.push({ group: i, number: k, image: frame.image(), axisX: Math.floor(frame.width / 2), axisY: 0, palette: palettes.length - 1 });
    });
    if (l.frames?.length) actions.push(`[Begin Action ${100 + i}]\n${[l.canvas, ...l.frames].map((_, k) => `${i},${k}, 0,0, ${l.ticks ?? 8}`).join("\n")}\n`);
  });
  const bgs = layers.map((l, i) =>
    [
      `[BG ${i}]`,
      ...(l.frames?.length ? ["type = anim", `actionno = ${100 + i}`] : ["type = normal", `spriteno = ${i}, 0`]),
      "layerno = 0",
      `start = ${l.x ?? 0}, ${l.y}`,
      `delta = ${l.delta[0]}, ${l.delta[1]}`,
      `mask = ${i === 0 ? 0 : 1}`,
      `tile = ${l.tile ? 1 : 0}, ${l.tileY ? 1 : 0}`,
      ...(l.tileSpacing ? [`tilespacing = ${l.tileSpacing}, 0`] : []),
      ...(l.velocity ? [`velocity = ${l.velocity[0]}, ${l.velocity[1]}`] : []),
      ...(l.sway ? [`sin.x = ${l.sway[0]}, ${l.sway[1]}, 0`] : []),
      ...(l.bob ? [`sin.y = ${l.bob[0]}, ${l.bob[1]}, 0`] : []),
      ...(l.light ? ["trans = add"] : []),
      "",
    ].join("\n"),
  );
  const def = `; ${design.name}: a Greed Island stage, drawn in code (packages/engine/src/stages). Generated by pnpm stages:build; do not edit.
[Info]
name = "${design.name}"
displayname = "${design.name}"
versiondate = 10,01,2026
mugenversion = 1.1
author = "Greed Island"

[Camera]
startx = 0
starty = 0
boundleft = -400
boundright = 400
boundhigh = -300
boundlow = 0
verticalfollow = .2
floortension = 100
tension = 120
overdrawhigh = 0
overdrawlow = 0
cuthigh = 0
cutlow = 0

[PlayerInfo]
p1startx = -280
p1starty = 0
p1facing = 1
p2startx = 280
p2starty = 0
p2facing = -1
leftbound = -4000
rightbound = 4000

[Bound]
screenleft = 60
screenright = 60

[StageInfo]
zoffset = ${GROUND}
autoturn = 1
resetBG = 1
localcoord = ${WIDTH}, ${HEIGHT}
xscale = 1
yscale = 1

[Shadow]
intensity = 96
color = 0,0,0
yscale = .3
fade.range = 0,0

[Reflection]
intensity = 0

[Music]
bgmusic =
bgmvolume = 100

[BGdef]
spr = ${design.id}.sff
debugbg = 0

${bgs.join("\n")}
${actions.join("\n")}`;
  return { sff: writeSff(sprites, palettes), def };
}

/** What the camera sees at the start of a round (the first frame of anything animated, light added on), as RGBA. */
export function stagePreview(layers: readonly Layer[]): Uint8Array {
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
  for (const l of layers) {
    const pal = l.canvas.palette();
    const left = Math.floor(l.canvas.width / 2 - WIDTH / 2 - (l.x ?? 0));
    for (let y = 0; y < l.canvas.height && l.y + y < HEIGHT; y++) {
      if (l.y + y < 0) continue;
      for (let x = 0; x < WIDTH; x++) {
        let cx = x + left;
        if (l.tile) {
          const period = l.tileSpacing ?? l.canvas.width;
          cx = ((cx % period) + period) % period;
        }
        if (cx < 0 || cx >= l.canvas.width) continue;
        const v = l.canvas.pixels[y * l.canvas.width + cx]!;
        if (!v) continue;
        const at = ((l.y + y) * WIDTH + x) * 4;
        const rgb = [pal[v * 3]!, pal[v * 3 + 1]!, pal[v * 3 + 2]!];
        if (l.light) rgba.set(rgb.map((ch, k) => Math.min(255, ch + rgba[at + k]!)), at);
        else rgba.set(rgb, at);
        rgba[at + 3] = 255;
      }
    }
  }
  return rgba;
}
