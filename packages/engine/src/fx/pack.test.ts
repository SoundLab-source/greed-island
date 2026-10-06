import { describe, expect, it } from "vitest";
import { readAirBoxes } from "../art/air.ts";
import { readSff } from "../art/sff.ts";
import { readSnd } from "../art/snd.ts";
import { EXPLOSION_COLORS, explosionFrames } from "./explosion.ts";
import { fxPackFiles, FX_EXPLOSION } from "./pack.ts";

describe("the effect pack", () => {
  it("draws the explosion: a growing fireball, then smoke that clears", () => {
    const { frames, ticks } = explosionFrames();
    expect(frames.length).toBe(ticks.length);
    expect(frames.length).toBeGreaterThan(10);
    const drawn = frames.map((f) => f.pixels.reduce((n, v) => n + (v ? 1 : 0), 0));
    expect(drawn.every((n) => n > 0)).toBe(true);
    expect(drawn[3]!).toBeGreaterThan(drawn[0]! * 4); // it grows
    expect(drawn.at(-1)!).toBeLessThan(drawn.at(-3)!); // and clears
    expect(frames.every((f) => f.pixels.every((v) => v < EXPLOSION_COLORS.length))).toBe(true);
  });

  it("is a pack with the GIFX prefix, one sprite per frame and the explosion as action 1", () => {
    const files = fxPackFiles();
    expect([...files.keys()]).toEqual(["gifx.def", "gifx.sff", "gifx.air"]);
    expect(files.get("gifx.def")!.toString("latin1")).toMatch(/prefix = GIFX/);
    expect(FX_EXPLOSION).toBe("GIFX1");
    const sprites = readSff(files.get("gifx.sff")!).sprites;
    expect(sprites.map((s) => s.group)).toEqual(explosionFrames().frames.map(() => 1));
    expect(readAirBoxes(files.get("gifx.air")!.toString("latin1")).get(1)!.length).toBe(sprites.length);
  });

  it("carries the explosion's sound as 1,0 when there is one, and is silent without it", () => {
    expect(fxPackFiles().has("gifx.snd")).toBe(false);
    const wav = Buffer.alloc(300, 128);
    wav.write("RIFF", 0, "latin1");
    wav.write("WAVE", 8, "latin1");
    const files = fxPackFiles(wav);
    expect(files.get("gifx.def")!.toString("latin1")).toMatch(/snd = gifx.snd/);
    expect(readSnd(files.get("gifx.snd")!).map((s) => [s.group, s.number])).toEqual([[1, 0]]);
  });
});
