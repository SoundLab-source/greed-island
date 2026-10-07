import { describe, expect, it } from "vitest";
import { MugenRecipe } from "./import.ts";
import { fixStagePaths, stageRosterEntry } from "./stages.ts";

const DEF = `[Info]
name = "Space"

[Music]
bgmusic = sound/Space Theme.mp3
bgvolume = 100

[BGdef]
spr = SPACE.SFF

[BG 0]
spriteno = 0,0
`;

describe("MUGEN stages", () => {
  it("point sprite and music paths at the files really in the stage's folder", () => {
    const r = fixStagePaths(DEF, ["space.sff", "Space Theme.mp3"]);
    expect(r.changed).toEqual({ bgmusic: '"Space Theme.mp3"', spr: '"space.sff"' });
    expect(r.missing).toEqual([]);
    expect(r.text).toMatch(/^bgmusic = "Space Theme\.mp3"$/m);
    expect(r.text).toMatch(/^spr = "space\.sff"$/m);
    // Everything else stays as it was.
    expect(r.text).toMatch(/^spriteno = 0,0$/m);
  });

  it("leave paths that already match alone, and report what's not there", () => {
    expect(fixStagePaths(DEF.replace("SPACE.SFF", "space.sff"), ["space.sff"])).toMatchObject({ changed: {}, missing: ["bgmusic = sound/Space Theme.mp3"] });
  });

  it("are listed in the recipe, never cleared for commercial use", () => {
    const stage = {
      id: "mugen-space",
      name: "Space",
      file: "space.rar",
      sha256: "0".repeat(64),
      source: "https://mugenarchive.com/forums/downloads.php?do=file&id=1",
      author: "Someone",
    };
    const recipe = MugenRecipe.parse({ characters: [], stages: [stage] });
    expect(recipe.stages).toHaveLength(1);
    expect(MugenRecipe.parse({ characters: [] }).stages).toEqual([]);
    expect(() => MugenRecipe.parse({ characters: [], stages: [stage, stage] })).toThrow(/duplicate id/);
    expect(stageRosterEntry(recipe.stages[0]!, "stages/mugen-space/mugen-space.def")).toMatchObject({ id: "mugen-space", commercialUse: false, def: "stages/mugen-space/mugen-space.def" });
  });
});

describe("MUGEN stages packed in MUGEN's folders", () => {
  it("bring in music kept in a sound/ folder beside the stage's", () => {
    const r = fixStagePaths(DEF.replace("SPACE.SFF", "space.sff"), ["space.sff"], ["sound/Space Theme.mp3", "readme.txt"]);
    expect(r.missing).toEqual([]);
    expect(r.copies).toEqual([{ from: "sound/Space Theme.mp3", to: "Space Theme.mp3" }]);
    expect(r.text).toMatch(/^bgmusic = "Space Theme\.mp3"$/m);
  });
});
