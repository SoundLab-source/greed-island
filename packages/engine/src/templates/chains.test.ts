import { describe, expect, it } from "vitest";
import { CHAINS, GHOST_MANTIS, laserArt, LAVA_LIZARD, NEON_MOTH, steps, SWAMP_CROC } from "./chains.ts";
import { checkSpec, cellList } from "./spec.ts";

describe("the Chains of compassion fighters", () => {
  it("are eight bodies on one kung-fu move list, each a complete fighter with a blaster", () => {
    expect(CHAINS.map((t) => t.name)).toEqual(["Lava Lizard", "Blue Jay", "Swamp Croc", "Jungle Boar", "Snow Rhino", "Ghost Mantis", "Neon Moth", "Iron Raven"]);
    for (const t of CHAINS) {
      expect(checkSpec(t)).toEqual([]);
      const frames = t.art.columns * t.art.rows;
      for (const a of [...t.anims, ...t.attacks.map((x) => x.anim)]) for (const c of cellList(a.cells)) expect(c).toBeLessThan(frames);
      const gun = t.attacks.find((a) => a.name === "Pew Pew")!;
      expect(gun.projectile?.art).toBe(laserArt);
      expect(t.cues?.some((c) => c.action === gun.state && c.effect?.readable)).toBe(true);
    }
  });

  it("put the blaster on QCB + x, or on the zoner's projectile button", () => {
    expect(LAVA_LIZARD.attacks.find((a) => a.state === 1400)).toMatchObject({ name: "Pew Pew", command: "QCB_x" });
    expect(GHOST_MANTIS.attacks.find((a) => a.state === 1000)).toMatchObject({ name: "Pew Pew", command: "QCF_x" });
    expect(GHOST_MANTIS.attacks.find((a) => a.state === 1400)).toMatchObject({ name: "Lunging Palms", command: "QCB_x" });
  });

  it("number their frames like the reference GIF's through offsets that change at given frames", () => {
    const s = steps([[0, 0], [20, -7], [66, -8], [477, -18]]);
    expect([s(5), s(20), s(100), s(834)]).toEqual([5, 13, 92, 816]);
    const gunFrame = (t: typeof LAVA_LIZARD) => cellList(t.attacks.find((a) => a.name === "Pew Pew")!.anim.cells)[0];
    expect([gunFrame(LAVA_LIZARD), gunFrame(SWAMP_CROC), gunFrame(NEON_MOTH)]).toEqual([1009, 995, 988]);
  });

  it("draw a laser bolt that flies, bursts and fades, with a box while it flies", () => {
    const art = laserArt(1400);
    expect(art.actions.map((x) => x.action)).toEqual([1450, 1451, 1452]);
    expect(art.actions[0]!.frames.every((f) => f.clsn1?.length)).toBe(true);
    expect(art.sprites.every((s) => s.image.pixels.some((p) => p >= 240 && p <= 245))).toBe(true);
  });
});
