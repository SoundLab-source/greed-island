import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { iniValue, parseIni, patchIni } from "./ini.ts";
import { loadRoster } from "./schema.ts";
import { buildVariant, loadVariants, Variant, variantDefPath, VariantRecipe } from "./variants.ts";

describe("patchIni", () => {
  const text = [
    "; header",
    "[Data]",
    "life = 1000",
    "attack = 100   ;Attack power",
    "Defence=100",
    "",
    "[Size]",
    "xscale = 1           ;Horizontal scaling factor.",
    "[Statedef 0]",
    "life = 5 ; not a constant: must not change",
  ].join("\r\n");

  it("replaces values in the first matching section, keeping comments and line endings", () => {
    const out = patchIni(text, "data", { life: "850", attack: "110", defence: "90" });
    expect(out).toContain("life = 850\r\n");
    expect(out).toContain("attack = 110   ;Attack power");
    expect(out).toContain("Defence=90");
    expect(out).toContain("life = 5 ; not a constant: must not change");
    expect(out.split("\r\n")).toHaveLength(text.split("\r\n").length);
  });

  it("adds keys that are missing, right after the header", () => {
    const out = patchIni(text, "Size", { xscale: "1.2", yscale: "1.2" });
    const lines = out.split("\r\n");
    expect(lines[lines.indexOf("[Size]") + 1]).toBe("yscale = 1.2");
    expect(out).toContain("xscale = 1.2           ;Horizontal scaling factor.");
  });

  it("fails loudly when the section is missing", () => {
    expect(() => patchIni(text, "Velocity", { "walk.fwd": "3" })).toThrow(/Velocity/);
  });
});

describe("variants.json", () => {
  it("is valid, and every variant is in roster.json with its own palette", async () => {
    const recipe = await loadVariants();
    const roster = await loadRoster();
    expect(recipe.variants.length).toBeGreaterThanOrEqual(8);
    for (const v of recipe.variants) {
      expect(roster.fighters.find((f) => f.id === v.id)).toMatchObject({ def: variantDefPath(v), archetype: v.archetype });
      expect(roster.characters.find((c) => c.fighter === v.id)).toMatchObject({ palette: v.palette, name: v.name });
    }
  });

  it("rejects duplicate palettes and ids", () => {
    const v = { id: "gi-a", name: "A", archetype: "HEAVY", palette: 5, scale: 1, data: { life: 1000, attack: 100, defence: 100 } };
    expect(VariantRecipe.safeParse({ base: "chars/kfm", baseDef: "kfm.def", variants: [v, { ...v, id: "gi-b" }] }).success).toBe(false);
    expect(VariantRecipe.safeParse({ base: "chars/kfm", baseDef: "kfm.def", variants: [v, { ...v, palette: 6 }] }).success).toBe(false);
  });
});

describe("buildVariant", () => {
  let dir: string;
  const sff = Buffer.from([0x45, 0x6c, 0x65, 0x63, 0x00, 0xff, 0x80, 0x01]); // binary bytes must survive
  const recipe = VariantRecipe.parse({ base: "chars/base", baseDef: "base.def", variants: [] });
  const variant: Variant = Variant.parse({
    id: "gi-test",
    name: "Test Monk",
    archetype: "HEAVY",
    palette: 7,
    scale: 1.2,
    data: { life: 1300, attack: 110, defence: 115 },
    velocity: { "walk.fwd": "1.8", "run.fwd": "3.6, 0" },
  });

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "gi-variant-"));
    const base = path.join(dir, "chars", "base");
    await mkdir(base, { recursive: true });
    await writeFile(path.join(base, "base.def"), '[Info]\nname = "Base"\ndisplayname = "Base"\nauthor = "Elecbyte"\npal.defaults = 1,2\n\n[Files]\ncns = base.cns\nsprite = base.sff\n');
    await writeFile(path.join(base, "base.cns"), "[Data]\nlife = 1000\nattack = 100\ndefence = 100\n\n[Size]\nxscale = 1 ;x\nyscale = 1 ;y\n\n[Velocity]\nwalk.fwd = 2.4 ;w\nrun.fwd = 4.6, 0\n\n[Statedef 0]\ntype = S\n");
    await writeFile(path.join(base, "base.sff"), sff);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("copies the base, renames the .def, and changes only the recipe's values", async () => {
    expect(await buildVariant(dir, recipe, variant)).toMatchObject({ status: "built", defPath: "chars/gi-test/gi-test.def" });
    const out = path.join(dir, "chars", "gi-test");
    const def = parseIni(await readFile(path.join(out, "gi-test.def"), "latin1"));
    expect(iniValue(def, "Info", "displayname")).toBe("Test Monk");
    expect(iniValue(def, "Info", "author")).toBe("Elecbyte (variant: Greed Island)");
    expect(iniValue(def, "Info", "pal.defaults")).toBe("7");
    const cnsText = await readFile(path.join(out, "base.cns"), "latin1");
    const cns = parseIni(cnsText);
    expect([iniValue(cns, "Data", "life"), iniValue(cns, "Data", "attack"), iniValue(cns, "Data", "defence")]).toEqual(["1300", "110", "115"]);
    expect([iniValue(cns, "Size", "xscale"), iniValue(cns, "Size", "yscale")]).toEqual(["1.2", "1.2"]);
    expect([iniValue(cns, "Velocity", "walk.fwd"), iniValue(cns, "Velocity", "run.fwd")]).toEqual(["1.8", "3.6, 0"]);
    expect(cnsText).toContain("[Statedef 0]\ntype = S");
    expect(await readFile(path.join(out, "base.sff"))).toEqual(sff);
    // The base character itself is untouched.
    expect(await readFile(path.join(dir, "chars", "base", "base.cns"), "latin1")).toContain("life = 1000");
  });

  it("skips an unchanged variant and rebuilds a changed one", async () => {
    await buildVariant(dir, recipe, variant);
    expect((await buildVariant(dir, recipe, variant)).status).toBe("unchanged");
    const changed = { ...variant, data: { ...variant.data, life: 1400 } };
    expect((await buildVariant(dir, recipe, changed)).status).toBe("built");
    expect(iniValue(parseIni(await readFile(path.join(dir, "chars", "gi-test", "base.cns"), "latin1")), "Data", "life")).toBe("1400");
  });

  it("never overwrites a folder it didn't create", async () => {
    await mkdir(path.join(dir, "chars", "gi-test"), { recursive: true });
    await writeFile(path.join(dir, "chars", "gi-test", "mine.txt"), "user content");
    await expect(buildVariant(dir, recipe, variant)).rejects.toThrow(/wasn't made by Greed Island/);
    expect(await readFile(path.join(dir, "chars", "gi-test", "mine.txt"), "utf8")).toBe("user content");
  });
});
