import { describe, expect, it } from "vitest";
import { readSnd, writeSnd } from "../art/snd.ts";
import { readWav } from "../art/wav.ts";
import type { CellSource, IndexedImage } from "../art/sheet.ts";
import { drawText, textWidth } from "../fx/font.ts";
import { buildTemplateArt, templatePalettes } from "./art.ts";
import { commandsFile, defFile, statesFile } from "./cns.ts";
import { checkSpec } from "./spec.ts";
import { BEAM_LENGTH, beamArt, BUBBLE_ANIM, bubbleArt, fireworkArt, NYAN_ART, NYAN_CAT, nyanSounds, RAINBOW } from "./nyan-cat.ts";

/** Every cell: a body block (the cat's grey) with a rainbow block behind it, standing on the ground point. */
function fakeCells(): CellSource {
  const { cellWidth: w, cellHeight: h, axis } = NYAN_ART;
  const img: IndexedImage = { width: w, height: h, pixels: new Uint8Array(w * h) };
  for (let y = axis.y - 60; y < axis.y - 10; y++) {
    for (let x = axis.x - 40; x < axis.x + 40; x++) img.pixels[y * w + x] = 242;
    for (let x = axis.x - 140; x < axis.x - 40; x++) img.pixels[y * w + x] = RAINBOW[0];
  }
  return { palette: new Uint8Array(768), cellWidth: w, cellHeight: h, cell: () => img };
}

describe("Nyan Cat", () => {
  it("is a valid fighter", () => {
    expect(checkSpec(NYAN_CAT)).toEqual([]);
  });

  it("leaves its rainbow out of its hurtboxes", () => {
    // Its moves need real frames (their hitboxes come from what reaches out); its other animations don't.
    const art = buildTemplateArt({ ...NYAN_CAT, attacks: [] }, fakeCells());
    const stand = art.actions.find((a) => a.action === 0)!;
    // The body starts 40 pixels behind the axis; the rainbow, 140.
    for (const box of stand.frames[0]!.clsn2!) expect(box[0]).toBeGreaterThanOrEqual(-40);
  });

  it("keeps its own colours where the energy ball's would go", () => {
    const palette = new Uint8Array(768).map((_, i) => i % 256);
    expect([...templatePalettes(NYAN_CAT, palette)[0]!.colors.subarray(242 * 3, 246 * 3)]).toEqual([...palette.subarray(242 * 3, 246 * 3)]);
  });

  it("fires the lazer as a beam that hits five times and stays put", () => {
    const states = statesFile(NYAN_CAT);
    const lazer = states.slice(states.indexOf("[Statedef 1200]"), states.indexOf("[Statedef", states.indexOf("[Statedef 1200]") + 1));
    expect(lazer).toMatch(/type = Projectile/);
    expect(lazer).toMatch(/velocity = 0, 0/);
    expect(lazer).toMatch(/projhits = 5/);
    expect(lazer).toMatch(/projmisstime = 6/);
    expect(lazer).toMatch(/projremovetime = 34/);
    // Its charge sound and speech bubble start on its first frame, in its own state (so Time = 0 works).
    expect(lazer).toMatch(/\[State 1200, cue: effect 7000 in 1200\]\ntype = Explod\ntrigger1 = Anim = 1200 && Time = 0/);
    expect(lazer).toMatch(/facing = Facing/);
    expect(lazer).toMatch(/\[State 1200, cue: sound 2,1 in 1200\]\ntype = PlaySnd\ntrigger1 = Anim = 1200 && AnimElem = 9/);
    // The firework bursts with its own sound; the intro plays the song from the intro state.
    expect(states).toMatch(/hitsound = S3,1/);
    expect(states).toMatch(/\[State 191, cue: sound 1,0 in 190\]/);
    // The AI fires the beam only when the opponent is within its reach.
    expect(commandsFile(NYAN_CAT)).toMatch(/AI: IMMA FIRIN MAH LAZER from afar[\s\S]*?P2BodyDist X = \[/);
    expect(defFile(NYAN_CAT, 4)).toMatch(/^sound = gi\.snd$/m);
  });

  it("draws its firework, beam and speech bubble", () => {
    const fw = fireworkArt(1000);
    expect(fw.actions.map((a) => a.action)).toEqual([1050, 1051, 1052]);
    expect(fw.actions[0]!.frames.every((f) => f.clsn1?.length)).toBe(true);
    const beam = beamArt(1200);
    const flying = beam.actions[0]!;
    expect(flying.loopStart).toBe(3);
    expect(flying.frames.at(-1)!.clsn1![0]![2]).toBe(BEAM_LENGTH);
    const bubble = bubbleArt();
    expect(bubble.actions[0]!.action).toBe(BUBBLE_ANIM);
    expect(bubble.sprites[0]!.image.width).toBeGreaterThan(textWidth("MAH LAZER!!", 3));
  });

  it("makes its sounds in code (a chime stands in for its song when the song isn't loaded)", () => {
    const sounds = nyanSounds();
    expect(sounds.map((s) => `${s.group},${s.number}`)).toEqual(["1,0", "2,0", "2,1", "3,0", "3,1", "4,0"]);
    for (const s of sounds) expect(readWav(s.wav).data.length).toBeGreaterThan(1000);
  });
});

describe("pixel font", () => {
  it("draws text and measures it", () => {
    const img: IndexedImage = { width: 40, height: 10, pixels: new Uint8Array(400) };
    drawText(img, "Hi!", 1, 1, 9);
    expect(textWidth("Hi!")).toBe(17);
    expect(img.pixels.filter((v) => v === 9).length).toBeGreaterThan(10);
    expect(() => drawText(img, "~", 0, 0, 1)).toThrow(/no glyph/);
  });
});

describe("sound files", () => {
  it("round-trips through the game's sound format", () => {
    const back = readSnd(writeSnd(nyanSounds()));
    expect(back).toHaveLength(6);
  });
});
