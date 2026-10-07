import { describe, expect, it } from "vitest";
import { BARN_OWL, FARMERS, IRON_HERON, pitchforkArt, PINK_FLAMINGO } from "./farmers.ts";
import { checkSpec, cellList } from "./spec.ts";

describe("the Farmer's dream fighters", () => {
  it("are four spear fighters on one move list, each a complete fighter that throws a pitchfork", () => {
    expect(FARMERS.map((t) => t.name)).toEqual(["Iron Heron", "Pink Flamingo", "Barn Owl", "Violet Stork"]);
    for (const t of FARMERS) {
      expect(checkSpec(t)).toEqual([]);
      const frames = t.art.columns * t.art.rows;
      for (const a of [...t.anims, ...t.attacks.map((x) => x.anim)]) for (const c of cellList(a.cells)) expect(c).toBeLessThan(frames);
      expect(t.attacks.find((a) => a.name === "Pitchfork Toss")?.projectile?.art).toBe(pitchforkArt);
      expect(t.attacks.find((a) => a.name === "Haymaker Flurry")!.hits).toHaveLength(3);
    }
    // The zoner throws on its projectile button; the others on QCB + x.
    expect(IRON_HERON.attacks.find((a) => a.state === 1000)!.name).toBe("Pitchfork Toss");
    expect(BARN_OWL.attacks.find((a) => a.state === 1400)!.name).toBe("Pitchfork Toss");
  });

  it("number a body's frames like the reference's, and measure it on its feet, not its trailing spear", () => {
    expect(cellList(PINK_FLAMINGO.attacks.find((a) => a.state === 240)!.anim.cells)[0]).toBe(341);
    // The axis sits between the feet: 47% across them.
    expect(PINK_FLAMINGO.art.axis).toEqual({ x: 90, y: 107 });
  });

  it("draw a pitchfork that flies, then spins off when it hits", () => {
    const art = pitchforkArt(1400);
    expect(art.actions).toHaveLength(3);
    expect(art.actions[0]!.frames.every((f) => f.clsn1?.length)).toBe(true);
    expect(art.sprites.every((s) => s.image.pixels.some((p) => p >= 240 && p <= 245))).toBe(true);
  });
});
