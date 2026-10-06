/**
 * The Universal Prototype sprite sheet (Puffolotti, CC0; art/SOURCES.md) and
 * the animations every template shares: movement, guarding, getting hit,
 * falling and getting up. Cell numbers count left to right, top to bottom on
 * the 40 x 80 grid (3,194 frames of one fighter model).
 *
 * The frame catalogue behind these choices (cell ranges):
 *   0-12 walk (upright) · 14-21 boxer guard · 22-26 raised fist · 27-29 point
 *   38-49 creeping walk · 54-61 arms over head (guard) · 62-67 hit, leaning back
 *   68-76 hit in the stomach · 77-84 knocked down, lying · 85-87 thrown overhead
 *   88-91 face-down fall · 92-104 fall flat, bounce, lie · 105-116 stiff fall to lying
 *   117-126 roll back up to standing · 144-149 tired · 155-160 run · 161-165 crouch down
 *   166-179 guarded walk · 180-184 boxer stance · 185-191 tuck jump and flip
 *   192-200 jump (crouch, rise, air, land) · 201-205 fist pump · 212-218 point
 *   240-251 brawler stance · 252-256 jab · 257-259 hook · 272-275 uppercut
 *   280-287 lunge punch · 377-383 high front kick · 389-395 mid kick · 444-449 spin kick
 *   492-513 wrestler stance and dive grab · 517-534 drop kick, fall, get up
 *   576-719 jumping punches and kicks · 720-752 crouching kicks and sweeps
 *   844-852 spinning sweep · 864-875 long lunge punch · 884-910 shoulder charge, dive tackle
 *   947-1031 grabs and holds · 1158-1162 arms-wide victory · 1216-1225 forward roll
 *   1610-1625 relaxed stance · 1684-1688 point · 1689-1699 knocked down, get up
 *   1812-1835 clothesline and overhead smash · 2268-2295 crouching guard and crouch punches
 *   2830-3107 hands-behind-head kicks (show-off style) · 3108-3134 stiff fall back and forward
 */
import type { AnimSpec, ArtSource } from "./spec.ts";

export const UNIVERSAL_PROTOTYPE: ArtSource = {
  id: "universal-prototype",
  file: "art/sources/universal-prototype/big_spritesheet_1.png",
  sha256: "e3b1274c3d938d33bf17c1b21468550e6c4495602cdd309254d64ddc5f493624",
  cellWidth: 348,
  cellHeight: 247,
  columns: 40,
  rows: 80,
  axis: { x: 178, y: 226 },
  // Cyan specks (17-20) and a rare dark purple (68): 1-3 pixels in some frames.
  stray: [17, 18, 19, 20, 68],
  localcoord: 544,
  standardSprites: {
    "5000,0": 62, "5000,10": 63, "5000,20": 64,
    "5010,0": 68, "5010,10": 69, "5010,20": 70,
    "5020,0": 164, "5020,10": 164, "5020,20": 165,
    "5030,0": { cell: 77, anchor: "feet" }, "5030,10": { cell: 92, anchor: "feet" }, "5030,20": { cell: 93, anchor: "feet" },
    "5030,30": { cell: 95, anchor: "feet" }, "5030,40": { cell: 95, rotate: -30 }, "5030,50": { cell: 95, rotate: -60 },
    "5040,0": { cell: 96, anchor: "feet" }, "5040,10": 116, "5040,20": 104,
    "5060,0": { cell: 62, anchor: "feet" }, "5060,10": { cell: 62, rotate: 180 },
    "5070,0": { cell: 62, rotate: 30 }, "5070,10": { cell: 62, rotate: 60 }, "5070,20": { cell: 62, rotate: 90 },
  },
  credit: "Sprites: Universal Prototype for scrolling beat 'em up by Puffolotti (CC0), https://opengameart.org/content/universal-prototype-for-scrolling-beat-em-up-0",
};

/** Plays through; its state moves on when it ends (or it repeats). */
const once = (action: number, cells: AnimSpec["cells"], ticks: number | number[], comment?: string): AnimSpec => ({ action, cells, ticks, comment });
const loop = once;
/** Airborne: frames re-grounded so the lowest pixel is on the axis. */
const air = (a: AnimSpec): AnimSpec => ({ ...a, anchor: "feet" });
/** Stops on its last frame. */
const hold = (action: number, cells: AnimSpec["cells"], ticks: number | number[], comment?: string): AnimSpec => ({ action, cells, ticks, loop: false, comment });

/** Movement, guard, hit, fall and get-up animations shared by every template on this sheet. */
export function sharedAnims(o: { stand: AnimSpec["cells"]; standTicks?: number }): AnimSpec[] {
  const standFirst = Array.isArray(o.stand) ? (o.stand as number[])[0]! : (o.stand as { from: number }).from;
  return [
    loop(0, o.stand, o.standTicks ?? 6, "stand"),
    once(5, [standFirst], 3, "turn"),
    once(6, [2268], 3, "crouch turn"),
    once(10, [161, 162, 163], 2, "stand to crouch"),
    loop(11, { from: 2268, to: 2275 }, 7, "crouching"),
    once(12, [163, 162, 161], 2, "crouch to stand"),
    loop(20, { from: 166, to: 179 }, 4, "walk forward"),
    loop(21, { from: 179, to: 166 }, 4, "walk back"),
    once(40, [192], 3, "jump start"),
    air(once(41, [193, 194, 195, 196], 5, "jump up")),
    air(once(42, { from: 185, to: 191 }, 5, "jump forward")),
    air(once(43, { from: 188, to: 185 }, 6, "jump back")),
    once(47, [200], 3, "jump land"),
    loop(100, { from: 155, to: 160 }, 4, "run"),
    air(once(105, [194, 195], 6, "hop back")),
    once(120, [54, 55], 2, "guard start"),
    once(121, [2268], 2, "crouch guard start"),
    air(once(122, [194], 2, "air guard start")),
    loop(130, [56], 10, "stand guard"),
    loop(131, [2269], 10, "crouch guard"),
    air(loop(132, [194], 10, "air guard")),
    once(140, [55, 54], 2, "guard end"),
    once(141, [2268], 2, "crouch guard end"),
    air(once(142, [194], 2, "air guard end")),
    once(150, [57, 58], 3, "stand guard hit"),
    once(151, [2270], 6, "crouch guard hit"),
    air(once(152, [194], 6, "air guard hit")),
    hold(170, { from: 144, to: 149 }, 6, "lose (time over)"),
    hold(175, { from: 144, to: 149 }, 6, "draw (time over)"),
    // Getting hit: light, medium, hard; high, low, crouching; then the recoveries.
    once(5000, [62, 63], 3, "hit high, light"),
    once(5001, [62, 63, 64], 3, "hit high, medium"),
    once(5002, [63, 64, 65], 3, "hit high, hard"),
    once(5005, [63, 62], 3, "recover high, light"),
    once(5006, [64, 63, 62], 3, "recover high, medium"),
    once(5007, [65, 64, 63, 62], 3, "recover high, hard"),
    once(5010, [68, 69], 3, "hit low, light"),
    once(5011, [68, 69, 70], 3, "hit low, medium"),
    once(5012, [69, 70, 71], 3, "hit low, hard"),
    once(5015, [69, 68], 3, "recover low, light"),
    once(5016, [70, 69, 68], 3, "recover low, medium"),
    once(5017, [71, 70, 69, 68], 3, "recover low, hard"),
    once(5020, [164], 6, "crouching hit, light"),
    once(5021, [164], 8, "crouching hit, medium"),
    once(5022, [165], 10, "crouching hit, hard"),
    once(5025, [164], 3, "crouching recover, light"),
    once(5026, [164], 4, "crouching recover, medium"),
    once(5027, [165, 164], 3, "crouching recover, hard"),
    air(once(5030, [77], 4, "hit in the air")),
    air(once(5035, [77], 3, "air hit transition")),
    air(once(5040, [187, 188, 185], 4, "air recover")),
    air(once(5050, [92, 93], 5, "falling")),
    air(once(5060, [94], 5, "falling, coming down")),
    once(5070, [108, 109], 4, "tripped"),
    once(5080, [104], 4, "hit while down"),
    air(once(5090, [77], 4, "hit up while down")),
    air(once(5100, [95, 96], 3, "hit the ground")),
    air(once(5101, [97], 4, "bounce")),
    once(5110, [116], 30, "lying down"),
    once(5120, { from: 117, to: 126 }, 4, "getting up"),
    hold(5140, [116], 30, "lying defeated"),
    hold(5150, [116], 30, "lying defeated (match over)"),
    air(once(5160, [97], 4, "bounce into the air")),
    air(once(5170, [98, 104], 4, "hit the ground after a bounce")),
    air(once(5200, [187, 188], 3, "fall recovery near the ground")),
    air(once(5210, { from: 185, to: 188 }, 3, "fall recovery in the air")),
  ];
}
