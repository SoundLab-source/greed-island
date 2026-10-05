/**
 * House fighter "Midlife Crisis" (HEAVY): a big bald dad who got Neon
 * Gorilla's pink mohawk, on the Bad Company sheets' Wayne model with Boston's
 * hair mixed in (templates/mix.ts). He keeps the Bruiser's numbers, AI and
 * moves (moved to the new layout by portToUp2); his own are the showing off:
 * a breakdance windmill into the splits to start (then up off the floor), the
 * splits again to win, and catching his breath to taunt.
 */
import { BOSTON, WAYNE, onBody } from "./bad-company.ts";
import { HEAVY } from "./heavy.ts";
import type { TemplateSpec } from "./spec.ts";
import { cellRange as range, portToUp2, withMoves } from "./universal-prototype-2.ts";

const bruiser = onBody(portToUp2(HEAVY), WAYNE);
const stance = 1856;

export const MIDLIFE_CRISIS: TemplateSpec = {
  ...withMoves(bruiser, {
    anims: [
      { action: 180, cells: [4563, 4564, 4565], ticks: [5, 6, 60], loop: false, anchor: "feet", comment: "win: the splits, arms crossed" },
      { action: 181, cells: range(1159, 1163), ticks: [6, 6, 6, 6, 60], loop: false, comment: "win: arms wide" },
      {
        action: 190,
        cells: [4542, 4543, ...range(4557, 4564), ...range(4557, 4564), 4565, 4566, 4565, ...range(122, 127), stance],
        ticks: [10, 20, ...Array<number>(16).fill(3), 6, 30, 6, 6, 6, 5, 5, 5, 6, 10],
        anchor: "feet",
        comment: "intro: arms crossed, a breakdance windmill into the splits, then up off the floor",
      },
      { action: 195, cells: [...range(145, 150), 149, 148, 147, 146, 145], ticks: [5, 5, 6, 6, 8, 20, 8, 6, 6, 5, 5], comment: "taunt: hands on his knees, catching his breath" },
    ],
  }),
  id: "gi-midlife-crisis",
  name: "Midlife Crisis",
  // More life and punch than the Bruiser: on Wayne's broad body (a big target, without Iron Bison's height and reach)
  // the Bruiser's numbers won 38.9% against the 27 others in the balance tool (2026-10-05).
  constants: { ...bruiser.constants, life: 1190, attack: 111 },
  // Boston's mohawk (his hair, 53-56) takes palette slots 100-103.
  looks: [{ art: BOSTON, indices: [53, 54, 55, 56] }],
  // A black band tee (25-28) and faded jeans (29-32) under the hot pink mohawk.
  colors: { 25: "#3a3a3e", 26: "#2b2b2e", 27: "#1c1c1f", 28: "#0e0e10", 29: "#5a7aa0", 30: "#45607f", 31: "#2f425a", 32: "#18212d" },
  palettes: [
    { name: "Silver Fox", colors: { 100: "#d0d0d8", 101: "#a0a0a8", 102: "#6a6a72", 103: "#353539", 25: "#ecebe6", 26: "#c3c1b8", 27: "#89877f", 28: "#44433f", 29: "#c8b080", 30: "#a08a60", 31: "#6e5e40", 32: "#372f20" } },
    { name: "Red Convertible", colors: { 100: "#ff8a20", 101: "#cc6a18", 102: "#8a4710", 103: "#452408", 25: "#a8322d", 26: "#7f2622", 27: "#561a17", 28: "#2b0d0b", 29: "#2a2a2e", 30: "#1f1f22", 31: "#151517", 32: "#0a0a0b" } },
    { name: "Festival Dad", colors: { 100: "#40b0ff", 101: "#3088c8", 102: "#205c88", 103: "#102e44", 25: "#8ad14a", 26: "#6aa038", 27: "#486e26", 28: "#243713", 29: "#5a2a8a", 30: "#44206a", 31: "#2e1648", 32: "#170b24" } },
  ],
};
