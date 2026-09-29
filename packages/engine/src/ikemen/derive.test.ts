import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { iniValue, parseIni } from "../roster/ini.ts";
import { deriveCharacter, MARKER, pruneDerived, readConstants } from "./derive.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "gi-derive-"));
  await mkdir(path.join(dir, "chars", "hero"), { recursive: true });
  await writeFile(path.join(dir, "chars", "hero", "hero.def"), '[Info]\nname = "Hero"\n[Files]\ncns = hero.cns\n');
  await writeFile(path.join(dir, "chars", "hero", "hero.cns"), "[Data]\nlife = 1100\nattack = 110 ;atk\ndefence = 90\n");
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const spec = (attack: string, hash = attack) => ({
  srcDefPath: "chars/hero/hero.def",
  destId: `gi-loadout-${hash}`,
  hash,
  constants: { Data: { attack, defence: "95" } },
  generatedBy: "test",
});

describe("deriveCharacter", () => {
  it("builds a copy with changed constants and leaves the source alone", async () => {
    const r = await deriveCharacter(dir, spec("121"));
    expect(r).toEqual({ defPath: "chars/gi-loadout-121/gi-loadout-121.def", status: "built" });
    const cns = parseIni(await readFile(path.join(dir, "chars", "gi-loadout-121", "hero.cns"), "latin1"));
    expect([iniValue(cns, "Data", "life"), iniValue(cns, "Data", "attack"), iniValue(cns, "Data", "defence")]).toEqual(["1100", "121", "95"]);
    expect(await readConstants(dir, "chars/hero/hero.def")).toEqual({ life: 1100, attack: 110, defence: 90 });
    expect(await readConstants(dir, r.defPath)).toEqual({ life: 1100, attack: 121, defence: 95 });
    expect(existsSync(path.join(dir, "chars", "gi-loadout-121.tmp-" + process.pid))).toBe(false);
  });

  it("reuses an unchanged copy and refuses folders it didn't make", async () => {
    await deriveCharacter(dir, spec("121"));
    expect((await deriveCharacter(dir, spec("121"))).status).toBe("unchanged");
    await mkdir(path.join(dir, "chars", "gi-loadout-x"), { recursive: true });
    await expect(deriveCharacter(dir, spec("130", "x"))).rejects.toThrow(/wasn't made by Greed Island/);
  });

  it("reads MUGEN defaults when a character has no constants file", async () => {
    await mkdir(path.join(dir, "chars", "bare"), { recursive: true });
    await writeFile(path.join(dir, "chars", "bare", "bare.def"), "[Info]\nname = Bare\n");
    expect(await readConstants(dir, "chars/bare/bare.def")).toEqual({ life: 1000, attack: 100, defence: 100 });
  });
});

describe("pruneDerived", () => {
  it("keeps the most recently used copies and only deletes its own folders", async () => {
    for (const [i, a] of ["101", "102", "103", "104"].entries()) {
      await deriveCharacter(dir, spec(a));
      const t = new Date(Date.UTC(2026, 0, 1 + i));
      await utimes(path.join(dir, "chars", `gi-loadout-${a}`, MARKER), t, t);
    }
    // Reusing 101 marks it as recently used.
    await deriveCharacter(dir, spec("101"));
    await mkdir(path.join(dir, "chars", "gi-loadout-foreign"), { recursive: true });
    expect(await pruneDerived(dir, "gi-loadout-", 2)).toBe(2);
    const left = ["101", "102", "103", "104"].filter((a) => existsSync(path.join(dir, "chars", `gi-loadout-${a}`)));
    expect(left).toEqual(["101", "104"]);
    expect(existsSync(path.join(dir, "chars", "gi-loadout-foreign"))).toBe(true);
  });
});
