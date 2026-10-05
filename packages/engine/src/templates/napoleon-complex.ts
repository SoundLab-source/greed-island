/**
 * House fighter "Napoleon Complex" (GRAPPLER): a slight, bald soldier in a
 * big man's cap who throws people twice his size, on the Bad Company sheets'
 * Reinhold model with Madeira's cap mixed in (templates/mix.ts). He keeps the
 * Wrestler's numbers, AI, throws (the body slam and the dive grab) and moves
 * (moved to the new layout by portToUp2); his own are the general's
 * gestures: pointing the charge to start, a raised fist and a pointed arm to
 * win, pointing at whoever he's knocked down.
 */
import { MADEIRA, REINHOLD, onBody } from "./bad-company.ts";
import { GRAPPLER } from "./grappler.ts";
import type { TemplateSpec } from "./spec.ts";
import { cellRange as range, portToUp2, withMoves } from "./universal-prototype-2.ts";

const wrestler = onBody(portToUp2(GRAPPLER), REINHOLD);
const stance = 500;

export const NAPOLEON_COMPLEX: TemplateSpec = {
  ...withMoves(wrestler, {
    anims: [
      { action: 180, cells: range(202, 206), ticks: [6, 6, 6, 8, 60], loop: false, comment: "win: a fist raised" },
      { action: 181, cells: range(1685, 1689), ticks: [6, 6, 6, 6, 60], loop: false, comment: "win: points onward" },
      { action: 190, cells: [...range(213, 219), 218, 217, 216, 215, 214, stance], ticks: [6, 6, 5, 5, 5, 6, 30, 4, 4, 4, 4, 4, 10], comment: "intro: points the charge" },
      { action: 195, cells: [28, 29, 30, 29, 28], ticks: [5, 5, 20, 5, 5], comment: "taunt: points at the fallen" },
    ],
  }),
  id: "gi-napoleon-complex",
  name: "Napoleon Complex",
  // A little more life and punch than the Wrestler: on Reinhold's slight body the Wrestler's numbers won 43.2% against
  // the 27 others in the balance tool (2026-10-05), and 1010 and 103, 44.8%.
  constants: { ...wrestler.constants, life: 1040, attack: 105 },
  // Madeira's cap (53-56) takes palette slots 100-103.
  looks: [{ art: MADEIRA, indices: [53, 54, 55, 56] }],
  // The emperor's colours: a navy coat (25-28), white breeches (29-32) and a black cap.
  colors: { 25: "#26306e", 26: "#1c2453", 27: "#131838", 28: "#090c1c", 29: "#ecebe6", 30: "#c3c1b8", 31: "#89877f", 32: "#44433f", 100: "#2a2a2e", 101: "#1f1f22", 102: "#151517", 103: "#0a0a0b" },
  palettes: [
    { name: "Imperial Guard", colors: { 25: "#a8322d", 26: "#7f2622", 27: "#561a17", 28: "#2b0d0b", 29: "#26306e", 30: "#1c2453", 31: "#131838", 32: "#090c1c" } },
    { name: "Elba Exile", colors: { 25: "#d8c8a8", 26: "#ada080", 27: "#766d58", 28: "#3b362c", 29: "#ecebe6", 30: "#c3c1b8", 31: "#89877f", 32: "#44433f", 100: "#e0c870", 101: "#b8a050", 102: "#7c6c36", 103: "#3e361b" } },
    { name: "Waterloo", colors: { 25: "#5a5a60", 26: "#444448", 27: "#2e2e31", 28: "#171719", 29: "#6a5a3a", 30: "#50442c", 31: "#362e1d", 32: "#1b170f", 100: "#5a5a60", 101: "#444448", 102: "#2e2e31", 103: "#171719" } },
  ],
};
