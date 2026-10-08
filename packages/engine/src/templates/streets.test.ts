import { describe, expect, it } from "vitest";
import { checkSpec, REQUIRED_ACTIONS } from "./spec.ts";
import { CHEAP_SHOT, DAYLIGHT_ROBBERY, SIDE_SCROLLER, STICKY_FINGERS, STREET_CONFIGS, STREET_TOUGHS } from "./streets.ts";

describe("the street toughs (Bandits, Streets of Fight)", () => {
  it("are complete fighters with a signature move of their own, three outfits and their art credited", () => {
    for (const t of STREET_TOUGHS) {
      expect(checkSpec(t)).toEqual([]);
      const actions = new Set([...t.anims.map((a) => a.action), ...t.attacks.map((a) => a.state)]);
      for (const r of REQUIRED_ACTIONS) expect(actions.has(r)).toBe(true);
      expect(t.attacks.find((a) => a.state === 1400)).toMatchObject({ command: "QCB_x", special: true });
      expect(t.palettes).toHaveLength(3);
    }
    expect(STREET_TOUGHS.map((t) => t.attacks.find((a) => a.state === 1400)!.name)).toEqual(["Five-Finger Discount", "Pay the Toll", "Beat 'Em Up", "Cheap Shot"]);
    expect(STREET_CONFIGS.map((c) => c.id)).toEqual(STREET_TOUGHS.map((t) => t.id));
    expect(STICKY_FINGERS.art.credit).toMatch(/Sven Thole/);
    expect(SIDE_SCROLLER.art.credit).toMatch(/ansimuz/);
  });

  it("keep each pack's own moves: the bandits get up their own way, the brawler girl kicks in the air", () => {
    for (const b of [STICKY_FINGERS, DAYLIGHT_ROBBERY]) expect(b.anims.find((a) => a.action === 5120)!.comment).toMatch(/sword/);
    expect(SIDE_SCROLLER.attacks.find((a) => a.state === 600)!.name).toBe("Jump Kick");
    expect(SIDE_SCROLLER.attacks.find((a) => a.state === 630)!.name).toBe("Dive Kick");
    // Her combo hits three times, the last one knocking down.
    const combo = SIDE_SCROLLER.attacks.find((a) => a.state === 1400)!;
    expect(combo.hits).toHaveLength(3);
    expect(combo.hits[2]!.knockdown).toBe(true);
    // Fist fighters' moves aren't called slashes.
    expect(SIDE_SCROLLER.attacks.find((a) => a.state === 200)!.name).toBe("Jab");
    expect(CHEAP_SHOT.attacks.find((a) => a.state === 1400)!.hits[0]!.height).toBe("low");
    // Pay the Toll's quake rolls along the floor: a low projectile.
    const toll = DAYLIGHT_ROBBERY.attacks.find((a) => a.state === 1400)!;
    expect(toll.projectile?.art).toBeTypeOf("function");
    expect(toll.hits[0]!.height).toBe("low");
    expect(CHEAP_SHOT.throws!.map((t) => t.name)).toEqual(["Lift and Slam", "Running Grab"]);
  });
});
