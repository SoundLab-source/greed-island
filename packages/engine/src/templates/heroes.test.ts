import { describe, expect, it } from "vitest";
import { readWav } from "../art/wav.ts";
import { ARMS_DEALER, HERO_CONFIGS, HEROES, HOT_TAKES, KING_ME, ROBIN_HOODIE, SIR_BONKALOT, STABBY } from "./hero-fighters.ts";
import { heroSounds, SOUNDS, waveArt, WORD_ANIM } from "./heroes.ts";
import { checkSpec, REQUIRED_ACTIONS } from "./spec.ts";

describe("the heroes from the combat packs", () => {
  it("are complete fighters: every animation the engine plays, and nothing the checks object to", () => {
    for (const h of HEROES) {
      expect(checkSpec(h)).toEqual([]);
      const actions = new Set([...h.anims.map((a) => a.action), ...h.attacks.map((a) => a.state)]);
      for (const r of REQUIRED_ACTIONS) expect(actions.has(r)).toBe(true);
      expect(h.gags).toEqual(["explosion"]);
    }
    expect(new Set(HEROES.map((h) => h.id)).size).toBe(HEROES.length);
  });

  it("each have a signature move of their own on QCB + x, with its own name", () => {
    for (const h of HEROES) expect(h.attacks.find((a) => a.state === 1400)).toMatchObject({ command: "QCB_x", special: true });
    expect(new Set(HEROES.map((h) => h.attacks.find((a) => a.state === 1400)!.name)).size).toBe(HEROES.length);
    expect(HERO_CONFIGS.map((c) => c.id)).toEqual(HEROES.map((h) => h.id));
    // Arms Dealer's goes through all four weapons, a hit each; King Me knights you before throwing you.
    expect(ARMS_DEALER.attacks.find((a) => a.state === 1400)!.hits).toHaveLength(4);
    expect(KING_ME.throws!.map((t) => t.name)).toEqual(["Running Grab", "Knighting"]);
    expect(ROBIN_HOODIE.attacks.find((a) => a.state === 1000)!.name).toBe("Arrow");
    const signature = (id: string) => HEROES.find((h) => h.id === id)!.attacks.find((a) => a.state === 1400)!;
    expect(signature(SIR_BONKALOT.id)).toMatchObject({ name: "Frying Pan", command: "QCB_x" });
    expect(signature(HOT_TAKES.id)).toMatchObject({ name: "Hot Take", command: "QCB_x", projectile: { speed: 0, hits: 2 } });
    expect(signature(STABBY.id)).toMatchObject({ name: "Bomb Roll", command: "QCB_x" });
    expect(signature(STABBY.id).hits[0]!.height).toBe("low");
  });

  it("use their pack's own attacks for the normals, and the archetype's specials", () => {
    expect(SIR_BONKALOT.attacks.map((a) => a.state).sort((x, y) => x - y)).toEqual([200, 210, 230, 240, 400, 410, 430, 440, 600, 630, 1000, 1100, 1200, 1400]);
    // The zoner's fireball comes from the pack's fire ball strip.
    const shot = HOT_TAKES.attacks.find((a) => a.state === 1000)!;
    expect(shot.projectile?.art).toBeTypeOf("function");
    expect(HOT_TAKES.anims.find((a) => a.action === 195)!.comment).toMatch(/marshmallow/);
  });

  it("say their words as readable effects that exist", () => {
    for (const h of HEROES) {
      const words = h.effectArt!();
      for (const cue of h.cues ?? []) {
        if (!cue.effect) continue;
        expect(cue.effect.anim).toBeGreaterThanOrEqual(WORD_ANIM);
        expect(words.actions.some((a) => a.action === cue.effect!.anim)).toBe(true);
        expect(cue.effect.readable).toBe(true);
      }
    }
  });

  it("make their sounds in code, a frying pan's bonk among them", () => {
    const sounds = heroSounds();
    for (const s of [SOUNDS.bonk, SOUNDS.swish, SOUNDS.boom, SOUNDS.fire]) expect(sounds.some((x) => x.group === s[0] && x.number === s[1])).toBe(true);
    for (const s of sounds) expect(readWav(s.wav).data.length).toBeGreaterThan(1000);
  });

  it("draw a sword wave that flies, hits and fades", () => {
    const art = waveArt(200, 207)(1000);
    expect(art.actions).toHaveLength(3);
    expect(art.actions[0]!.frames.every((f) => f.clsn1?.length)).toBe(true);
  });
});
