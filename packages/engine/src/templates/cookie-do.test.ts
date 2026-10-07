import { describe, expect, it } from "vitest";
import { COOKIE_DO, FREEDOM_EAGLE, JUNGLE_PUMA, MANED_WOLF, PUNK_SCORPION, RUST_BOBCAT } from "./cookie-do.ts";
import { checkSpec, cellList } from "./spec.ts";

describe("the WrongCookieDo fighters", () => {
  it("are seven bodies on one karate-like move list, each a complete fighter", () => {
    expect(COOKIE_DO.map((t) => t.name)).toEqual(["Jungle Puma", "Snow Leopard", "Rust Bobcat", "Punk Scorpion", "Khaki Stag", "Maned Wolf", "Freedom Eagle"]);
    for (const t of COOKIE_DO) {
      expect(checkSpec(t)).toEqual([]);
      expect(t.attacks.map((a) => a.name)).toEqual(JUNGLE_PUMA.attacks.map((a) => a.name));
      expect(t.attacks.find((a) => a.state === 1400)).toMatchObject({ name: "Lunging Punch", command: "QCB_x" });
      const frames = t.art.columns * t.art.rows;
      for (const a of [...t.anims, ...t.attacks.map((x) => x.anim)]) for (const c of cellList(a.cells)) expect(c).toBeLessThan(frames);
    }
  });

  it("number their frames like the reference GIF's, where theirs have a few more or fewer", () => {
    const straight = (t: typeof JUNGLE_PUMA) => cellList(t.attacks.find((a) => a.state === 210)!.anim.cells)[0];
    const lunge = (t: typeof JUNGLE_PUMA) => cellList(t.attacks.find((a) => a.state === 1400)!.anim.cells)[0];
    expect([JUNGLE_PUMA, RUST_BOBCAT, PUNK_SCORPION, MANED_WOLF, FREEDOM_EAGLE].map(straight)).toEqual([20, 20, 21, 21, 21]);
    expect([JUNGLE_PUMA, RUST_BOBCAT, PUNK_SCORPION, MANED_WOLF, FREEDOM_EAGLE].map(lunge)).toEqual([515, 508, 507, 516, 509]);
  });

  it("scale the handspring kick's hand-made box to each body", () => {
    const kick = (t: typeof JUNGLE_PUMA) => t.attacks.find((a) => a.state === 1200)!.hits[1]!.box;
    expect(kick(JUNGLE_PUMA)).toEqual([8, -66, 30, -20]);
    expect(kick(MANED_WOLF)).toEqual([10, -85, 39, -26]); // 85 pixels tall against 66
  });
});
