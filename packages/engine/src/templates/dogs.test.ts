import { describe, expect, it } from "vitest";
import { readWav } from "../art/wav.ts";
import { EXPLOSION_STATE } from "../mugen/gags.ts";
import { commandsFile, defFile, statesFile } from "./cns.ts";
import { ballArt, DOGS, dogSounds, GOOD_BOY, howlArt, MISTER_YAPPERS, poopArt, SOUNDS, WORD_ANIM, wordArt } from "./dogs.ts";
import { cellList } from "./spec.ts";

describe("the dogs", () => {
  it("are six, each on a different breed with its own name", () => {
    expect(DOGS.map((d) => d.name)).toEqual(["Good Boy", "Much Wow", "Gentle Giant", "Mister Yappers", "Big Bernie", "Awoo"]);
    expect(new Set(DOGS.map((d) => d.art.id)).size).toBe(6);
  });

  it("all have the gag moves: a poop bomb (Good Boy: a tennis ball) and a stink cloud, plus the explosion", () => {
    for (const d of DOGS) {
      const names = d.attacks.map((a) => a.name);
      expect(names).toContain(d === GOOD_BOY ? "Tennis Ball" : "Poop Bomb");
      expect(names).toContain("Silent but Deadly");
      expect(d.gags).toEqual(["explosion"]);
    }
    const yappers = MISTER_YAPPERS;
    expect(statesFile(yappers)).toContain(`[Statedef ${EXPLOSION_STATE}]`);
    expect(commandsFile(yappers)).toContain("GI gag: the big explosion");
    expect(defFile(yappers, 4)).toMatch(/^fx = data\/gifx\/gifx\.def$/m);
  });

  it("say their words as readable effects that exist", () => {
    for (const d of DOGS) {
      const words = d.effectArt!();
      for (const cue of d.cues ?? []) {
        if (!cue.effect) continue;
        expect(words.actions.some((a) => a.action === cue.effect!.anim)).toBe(true);
        expect(cue.effect.readable).toBe(true);
      }
    }
    const art = wordArt(["WOOF!", "SQUIRREL!"]);
    expect(art.actions.map((a) => a.action)).toEqual([WORD_ANIM, WORD_ANIM + 1]);
    expect(art.sprites[1]!.image.width).toBeGreaterThan(art.sprites[0]!.image.width);
  });

  it("block in the cone of shame and taunt at a squirrel", () => {
    const anim = (action: number) => GOOD_BOY.anims.find((a) => a.action === action)!;
    expect(anim(130).cells).toHaveLength(1);
    expect(anim(195).comment).toMatch(/SQUIRREL/);
    expect(cellList(anim(195).cells)).toHaveLength(12);
  });

  it("draw their projectiles: a howl, a poop and a tennis ball, each flying, hitting and fading", () => {
    for (const art of [howlArt()(1000), poopArt(1400), ballArt(1400)]) {
      expect(art.actions).toHaveLength(3);
      expect(art.actions[0]!.frames.every((f) => f.clsn1?.length)).toBe(true);
      expect(art.sprites.every((s) => s.image.pixels.some((p) => p > 0))).toBe(true);
    }
  });

  it("make their sounds in code, a squeak, a fart and a splat among them", () => {
    const sounds = dogSounds(1);
    for (const s of [SOUNDS.squeak, SOUNDS.fart, SOUNDS.splat, SOUNDS.bark, SOUNDS.howl]) expect(sounds.some((x) => x.group === s[0] && x.number === s[1])).toBe(true);
    for (const s of sounds) expect(readWav(s.wav).data.length).toBeGreaterThan(1000);
  });
});
