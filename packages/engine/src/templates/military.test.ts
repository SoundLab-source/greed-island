import { describe, expect, it } from "vitest";
import { MATADOR, MILITARY, RED_COMET, rocketArt, WANDERING_RONIN } from "./military.ts";
import { checkSpec, cellList } from "./spec.ts";

describe("the Tasen military combat fighters", () => {
  it("are five cape-and-bazooka fighters, each a complete fighter", () => {
    expect(MILITARY.map((t) => t.name)).toEqual(["Matador", "Purple Prowler", "Wandering Ronin", "Red Comet", "Mardi Gras"]);
    for (const t of MILITARY) {
      expect(checkSpec(t)).toEqual([]);
      const frames = t.art.columns * t.art.rows;
      for (const a of [...t.anims, ...t.attacks.map((x) => x.anim)]) for (const c of cellList(a.cells)) expect(c).toBeLessThan(frames);
      expect(t.attacks.find((a) => a.name === "Bazooka")?.projectile?.art).toBe(rocketArt);
      expect(t.anims.find((a) => a.action === 195)!.comment).toMatch(/OLE/);
    }
    expect(MATADOR.attacks.find((a) => a.state === 1400)!.name).toBe("Bazooka");
    expect(RED_COMET.attacks.find((a) => a.state === 1000)!.name).toBe("Bazooka");
  });

  it("number the other bodies' frames one on from the reference's after their first few", () => {
    const jab = (t: typeof MATADOR) => cellList(t.attacks.find((a) => a.state === 200)!.anim.cells)[0];
    expect([jab(MATADOR), jab(WANDERING_RONIN), jab(RED_COMET)]).toEqual([438, 439, 439]);
  });

  it("draw a rocket that flies and blows up", () => {
    const art = rocketArt(1400);
    expect(art.actions).toHaveLength(3);
    expect(art.actions[0]!.frames.every((f) => f.clsn1?.length)).toBe(true);
    expect(art.actions[1]!.frames).toHaveLength(4);
  });
});
