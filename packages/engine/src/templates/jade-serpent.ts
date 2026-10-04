/**
 * House fighter "Jade Serpent" (RUSHDOWN): a capoeira fighter, on the second
 * Universal Prototype model. She keeps the Striker's numbers, AI and plain
 * moves (moved to the new model by portToUp2), with capoeira's ginga for a
 * stance and walk, and its kicks: the martelo and armada, the rasteira sweep,
 * a flying kick, and three specials (a cartwheel kick, a rising handstand
 * kick and the parafuso); a backflip and a compass kick to win. Each capoeira move takes the place of a Striker
 * move with the same job, hit numbers and about the same timing (the ticks
 * before it hits match the Striker's), so she plays about as strong.
 */
import { RUSHDOWN } from "./rushdown.ts";
import type { TemplateSpec } from "./spec.ts";
import { cellRange, portToUp2, redrawMove, withMoves } from "./universal-prototype-2.ts";

const range = cellRange;
const striker = portToUp2(RUSHDOWN);

export const JADE_SERPENT: TemplateSpec = {
  ...withMoves(striker, {
    anims: [
      { action: 0, cells: { from: 3219, to: 3230 }, ticks: 5, comment: "stand: the ginga, low and swaying" },
      { action: 20, cells: { from: 3196, to: 3205 }, ticks: 4, comment: "walk forward: ginga steps" },
      { action: 21, cells: { from: 3205, to: 3196 }, ticks: 4, comment: "walk back: ginga steps" },
      { action: 180, cells: [...range(3281, 3288), 3165], ticks: [4, 4, 4, 4, 4, 4, 5, 6, 60], loop: false, comment: "win: backflip" },
      { action: 181, cells: [...range(3169, 3176), 3165], ticks: [5, 5, 5, 6, 6, 8, 5, 5, 60], loop: false, comment: "win: a compass kick (meia lua de compasso)" },
      { action: 190, cells: [...range(3233, 3238), 3219], ticks: [5, 5, 6, 6, 6, 6, 10], comment: "intro: a cartwheel into the ginga" },
      { action: 195, cells: [3165, 3166, 3167, 3168, 3167], ticks: [5, 5, 5, 20, 6], comment: "taunt: come on" },
    ],
    attacks: [
      redrawMove(striker, 210, "Martelo", range(3373, 3379), [2, 3, 3, 3, 4, 3, 3], [3, 4]),
      redrawMove(striker, 240, "Armada", range(3300, 3309), [1, 1, 2, 2, 2, 3, 3, 3, 3, 3], [5, 6]),
      redrawMove(striker, 440, "Rasteira", range(3294, 3299), [6, 4, 3, 2, 2, 1], [1, 2]),
      redrawMove(striker, 630, "Flying Kick", range(3346, 3351), [3, 3, 8, 6, 5, 5], [2, 3], { anchor: "feet" }),
      // The cartwheel travels; the kick lands as she comes down, the leg reaching far forward (3245).
      redrawMove(striker, 1000, "Au Batido", range(3239, 3246), [2, 2, 2, 2, 2, 2, 8, 4], [6], { moves: [{ frame: 1, x: 5 }, { frame: 6, x: 0 }] }),
      // Up from the floor with one leg straight up, then arcing forward: the hit is that leg, above her (a hand-made box, since it reaches up more than forward).
      redrawMove(striker, 1100, "Rising Handstand Kick", range(3188, 3194), [2, 2, 4, 5, 6, 3, 3], [2, 3, 4], { hit: { box: [-5, -196, 46, -140] } }),
      // The Striker's jumping spin kick is capoeira's parafuso. (The compass kick tried here instead left her
      // bent over with her hands on the floor for too long: 27% against 47% in the balance tool. It's a win pose now.)
      { ...striker.attacks.find((a) => a.state === 1200)!, name: "Parafuso" },
    ],
  }),
  id: "gi-jade-serpent",
  name: "Jade Serpent",
  // More life and a little more punch than the Striker: on this model (her coat makes a wider target) the
  // Striker's own moves won 45% where the Striker wins 53% (balance tool, 2026-10-03).
  constants: { ...striker.constants, life: 950, attack: 102 },
  // A jade coat (29-32) over the model's gold trim.
  colors: { 29: "#2f9e6e", 30: "#227553", 31: "#164e37", 32: "#0b271c" },
  palettes: [
    { name: "Coral", colors: { 29: "#e0603c", 30: "#b0462a", 31: "#77301d", 32: "#3b170e" } },
    { name: "Midnight", colors: { 29: "#33407a", 30: "#252f5b", 31: "#18203d", 32: "#0c101e", 33: "#c8d0e0", 34: "#9aa3b8", 35: "#66708a", 36: "#333845" } },
    { name: "Ivory", colors: { 29: "#ece6d6", 30: "#c4bca8", 31: "#8a8474", 32: "#45423a" } },
  ],
  portrait: { cell: 3165 },
};
