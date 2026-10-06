import { describe, expect, it } from "vitest";
import { RosterFile } from "../roster/schema.ts";
import { fixFileNames, loadMugen, MugenRecipe, PROGRAM_FILES, rosterEntries, unsafeEntries } from "./import.ts";

describe("MUGEN imports", () => {
  it("refuses archive entries that would land outside their folder", () => {
    expect(unsafeEntries(["Barney/Barney.def", "Barney/sub/x.act", "../evil.sh", "/etc/passwd", "a/../../b", "C:\\win.ini", "ok..name.txt"])).toEqual([
      "../evil.sh",
      "/etc/passwd",
      "a/../../b",
      "C:\\win.ini",
    ]);
  });

  it("fixes [Files] names written in other capitals, and reports the missing ones", () => {
    const def = '[Info]\nname = "Barney"\n\n[Files]\nsprite = barney.sff ; the sprites\ncns = barney.cns\nstcommon = common1.cns\npal1 = nightmare.act\npal2 = gone.act\n';
    const r = fixFileNames(def, ["Barney.sff", "Barney.cns", "NightMare.act", "readme.txt"]);
    expect(r.changed).toEqual({ sprite: "Barney.sff", cns: "Barney.cns", pal1: "NightMare.act" });
    expect(r.missing).toEqual(["pal2 = gone.act"]); // stcommon is the engine's own file
    expect(r.text).toContain("sprite = Barney.sff ; the sprites");
    expect(r.text).toContain("stcommon = common1.cns");
    expect(fixFileNames(def.replace(/barney/g, "Barney").replace("nightmare", "NightMare").replace("pal2 = gone.act\n", ""), ["Barney.sff", "Barney.cns", "NightMare.act"]).changed).toEqual({});
  });

  it("gives each import a valid roster entry, never cleared for commercial use", async () => {
    const recipe = await loadMugen();
    expect(recipe.characters.length).toBeGreaterThan(0);
    const entries = recipe.characters.map((c) => rosterEntries(c, `chars/${c.id}/${c.id}.def`));
    const roster = RosterFile.parse({ fighters: entries.map((e) => e.fighter), stages: [], characters: entries.map((e) => e.character) });
    expect(roster.fighters.every((f) => f.commercialUse === false && f.id.startsWith("mugen-"))).toBe(true);
    expect(() => MugenRecipe.parse({ characters: [{ ...recipe.characters[0]!, file: "../x.zip" }] })).toThrow(/a file name/);
  });

  it("leaves programs out, but keeps a character's .cmd command lists", () => {
    const files = ["Barney/Barney.cmd", "Barney/Barney.def", "Barney/setup.exe", "Barney/run.BAT", "Barney/x.dll", "Barney/notes.txt", "Barney/tool.sh"];
    expect(files.filter((f) => PROGRAM_FILES.test(f))).toEqual(["Barney/setup.exe", "Barney/run.BAT", "Barney/x.dll", "Barney/tool.sh"]);
  });
});
