/**
 * Example looks for rig fighters (rig/parts.ts), each a different style on the
 * same skeleton and moves: a robot, a masked luchador, a skeleton in a top
 * hat, an origami man, a crystal golem, a chibi kid and a hedgehog mascot.
 * Designs only: none is on the roster yet. `pnpm rig:gallery` draws them.
 */
import { person } from "./kit.ts";
import type { Design, Part, Shape } from "./parts.ts";
import type { BoneId } from "./skeleton.ts";

type Parts = Partial<Record<BoneId, Part>>;
const both = (parts: Parts, name: "upperArm" | "foreArm" | "hand" | "thigh" | "shin" | "foot", part: Part): Parts => ({ ...parts, [`${name}F`]: part, [`${name}B`]: part });

/** Blue Chip: a chrome robot with a glowing visor and piston limbs. */
export const BLUE_CHIP: Design = (() => {
  let parts: Parts = {
    torso: {
      shapes: [
        { kind: "capsule", material: "dark", u0: 56, u1: 70, r0: 5, r1: 5 },
        { kind: "poly", material: "dark", points: [[-4, -13], [-4, 13], [14, 15], [14, -15]] },
        { kind: "poly", material: "metal", points: [[12, -16], [12, 18], [60, 23], [62, -18]] },
        { kind: "poly", material: "accent", flat: true, outline: true, points: [[30, 7], [30, 18], [50, 20], [50, 7]] },
        { kind: "ellipse", material: "visor", flat: true, u: 40, v: 13, ru: 3, rv: 3 },
      ],
    },
    head: {
      shapes: [
        { kind: "capsule", material: "dark", u0: 28, u1: 40, r0: 1.6, r1: 1.6, v: -4 },
        { kind: "ellipse", material: "visor", flat: true, u: 41, v: -4, ru: 3.2, rv: 3.2 },
        { kind: "ellipse", material: "metal", u: 16, v: 0, ru: 16, rv: 14 },
        { kind: "poly", material: "visor", flat: true, outline: true, points: [[14, 1], [14, 15], [23, 15], [23, 1]] },
        { kind: "ellipse", material: "dark", u: 14, v: -4, ru: 5, rv: 4 },
      ],
    },
  };
  parts = both(parts, "upperArm", { shapes: [{ kind: "capsule", material: "metal", u0: 0, u1: 39, r0: 7, r1: 6 }, { kind: "ellipse", material: "accent", u: 2, v: 0, ru: 10, rv: 10 }, { kind: "ellipse", material: "dark", u: 39, v: 0, ru: 5, rv: 5 }] });
  parts = both(parts, "foreArm", { shapes: [{ kind: "capsule", material: "metal", u0: 0, u1: 34, r0: 7, r1: 6.5 }, { kind: "capsule", material: "accent", u0: 14, u1: 19, r0: 7.4, r1: 7.4 }] });
  parts = both(parts, "hand", {
    shapes: [{ kind: "ellipse", material: "dark", u: 6, v: 0, ru: 8, rv: 8 }, { kind: "capsule", material: "metal", u0: 3, u1: 10, r0: 2.5, r1: 2.5, v: 6 }],
    open: [{ kind: "capsule", material: "dark", u0: 0, u1: 13, r0: 5, r1: 4 }, { kind: "capsule", material: "metal", u0: 2, u1: 9, r0: 2.2, r1: 2, v: 5 }],
  });
  parts = both(parts, "thigh", { shapes: [{ kind: "capsule", material: "dark", u0: 0, u1: 50, r0: 9.5, r1: 7.5 }, { kind: "ellipse", material: "accent", u: 50, v: 0, ru: 7, rv: 7 }] });
  parts = both(parts, "shin", { shapes: [{ kind: "capsule", material: "metal", u0: 0, u1: 47, r0: 8, r1: 7 }, { kind: "capsule", material: "dark", u0: 20, u1: 32, r0: 3, r1: 3, v: 6 }] });
  parts = both(parts, "foot", { shapes: [{ kind: "poly", material: "dark", points: [[-9, -8], [23, -8], [24, 1], [16, 5], [-9, 6]] }, { kind: "poly", material: "accent", flat: true, points: [[-9, -8], [23, -8], [23, -5], [-9, -5]] }] });
  return { materials: { metal: "#a9b4c6", dark: "#4b5468", accent: "#2f6fe0", visor: "#48d6ff" }, parts };
})();

/** Bull Run: a big masked luchador with horns on his mask. */
export const BULL_RUN: Design = {
  materials: { skin: "#b9774f", hair: "#1c1410", eye: "#141018", mask: "#c8242c", trim: "#f2c230", horn: "#efe6d0", tights: "#2a2a6e", boots: "#c8242c" },
  ...person({
    bulk: 1.3,
    hair: "bald",
    top: "skin",
    legs: "tights",
    shoes: "boots",
    extra: {
      head: [
        { kind: "poly", material: "horn", points: [[27, -5], [34, -15], [44, -15], [37, -10], [32, -2]] },
        { kind: "ellipse", material: "mask", u: 18.5, v: 1, ru: 16, rv: 13.5 },
        { kind: "poly", material: "trim", flat: true, points: [[25, 4], [21, 15], [12, 13], [15, 7], [21, 3]] },
        { kind: "poly", material: "eye", flat: true, points: [[19.5, 7.5], [19.5, 10.5], [16.5, 10.5], [16.5, 7.5]] },
        { kind: "poly", material: "skin", points: [[9, 7], [3, 9], [2, 14], [9, 15]] },
      ],
      torso: [
        { kind: "poly", material: "trim", outline: true, points: [[16, -18], [16, 20], [8, 20], [8, -18]] },
        { kind: "ellipse", material: "mask", flat: true, u: 12, v: 20, ru: 5, rv: 3 },
      ],
      shinF: [{ kind: "capsule", material: "boots", u0: 22, u1: 47, r0: 9, r1: 7.5 }],
      shinB: [{ kind: "capsule", material: "boots", u0: 22, u1: 47, r0: 9, r1: 7.5 }],
    },
  }),
};

/** Dead Cat Bounce: a dapper skeleton in a top hat. */
export const DEAD_CAT_BOUNCE: Design = (() => {
  const bone = (len: number, r = 3.2): Part => ({ shapes: [{ kind: "capsule", material: "bone", u0: 0, u1: len, r0: r, r1: r }, { kind: "ellipse", material: "bone", u: 0, v: 0, ru: r + 1.6, rv: r + 1.6 }, { kind: "ellipse", material: "bone", u: len, v: 0, ru: r + 1.2, rv: r + 1.2 }] });
  const ribs: Shape[] = [0, 1, 2, 3].map((k): Shape => ({ kind: "capsule", material: "bone", u0: 52 - k * 6, u1: 46 - k * 7, r0: 2.4, r1: 2, v: 14 - k * 0.5 }));
  let parts: Parts = {
    torso: {
      shapes: [
        { kind: "ellipse", material: "bone", u: 6, v: 0, ru: 7, rv: 12 },
        { kind: "ellipse", material: "socket", flat: true, u: 6, v: 3, ru: 3, rv: 4 },
        { kind: "capsule", material: "bone", u0: 6, u1: 68, r0: 3.4, r1: 3.4, v: -3 },
        { kind: "ellipse", material: "bone", u: 46, v: 6, ru: 15, rv: 12 },
        { kind: "ellipse", material: "socket", flat: true, u: 46, v: 6, ru: 11, rv: 8 },
        ...ribs,
        { kind: "poly", material: "band", outline: true, points: [[62, 4], [56, 14], [52, 11], [60, 2]] },
      ],
    },
    head: {
      shapes: [
        { kind: "ellipse", material: "bone", u: 18, v: 2, ru: 14, rv: 12.5 },
        { kind: "capsule", material: "bone", u0: 3, u1: 9, r0: 5, r1: 5, v: 7 },
        { kind: "ellipse", material: "socket", flat: true, u: 18, v: 8.5, ru: 4, rv: 3.4 },
        { kind: "poly", material: "socket", flat: true, points: [[13, 13], [10, 15], [10, 12]] },
        { kind: "poly", material: "socket", flat: true, points: [[7.5, 3], [7.5, 12], [6.5, 12], [6.5, 3]] },
        { kind: "poly", material: "hat", points: [[29, -15], [29, 17], [33, 17], [33, -15]] },
        { kind: "poly", material: "hat", points: [[33, -10], [33, 11], [54, 10], [54, -9]] },
        { kind: "poly", material: "band", flat: true, points: [[33.5, -10], [33.5, 11], [38, 11], [38, -10]] },
      ],
    },
  };
  parts = both(parts, "upperArm", bone(39));
  parts = both(parts, "foreArm", bone(34, 2.6));
  parts = both(parts, "hand", { shapes: [{ kind: "ellipse", material: "bone", u: 6, v: 0, ru: 6, rv: 5.5 }], open: [{ kind: "capsule", material: "bone", u0: 0, u1: 12, r0: 3.5, r1: 2.5 }] });
  parts = both(parts, "thigh", bone(50, 3.8));
  parts = both(parts, "shin", bone(47, 3));
  parts = both(parts, "foot", { shapes: [{ kind: "capsule", material: "hat", u0: -4, u1: 18, r0: 5.5, r1: 4.5 }] });
  return { materials: { bone: "#ece4cf", socket: "#1d1722", hat: "#26232e", band: "#8a3fd1" }, parts };
})();

/** Paper Hands: an origami man, flat folded paper with crisp creases. */
export const PAPER_HANDS: Design = (() => {
  const flat = (points: readonly (readonly [number, number])[], tone: "light" | "mid" | "dark" = "mid"): Shape => ({ kind: "poly", material: "paper", flat: true, tone, points });
  const limb = (len: number, w0: number, w1: number): Part => ({
    shapes: [flat([[-2, -w0], [-2, w0], [len + 2, w1], [len + 2, -w1]]), flat([[-2, 0], [-2, w0], [len + 2, w1], [len + 2, 0]], "light")],
  });
  let parts: Parts = {
    torso: {
      shapes: [
        flat([[-4, -12], [-4, 12], [10, 14], [10, -14]], "dark"),
        flat([[8, -14], [8, 16], [62, 22], [64, -18]]),
        flat([[8, 0], [8, 16], [62, 22], [62, 0]], "light"),
        { kind: "poly", material: "crease", flat: true, points: [[10, 0], [10, 1.2], [62, 1.2], [62, 0]] },
        { kind: "poly", material: "ink", flat: true, points: [[44, 8], [36, 14], [36, 12], [44, 6]] },
      ],
    },
    head: {
      shapes: [
        flat([[-4, -6], [-4, 8], [6, 8], [6, -6]], "dark"),
        flat([[4, -10], [4, 13], [20, 18], [34, 8], [34, -8], [20, -14]]),
        flat([[4, 2], [4, 13], [20, 18], [34, 8], [34, 2]], "light"),
        { kind: "poly", material: "ink", flat: true, points: [[20, 9], [20, 12], [17, 12], [17, 9]] },
        { kind: "poly", material: "crease", flat: true, points: [[20, -14], [20, 18], [21, 18], [21, -14]] },
      ],
    },
  };
  parts = both(parts, "upperArm", limb(39, 7, 5.5));
  parts = both(parts, "foreArm", limb(34, 5.5, 4.5));
  parts = both(parts, "hand", { shapes: [flat([[0, -6], [0, 6], [12, 0]]), flat([[0, 0], [0, 6], [12, 0]], "light")], open: [flat([[0, -4], [0, 5], [14, 3], [14, -1]])] });
  parts = both(parts, "thigh", limb(50, 10, 7.5));
  parts = both(parts, "shin", limb(47, 7.5, 6));
  parts = both(parts, "foot", { shapes: [flat([[-6, -6], [22, -6], [22, -3], [0, 6], [-6, 6]]), flat([[-6, -6], [22, -6], [22, -3], [-6, 0]], "light")] });
  return { materials: { paper: "#e8e3d6", crease: "#b6ae9c", ink: "#24202a" }, parts };
})();

/** Diamond Hands: a crystal golem with faceted limbs and huge crystal fists. */
export const DIAMOND_HANDS: Design = (() => {
  const facet = (len: number, w0: number, w1: number): Part => ({
    shapes: [
      { kind: "poly", material: "crystal", flat: true, tone: "dark", points: [[-3, -w0], [len / 2, -w0 - 2], [len + 3, -w1], [len + 3, 0], [-3, 0]] },
      { kind: "poly", material: "crystal", flat: true, tone: "mid", points: [[-3, 0], [len + 3, 0], [len + 3, w1], [len / 2, w0 + 2], [-3, w0]] },
      { kind: "poly", material: "crystal", flat: true, tone: "light", points: [[len * 0.2, 1], [len * 0.55, w0 * 0.9], [len * 0.45, 2]] },
    ],
  });
  let parts: Parts = {
    torso: {
      shapes: [
        { kind: "poly", material: "core", flat: true, tone: "dark", points: [[-6, -16], [-6, 16], [12, 18], [12, -18]] },
        { kind: "poly", material: "crystal", flat: true, tone: "dark", points: [[10, -20], [40, -26], [66, -22], [66, 2], [10, 2]] },
        { kind: "poly", material: "crystal", flat: true, tone: "mid", points: [[10, 2], [66, 2], [64, 26], [40, 30], [10, 20]] },
        { kind: "poly", material: "crystal", flat: true, tone: "light", points: [[40, 6], [58, 8], [52, 22], [40, 20]] },
        { kind: "poly", material: "core", flat: true, tone: "light", outline: true, points: [[30, 2], [36, 10], [30, 18], [24, 10]] },
      ],
    },
    head: {
      shapes: [
        { kind: "poly", material: "crystal", flat: true, tone: "dark", points: [[-4, -12], [14, -16], [30, -8], [30, 2], [-4, 2]] },
        { kind: "poly", material: "crystal", flat: true, tone: "mid", points: [[-4, 2], [30, 2], [24, 14], [8, 16], [-4, 12]] },
        { kind: "poly", material: "core", flat: true, tone: "light", points: [[16, 6], [20, 10], [16, 12], [13, 9]] },
      ],
    },
  };
  parts = both(parts, "upperArm", facet(39, 11, 9));
  parts = both(parts, "foreArm", facet(34, 9, 10));
  const fist: Shape[] = [
    { kind: "poly", material: "crystal", flat: true, tone: "dark", points: [[-2, -12], [10, -15], [20, -8], [20, 0], [-2, 0]] },
    { kind: "poly", material: "crystal", flat: true, tone: "mid", points: [[-2, 0], [20, 0], [20, 9], [10, 15], [-2, 12]] },
    { kind: "poly", material: "crystal", flat: true, tone: "light", points: [[6, 2], [14, 3], [10, 10]] },
  ];
  parts = both(parts, "hand", { shapes: fist, open: fist });
  parts = both(parts, "thigh", facet(50, 13, 10));
  parts = both(parts, "shin", facet(47, 10, 10));
  parts = both(parts, "foot", { shapes: [{ kind: "poly", material: "core", flat: true, tone: "dark", points: [[-10, -9], [24, -9], [26, 2], [14, 7], [-10, 7]] }] });
  return { materials: { crystal: "#5fd0e6", core: "#2a6f9e" }, outline: "#0c2230", parts, proportions: { depth: 9 } };
})();

/** Penny Stock: a chibi kid in a hoodie, big head, short limbs. */
export const PENNY_STOCK: Design = {
  materials: { skin: "#f0c09a", hair: "#d0662a", eye: "#141018", hoodie: "#e0a030", jeans: "#3a5a8c", sneakers: "#f2f2f2", coin: "#b8743a" },
  ...person({
    hair: "bun",
    headScale: 1.55,
    top: "hoodie",
    sleeves: "hoodie",
    legs: "jeans",
    shoes: "sneakers",
    proportions: { torso: 46, upperArm: 28, foreArm: 25, thigh: 36, shin: 34, foot: 18, shoulder: 0.86 },
    extra: {
      torso: [
        { kind: "ellipse", material: "coin", outline: true, u: 34, v: 12, ru: 6, rv: 6 },
        { kind: "poly", material: "hoodie", tone: "dark", points: [[60, -14], [70, -12], [72, -2], [64, -6]] },
      ],
    },
  }),
};

/** Hedge Hog: a hedgehog mascot in a tracksuit, spines down his back. */
export const HEDGE_HOG: Design = {
  materials: { skin: "#8a5a3a", hair: "#4a2e1c", eye: "#141018", muzzle: "#e8c8a0", spines: "#5a3a26", track: "#2e8a4a", stripe: "#f2f2f2", sneakers: "#d8303a" },
  ...person({
    bulk: 1.12,
    hair: "bald",
    top: "track",
    sleeves: "track",
    legs: "track",
    shoes: "sneakers",
    extra: {
      head: [
        { kind: "poly", material: "spines", points: [[33, -2], [42, -12], [31, -12], [36, -24], [24, -19], [22, -32], [13, -20], [3, -24], [3, -12], [-4, -14], [6, -4]] },
        { kind: "ellipse", material: "muzzle", u: 11, v: 12, ru: 7, rv: 8 },
        { kind: "ellipse", material: "eye", flat: true, u: 13, v: 20, ru: 2.6, rv: 2.6 },
        { kind: "poly", material: "eye", flat: true, points: [[20.5, 7.5], [20.5, 11.5], [16, 11.5], [16, 7.5]] },
        { kind: "ellipse", material: "muzzle", u: 29, v: -1, ru: 3.5, rv: 3 },
      ],
      torso: [
        { kind: "poly", material: "spines", points: [[62, -16], [58, -32], [50, -19], [44, -32], [38, -18], [30, -28], [24, -16]] },
        { kind: "poly", material: "stripe", flat: true, points: [[62, 17], [14, 18], [14, 16], [62, 15]] },
      ],
      upperArmF: [{ kind: "capsule", material: "stripe", u0: 0, u1: 39, r0: 1.4, r1: 1.4, v: 7 }],
      thighF: [{ kind: "capsule", material: "stripe", u0: 0, u1: 50, r0: 1.4, r1: 1.4, v: 9 }],
    },
  }),
};

/** Every example, with a name and a line about it, for the gallery. */
export const EXAMPLE_DESIGNS: readonly { id: string; name: string; style: string; design: Design }[] = [
  { id: "blue-chip", name: "Blue Chip", style: "Chrome robot, glowing visor", design: BLUE_CHIP },
  { id: "bull-run", name: "Bull Run", style: "Masked luchador with horns", design: BULL_RUN },
  { id: "dead-cat-bounce", name: "Dead Cat Bounce", style: "Skeleton in a top hat", design: DEAD_CAT_BOUNCE },
  { id: "paper-hands", name: "Paper Hands", style: "Origami, flat folded paper", design: PAPER_HANDS },
  { id: "diamond-hands", name: "Diamond Hands", style: "Crystal golem", design: DIAMOND_HANDS },
  { id: "penny-stock", name: "Penny Stock", style: "Chibi kid in a hoodie", design: PENNY_STOCK },
  { id: "hedge-hog", name: "Hedge Hog", style: "Hedgehog mascot", design: HEDGE_HOG },
];
