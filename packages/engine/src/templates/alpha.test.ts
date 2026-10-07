import { describe, expect, it } from "vitest";
import { ALPHA, ASTRO_APE, BOG_BRUTE } from "./alpha.ts";
import { rocketArt } from "./military.ts";
import { checkSpec, cellList } from "./spec.ts";

describe("the Alpha Contact fighters", () => {
  it("are two alien brawlers with a shoulder rocket, each a complete fighter", () => {
    expect(ALPHA.map((t) => t.name)).toEqual(["Bog Brute", "Astro Ape"]);
    for (const t of ALPHA) {
      expect(checkSpec(t)).toEqual([]);
      const frames = t.art.columns * t.art.rows;
      for (const a of [...t.anims, ...t.attacks.map((x) => x.anim)]) for (const c of cellList(a.cells)) expect(c).toBeLessThan(frames);
      expect(t.attacks.find((a) => a.name === "Shoulder Rocket")?.projectile?.art).toBe(rocketArt);
    }
    expect(BOG_BRUTE.attacks.find((a) => a.state === 1400)!.name).toBe("Shoulder Rocket");
    expect(ASTRO_APE.attacks.find((a) => a.state === 1000)!.name).toBe("Shoulder Rocket");
  });

  it("number Puji's frames two fewer than the reference's from 165 on", () => {
    const pounce = (t: typeof BOG_BRUTE) => cellList(t.attacks.find((a) => a.name === "Pounce")!.anim.cells)[0];
    expect([pounce(BOG_BRUTE), pounce(ASTRO_APE)]).toEqual([205, 203]);
    const jab = (t: typeof BOG_BRUTE) => cellList(t.attacks.find((a) => a.state === 200)!.anim.cells)[0];
    expect([jab(BOG_BRUTE), jab(ASTRO_APE)]).toEqual([7, 7]);
  });
});
