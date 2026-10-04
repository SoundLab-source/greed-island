/**
 * House fighter "Silver Crane" (ZONER): a taekwondo kicker, on the second
 * Universal Prototype model. She keeps the Sage's numbers, AI, projectile
 * (the energy palm) and plain moves (moved to the new model by portToUp2),
 * and keeps her opponent out with taekwondo's long kicks instead of the
 * Sage's front and side kicks: a chambered side kick and a roundhouse. She
 * wins with a high kick held at full stretch.
 */
import type { TemplateSpec } from "./spec.ts";
import { cellRange as range, portToUp2, redrawMove, withMoves } from "./universal-prototype-2.ts";
import { ZONER } from "./zoner.ts";

const sage = portToUp2(ZONER);

export const SILVER_CRANE: TemplateSpec = {
  ...withMoves(sage, {
    anims: [
      { action: 180, cells: [...range(3716, 3723), 3722, 3721], ticks: [4, 4, 4, 5, 6, 8, 10, 30, 6, 60], loop: false, comment: "win: a high kick, held" },
      { action: 195, cells: [3738, 3739, 3740, 3739, 3738], ticks: [5, 6, 20, 6, 5], comment: "taunt: a crane's leg raise" },
    ],
    attacks: [
      // Kicks that reach forward and recover as fast as the Sage's: a zoner lives on keeping you out. (Her held high
      // kick, reaching up rather than forward, and her own spinning kick made her lose 87% of her fights; the spin
      // kick she keeps is the Sage's, which travels.)
      redrawMove(sage, 230, "Side Kick", range(3689, 3698), [2, 2, 2, 2, 3, 3, 2, 2, 1, 1], [4, 5]),
      redrawMove(sage, 240, "Roundhouse", range(3699, 3706), [3, 3, 3, 4, 4, 3, 2, 2], [3, 4]),
      { ...sage.attacks.find((a) => a.state === 1200)!, name: "Tornado Kick" },
    ],
  }),
  id: "gi-silver-crane",
  name: "Silver Crane",
  // A little more life and punch than the Sage, for the new model (her coat makes a wider target): the Sage's own
  // moves won 42% on it, and she 45% (balance tool, 2026-10-03).
  constants: { ...sage.constants, life: Math.round(sage.constants.life * 1.03), attack: sage.constants.attack + 1 },
  // A silver-grey coat (29-32) with white trim (33-36).
  colors: {
    29: "#a7adb8", 30: "#7e838c", 31: "#555860", 32: "#2a2c30",
    33: "#f2f2f2", 34: "#c4c4c4", 35: "#8a8a8a", 36: "#454545",
  },
  palettes: [
    { name: "Snow", colors: { 29: "#f0f0f0", 30: "#c8c8c8", 31: "#8c8c8c", 32: "#464646", 33: "#c43c3c", 34: "#962e2e", 35: "#641f1f", 36: "#320f0f" } },
    { name: "Dusk", colors: { 29: "#4a3a6e", 30: "#382c53", 31: "#251d38", 32: "#130f1c" } },
    { name: "Ember", colors: { 29: "#c4562a", 30: "#964120", 31: "#642b15", 32: "#32160b", 240: "#fffbe0", 241: "#ffe89a", 242: "#ffc04d", 243: "#ff8a1f", 244: "#e0520f", 245: "#992b08" } },
  ],
  portrait: { cell: 3680 },
};
