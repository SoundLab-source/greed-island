/**
 * Ready-made parts for rig fighters (rig/parts.ts): a person built from a few
 * choices (build, hair, what they wear), so a new fighter starts from a
 * sentence rather than from shapes. Anything the kit can't make is a part of
 * its own, given in the design.
 */
import type { Design, Part, Shape } from "./parts.ts";
import { DEFAULT_PROPORTIONS, type BoneId, type Proportions } from "./skeleton.ts";

export type Hair = "slick" | "crop" | "bald" | "mohawk" | "bun" | "long";

export interface PersonOptions {
  /** Shoulder and limb thickness, 1 for an average build. */
  bulk?: number;
  hair?: Hair;
  /** Long sleeves in this material (a jacket); otherwise bare arms (skin). */
  sleeves?: string;
  /** Short sleeves in this material over bare forearms (a T-shirt). */
  shortSleeves?: string;
  /** The torso's material. */
  top: string;
  /** Trouser legs, or bare legs below shorts when `shorts` is set. */
  legs: string;
  shorts?: boolean;
  /** Shoes or boots; bare feet when unset. */
  shoes?: string;
  /** Gloves (fists in this material). */
  gloves?: string;
  /** Extra shapes drawn over a part, after the kit's own (a tie, a belt, a badge). */
  extra?: Partial<Record<BoneId, readonly Shape[]>>;
  /** A beard in the hair's material. */
  beard?: boolean;
  proportions?: Partial<Proportions>;
}

/** The materials every person uses; a design adds its own (top, legs and so on). */
export const PERSON_MATERIALS = ["skin", "hair", "eye"] as const;

function hairShapes(style: Hair): Shape[] {
  // On the head bone: u up from the base of the neck, v towards the face.
  switch (style) {
    case "bald":
      return [];
    case "crop":
      return [{ kind: "poly", material: "hair", points: [[16, -14], [26, -13], [32, -6], [33, 4], [30, 9], [27, 6], [25, -2], [20, -8], [13, -13]] }];
    case "mohawk":
      return [{ kind: "poly", material: "hair", points: [[22, -12], [31, -10], [40, -3], [42, 4], [36, 8], [32, 4], [30, -4], [24, -9]] }];
    case "bun":
      return [
        { kind: "poly", material: "hair", points: [[14, -14], [26, -13], [32, -6], [33, 4], [30, 9], [27, 6], [25, -2], [20, -8], [11, -12]] },
        { kind: "ellipse", material: "hair", u: 30, v: -12, ru: 6, rv: 6 },
      ];
    case "long":
      return [{ kind: "poly", material: "hair", points: [[-6, -10], [10, -16], [26, -14], [33, -6], [34, 4], [31, 10], [27, 7], [25, -1], [18, -7], [8, -10], [-4, -4]] }];
    case "slick":
    default:
      return [
        { kind: "poly", material: "hair", points: [[13, -14], [24, -15], [31, -9], [34, -1], [33, 7], [29, 11], [27, 5], [25, -1], [19, -6], [12, -10]] },
        { kind: "poly", material: "hair", tone: "light", points: [[28, -8], [31, -4], [32, 2], [30, 1], [28, -4]] },
      ];
  }
}

function head(o: PersonOptions): Part {
  const shapes: Shape[] = [
    { kind: "capsule", material: "skin", u0: -6, u1: 6, r0: 6.5, r1: 6.5, v: 1 },
    { kind: "ellipse", material: "skin", u: 18, v: 1, ru: 15, rv: 12.5 },
    { kind: "ellipse", material: "skin", u: 8, v: 6, ru: 7, rv: 7.5 },
    // Nose and ear.
    { kind: "poly", material: "skin", points: [[18, 11], [12, 16.5], [11, 12]] },
    ...hairShapes(o.hair ?? "crop"),
    { kind: "ellipse", material: "skin", tone: "dark", u: 15, v: -3, ru: 4, rv: 3 },
  ];
  if (o.beard) shapes.push({ kind: "poly", material: "hair", points: [[13, -3], [12, 8], [4, 12], [1, 6], [3, -2]] });
  // Brow, eye, mouth.
  shapes.push(
    { kind: "poly", material: "hair", tone: "dark", flat: true, points: [[22.5, 4], [23, 12], [21, 12.5], [20.5, 4.5]] },
    { kind: "poly", material: "eye", flat: true, points: [[19.5, 7.5], [19.5, 10.5], [16.5, 10.5], [16.5, 7.5]] },
    { kind: "poly", material: "skin", tone: "dark", flat: true, points: [[8.5, 8], [8.5, 13], [7, 13], [7, 8]] },
  );
  return { shapes };
}

/** A person's parts and proportions from a few choices. */
export function person(o: PersonOptions): Pick<Design, "parts" | "proportions"> {
  const k = o.bulk ?? 1;
  const r = (n: number) => n * k;
  const arm = o.sleeves ?? o.shortSleeves ?? "skin";
  const fore = o.sleeves ?? "skin";
  const hand = o.gloves ?? "skin";
  const shin = o.shorts ? "skin" : o.legs;
  const torso: Shape[] = [
    { kind: "ellipse", material: o.legs, u: 4, v: 0, ru: 12, rv: r(15) },
    { kind: "capsule", material: o.top, u0: 10, u1: 52, r0: r(14.5), r1: r(19), v: 1 },
  ];
  const sleeve: Shape[] = o.shortSleeves ? [{ kind: "capsule", material: o.shortSleeves, u0: 0, u1: 16, r0: r(9.5), r1: r(8.5) }] : [];
  const parts: Partial<Record<BoneId, Part>> = {
    torso: { shapes: [...torso, ...(o.extra?.torso ?? [])] },
    head: { shapes: [...head(o).shapes, ...(o.extra?.head ?? [])] },
  };
  for (const side of ["F", "B"] as const) {
    parts[`upperArm${side}`] = { shapes: [{ kind: "capsule", material: arm, u0: 0, u1: 39, r0: r(8.5), r1: r(7) }, ...sleeve, ...(o.extra?.[`upperArm${side}`] ?? [])] };
    parts[`foreArm${side}`] = { shapes: [{ kind: "capsule", material: fore, u0: 0, u1: 34, r0: r(7), r1: r(5.5) }, ...(o.extra?.[`foreArm${side}`] ?? [])] };
    parts[`hand${side}`] = {
      shapes: [{ kind: "ellipse", material: hand, u: 6, v: 0.5, ru: r(7.5), rv: r(7) }, { kind: "capsule", material: hand, u0: 2, u1: 8, r0: r(2.6), r1: r(2.4), v: r(6.2), tone: "dark" }],
      open: [{ kind: "capsule", material: hand, u0: 0, u1: 12, r0: r(5), r1: r(3.8) }, { kind: "capsule", material: hand, u0: 1, u1: 7, r0: 2.3, r1: 2.1, v: r(5) }],
    };
    parts[`thigh${side}`] = { shapes: [{ kind: "capsule", material: o.legs, u0: 0, u1: 50, r0: r(11.5), r1: r(8.5) }, ...(o.extra?.[`thigh${side}`] ?? [])] };
    parts[`shin${side}`] = {
      shapes: [
        { kind: "capsule", material: shin, u0: 0, u1: 47, r0: r(8), r1: r(6) },
        ...(o.extra?.[`shin${side}`] ?? []),
      ],
    };
    parts[`foot${side}`] = {
      shapes: o.shoes
        ? [{ kind: "capsule", material: o.shoes, u0: -3, u1: 19, r0: 6.5, r1: 5, v: -0.5 }, { kind: "poly", material: o.shoes, tone: "dark", flat: true, points: [[-8, -6.5], [24, -5.5], [24, -3.5], [-8, -4.5]] }]
        : [{ kind: "capsule", material: "skin", u0: -2, u1: 18, r0: 5.5, r1: 4 }],
    };
  }
  if (o.shorts) for (const side of ["F", "B"] as const) parts[`thigh${side}`] = { shapes: [{ kind: "capsule", material: "skin", u0: 0, u1: 50, r0: r(10.5), r1: r(8) }, { kind: "capsule", material: o.legs, u0: 0, u1: 26, r0: r(12.5), r1: r(11) }] };
  return { parts, proportions: { ...DEFAULT_PROPORTIONS, ...o.proportions } };
}
