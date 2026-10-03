import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { lookProblem, parseLookCosmetic, plateColorsFromPixels } from "./looks.ts";
import { describeCosmetics, parseCosmetics } from "./titles.ts";

/** RGBA pixels: `count` pixels of each colour. */
function pixels(...parts: [r: number, g: number, b: number, a: number, count: number][]): Uint8Array {
  const out: number[] = [];
  for (const [r, g, b, a, count] of parts) for (let i = 0; i < count; i++) out.push(r, g, b, a);
  return Uint8Array.from(out);
}

describe("plateColorsFromPixels", () => {
  it("darkens the main colour for the background and uses a vivid one for the border", () => {
    const c = plateColorsFromPixels(pixels([40, 80, 200, 255, 900], [250, 200, 20, 255, 100]))!;
    expect(c.background).toBe("#0e1c46");
    expect(c.border).toBe("#fac814");
    expect(c.text).toBe("#f9fafb");
  });

  it("ignores transparent pixels and brightens a dark border", () => {
    const c = plateColorsFromPixels(pixels([0, 0, 0, 0, 5000], [10, 10, 10, 255, 50], [60, 0, 0, 255, 40]))!;
    expect(c.background).toBe("#040404");
    expect(parseInt(c.border.slice(1, 3), 16)).toBeGreaterThan(150);
  });

  it("has nothing to say about empty or fully transparent images", () => {
    expect(plateColorsFromPixels(new Uint8Array())).toBeNull();
    expect(plateColorsFromPixels(pixels([255, 0, 0, 0, 100]))).toBeNull();
  });

  it("always gives valid colours (property)", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 4, maxLength: 4000 }), (bytes) => {
        const c = plateColorsFromPixels(bytes);
        if (c) for (const v of Object.values(c)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
      }),
    );
  });
});

describe("looks in cosmetics", () => {
  it("parses a frozen look and puts its colours on the name plate", () => {
    const look = { id: "l1", name: "Pixel Monk #42", colors: { background: "#101010", border: "#ff0000", text: "#f9fafb" } };
    expect(parseLookCosmetic(look)).toEqual(look);
    expect(parseLookCosmetic({ id: "l1", name: "x", colors: { background: "red" } })).toEqual({ id: "l1", name: "x", colors: null });
    expect(parseLookCosmetic("junk")).toBeUndefined();
    const c = parseCosmetics({ title: null, nameplate: "gold", badges: [], look });
    expect(c.look).toEqual(look);
    const d = describeCosmetics(c);
    expect(d.nameplate).toMatchObject({ id: "gold", label: "NFT look", background: "#101010", border: "#ff0000" });
    expect(d.look).toEqual({ id: "l1", name: "Pixel Monk #42", image: "/api/looks/l1/image", card: null });
    // With its sprites recoloured: its own character, and a picture of the fighter in its colours.
    const defPath = "chars/gi-look-0123456789abcdef0123456789abcdef/gi-look-0123456789abcdef0123456789abcdef.def";
    expect(parseLookCosmetic({ ...look, defPath })).toEqual({ ...look, defPath });
    expect(describeCosmetics(parseCosmetics({ title: null, nameplate: "gold", badges: [], look: { ...look, defPath } })).look).toMatchObject({ card: "/api/looks/l1/card" });
    // Only ever one of our look characters.
    for (const bad of ["chars/kfm/kfm.def", "chars/gi-look-0123456789abcdef0123456789abcdef/other.def", "../x.def", 42]) expect(parseLookCosmetic({ ...look, defPath: bad })).toEqual(look);
    // No look: nothing changes.
    expect(parseCosmetics({ title: null, nameplate: "gold", badges: [] })).toEqual({ title: null, nameplate: "gold", badges: [] });
    expect(describeCosmetics(parseCosmetics(null)).look).toBeNull();
  });
});

describe("lookProblem", () => {
  const base = { userId: "me", ownerUserId: "me", characterFighterId: "monk", collection: { name: "Pixel Monks", fighterId: "monk" }, usedElsewhere: false };
  it("lets an owner dress their copy of the community's fighter, once per NFT", () => {
    expect(lookProblem(base)).toBeNull();
    expect(lookProblem({ ...base, ownerUserId: "you" })).toMatch(/you own/);
    expect(lookProblem({ ...base, collection: { name: "Pixel Monks", fighterId: null } })).toMatch(/doesn't have a community fighter/);
    expect(lookProblem({ ...base, characterFighterId: "crane" })).toMatch(/only for that community's fighter/);
    expect(lookProblem({ ...base, usedElsewhere: true })).toMatch(/already on another character/);
  });
});
