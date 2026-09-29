import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectLicense, scanIkemen, slugify } from "./scan.ts";

// A fake IKEMEN folder with text files only: no real engine content in tests.
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "gi-scan-"));
  const put = async (rel: string, text: string) => {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), text);
  };
  await put("chars/Hero/Hero.def", '[Info]\nname = "Hero Internal"\ndisplayname = "The Hero"\nauthor = "Someone"\n[Files]\ncns = hero.cns\n');
  await put("chars/Hero/intro.def", "[SceneDef]\nspr = intro.sff\n");
  await put("chars/Hero/readme.txt", "This character is released into the public domain.");
  await put("chars/Mystery/other.def", '[Info]\nname = "Mystery"\n[Files]\nst = m.cns\n');
  await put("chars/Empty/notes.txt", "nothing here");
  await put("stages/arena.def", '[Info]\nname = "Arena"\nauthor = "Builder"\n[StageInfo]\nzoffset = 200\n');
  await put("stages/not-a-stage.def", "[SceneDef]\n");
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("scanIkemen", () => {
  it("drafts fighters, preferring <folder>.def and skipping storyboards", async () => {
    const { fighters } = await scanIkemen(dir);
    const hero = fighters.find((f) => f.id === "hero");
    expect(hero).toMatchObject({ displayName: "The Hero", def: "chars/Hero/Hero.def", enabled: true });
    expect(hero?.license).toMatch(/^By Someone\. Public domain/);
  });

  it("disables fighters with no license and warns about empty folders", async () => {
    const { fighters, warnings } = await scanIkemen(dir);
    expect(fighters.find((f) => f.id === "mystery")).toMatchObject({ def: "chars/Mystery/other.def", enabled: false });
    expect(warnings.join("\n")).toMatch(/Mystery: no license/);
    expect(warnings.join("\n")).toMatch(/Empty: no character .def/);
  });

  it("drafts stages as disabled until a license is confirmed", async () => {
    const { stages } = await scanIkemen(dir);
    expect(stages).toHaveLength(1);
    expect(stages[0]).toMatchObject({ id: "arena", displayName: "Arena", def: "stages/arena.def", enabled: false });
  });

  it("handles a folder with no chars or stages", async () => {
    const empty = await mkdtemp(path.join(tmpdir(), "gi-empty-"));
    const result = await scanIkemen(empty);
    expect(result.fighters).toEqual([]);
    expect(result.warnings).toHaveLength(2);
    await rm(empty, { recursive: true, force: true });
  });
});

describe("detectLicense", () => {
  it("recognizes the Kung Fu Man readme wording", () => {
    expect(detectLicense("KFM is licensed under the Creative Commons Noncommercial\nLicense.")).toMatch(/Non-Commercial/);
  });

  it("returns null when nothing matches", () => {
    expect(detectLicense("Have fun!")).toBeNull();
  });
});

describe("slugify", () => {
  it("makes safe ids", () => {
    expect(slugify("Kung Fu Man ZSS")).toBe("kung-fu-man-zss");
    expect(slugify("stage0_720")).toBe("stage0-720");
    expect(slugify("***")).toBe("unnamed");
  });
});
