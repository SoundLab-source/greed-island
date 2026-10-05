import { describe, expect, it } from "vitest";
import { parseCode, scanCheats } from "./cheats.ts";

const cns = (text: string) => [{ name: "char.cns", text }];

describe("cheat scanner", () => {
  it("finds nothing in an ordinary character", () => {
    const text = `
[Data]
life = 1000 ; normal
attack = 100
defence = 100

[Statedef 200]
type = S

[State 200, hit]
type = HitDef
trigger1 = Time = 0
damage = 30, 5

[Statedef -2]
[State -2, intro only]
type = NotHitBy
trigger1 = StateNo = 191
value = SCA
time = 1
`;
    expect(scanCheats(cns(text))).toEqual([]);
  });

  it("flags the usual tricks, cheats first, with file and line", () => {
    const text = [
      "[Data]",
      "life = 9999",
      "attack = 160",
      "[Statedef -2]",
      "[State -2, god mode]",
      "type = NotHitBy",
      "trigger1 = 1",
      "value = SCA",
      "time = 1",
      "[State -2, never die]",
      "type = AssertSpecial",
      "trigger1 = 1",
      "flag = NoKO",
      "[Statedef 3000]",
      "[State 3000, touch of death]",
      "type = HitDef",
      "trigger1 = AnimElem = 2",
      "damage = 9999",
      "[State 3000, freeze]",
      "type = SuperPause",
      "trigger1 = Time = 0",
      "time = 600",
      "[State 3000, kill]",
      "type = TargetLifeAdd",
      "trigger1 = Time = 5",
      "value = -1000",
    ].join("\n");
    const found = scanCheats(cns(text));
    expect(found.map((f) => [f.level, f.line])).toEqual([
      ["cheat", 2],
      ["cheat", 8],
      ["cheat", 13],
      ["cheat", 18],
      ["cheat", 26],
      ["check", 3],
      ["check", 22],
    ]);
    expect(found[0]).toMatchObject({ what: "boosted life: 9999 (normal 1000)", file: "char.cns", text: "life = 9999" });
    expect(found.find((f) => f.line === 8)!.what).toMatch(/can't be hit/);
  });

  it("calls conditional always-running invincibility and expressions a check, not a cheat", () => {
    const text = `
[Statedef -2]
[State -2, armour]
type = NotHitBy
trigger1 = Var(10) = 1
value = SCA
[Statedef 1000]
[State 1000, super]
type = HitDef
trigger1 = 1
damage = ifelse(Var(5), 300, 120)
`;
    expect(scanCheats(cns(text)).map((f) => f.level)).toEqual(["check", "check"]);
  });

  it("reads controllers under their Statedef, ignoring comments and case", () => {
    const { blocks, data } = parseCode({ name: "x.cmd", text: '[StateDef -1]\n[State -1, Run] ; a comment\nTYPE = ChangeState\ntrigger1 = command = "x;y" ; comment\nvalue = 100\n[Data]\nLife = 1200' });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ statedef: -1, type: "changestate", triggers: ['command = "x;y"'] });
    expect(data.get("life")?.value).toBe("1200");
  });
});
