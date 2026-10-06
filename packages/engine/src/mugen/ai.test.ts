import { describe, expect, it } from "vitest";
import { ALL_ROUNDER } from "../templates/all-rounder.ts";
import { airReach, hasOwnAi, insertIntoMinus1, loadOrder, mugenAi, parseStates } from "./ai.ts";

const cmd = [
  '[Command]\r\nname = "x"\r\ncommand = x',
  "[Statedef -1]",
  "",
  "; Run",
  "[State -1]",
  "type = ChangeState",
  "value = 100",
  'trigger1 = command = "FF"',
  "trigger1 = statetype = S",
  "",
  "[State -1, Punch]",
  "type = ChangeState",
  "value = 200",
  'triggerall = command = "x"',
  'triggerall = command != "holddown" ; standing',
  "trigger1 = statetype = S",
  "trigger1 = ctrl",
  "",
  "[State -1, Low Kick]",
  "type = ChangeState",
  "value = 400",
  'triggerall = command = "a"',
  'triggerall = command = "holddown"',
  "trigger1 = statetype = C",
  "trigger1 = ctrl",
  "",
  "[State -1, Fireball]",
  "type = ChangeState",
  "value = 1000",
  'triggerall = command = "QCF_x"',
  "triggerall = power >= 1000",
  "trigger1 = ctrl",
  "",
  "[State -1, Disabled]",
  "type = null; ChangeState",
  "value = 200",
  'trigger1 = command = "y"',
].join("\r\n");

const cns = `
[Statedef 200]
type = S
movetype = A
anim = 200
[State 200, hit]
type = HitDef
trigger1 = AnimElem = 2
damage = 30

[Statedef 400]
type = C
movetype = A
anim = 400
[State 400, hit]
type = HitDef
trigger1 = 1
damage = 20

[Statedef 1000]
type = S
movetype = A
anim = 1000
[State 1000, ball]
type = Projectile
trigger1 = AnimElem = 3
`;

const air = `
[Begin Action 200]
Clsn2Default: 1
 Clsn2[0] = -10,-80, 10, 0
200,0, 0,0, 3
Clsn1: 1
 Clsn1[0] = 60,-60, 10,-50 ; written right to left
200,1, 0,0, 4
200,2, 0,0, 5
[Begin Action 400]
400,0, 0,0, 2
Clsn1Default: 1
 Clsn1[0]= 5,-10, 45,0
400,1, 0,0, 3
400,2, 0,0, 3
`;

describe("MUGEN AI", () => {
  it("reads hitbox reach and startup from a MUGEN .air file", () => {
    expect([...airReach(air)]).toEqual([
      [200, { reach: 60, startup: 3 }],
      [400, { reach: 45, startup: 2 }],
    ]);
  });

  it("reads statedefs and their controllers' lines in order", () => {
    const [minus1] = parseStates({ name: "c.cmd", text: cmd });
    expect(minus1!.number).toBe(-1);
    expect(minus1!.controllers.map((c) => c.type)).toEqual(["changestate", "changestate", "changestate", "changestate", "null"]);
    expect(minus1!.controllers[1]!.lines).toEqual([["value", "200"], ["triggerall", 'command = "x"'], ["triggerall", 'command != "holddown"'], ["trigger1", "statetype = S"], ["trigger1", "ctrl"]]);
  });

  it("drives each attack from the opponent's distance, keeping the character's own conditions", () => {
    const ai = mugenAi({ files: [{ name: "c.cns", text: cns }, { name: "c.cmd", text: cmd }], air, front: 15, scale: 1, ai: ALL_ROUNDER.ai });
    expect(ai.file).toBe("c.cmd");
    // The run (not an attack) and the disabled controller are left out; the projectile is used from afar.
    expect(ai.attacks).toEqual([
      { state: 200, commands: ["x", "holddown"], kind: "melee", reach: 45 },
      { state: 400, commands: ["a", "holddown"], kind: "melee", reach: 30 },
      { state: 1000, commands: ["QCF_x"], kind: "ranged" },
    ]);
    const text = ai.text;
    // Inserted at the top of [Statedef -1], before the character's own commands, in its line endings.
    expect(text.indexOf("GI AI: in control")).toBeGreaterThan(text.indexOf("[Statedef -1]"));
    expect(text.indexOf("GI AI: in control")).toBeLessThan(text.indexOf("; Run"));
    expect(text.split("\r\n").length).toBeGreaterThan(cmd.split("\r\n").length);
    const block = (state: number) => text.slice(text.indexOf(`[State -1, GI AI: ${state} `), text.indexOf("\r\n\r\n", text.indexOf(`[State -1, GI AI: ${state} `)));
    expect(block(200)).toContain("triggerall = P2BodyDist X <= 50 && P2BodyDist X >= -10");
    expect(block(200)).toContain("triggerall = 1"); // command = "x", taken as pressed
    expect(block(200)).not.toContain("command");
    expect(block(400)).toContain("trigger1 = StateType != A"); // a crouching attack starts from standing
    expect(block(1000)).toContain("triggerall = power >= 1000");
    expect(block(1000)).toContain("P2BodyDist X > 70");
    expect(text).toContain('map = "gi_block"');
  });

  it("knows a character with its own AI, and the engine's file order", () => {
    expect(hasOwnAi([{ name: "c.cmd", text: cmd }])).toBe(false);
    expect(hasOwnAi([{ name: "c.cmd", text: cmd + "\r\n[State -1, AI]\r\ntype = ChangeState\r\ntrigger1 = AILevel > 0\r\nvalue = 200" }])).toBe(true);
    expect(hasOwnAi([{ name: "c.cmd", text: '[Command]\nname = "CPU1"\ncommand = U,D,U,D' }])).toBe(true);
    expect(hasOwnAi([{ name: "c.cmd", text: "; AILevel in a comment only" }])).toBe(false);
    expect(loadOrder(new Map([["cmd", "c.cmd"], ["st2", "b.cns"], ["st", "a.cns"], ["st10", "d.cns"], ["cns", "c.cns"]]))).toEqual(["a.cns", "b.cns", "d.cns", "c.cmd"]);
  });

  it("adds a [Statedef -1] when the character has none", () => {
    expect(insertIntoMinus1("[Statedef 0]\ntype = S", ["; ai"])).toBe("[Statedef 0]\ntype = S\n\n[Statedef -1]\n\n; ai");
    expect(insertIntoMinus1("[Statedef -1]\nfoo = 1\n[State -1, a]\ntype = Null", ["; ai"])).toBe("[Statedef -1]\nfoo = 1\n; ai\n[State -1, a]\ntype = Null");
  });
});
