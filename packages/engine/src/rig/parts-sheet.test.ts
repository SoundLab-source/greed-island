import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readPng, writePng } from "../art/png.ts";
import { bounds } from "../art/sheet.ts";
import { drawnFighter } from "../templates/drawn.ts";
import { MARGIN_CALL } from "../templates/margin-call.ts";
import { checkSpec } from "../templates/spec.ts";
import { addDrawnFighter, drawnId } from "./add-drawn.ts";
import { EXAMPLE_DESIGNS, HEDGE_HOG } from "./examples.ts";
import { RIG_CELL } from "./fighter.ts";
import { checkDesign, IMAGE_COLORS, IMAGE_FIRST } from "./parts.ts";
import { guideSize, partsGuidePng, partsSheetFromDesign, readPartsSheet } from "./parts-sheet.ts";
import { renderPose } from "./render.ts";
import { showcasePoses } from "./showcase.ts";

describe("example designs", () => {
  it.each(EXAMPLE_DESIGNS.map((d) => [d.id, d] as const))("%s is valid and draws in every showcase pose", (_id, ex) => {
    expect(checkDesign(ex.design)).toEqual([]);
    for (const p of showcasePoses(MARGIN_CALL)) expect(bounds(renderPose(ex.design, { ...p, fx: [] }, RIG_CELL).img)).not.toBeNull();
  });
});

describe("the parts guide and drawn parts", () => {
  it("draws the guide at the size a drawing must be", () => {
    const png = readPng(partsGuidePng(4));
    expect({ width: png.width, height: png.height }).toEqual(guideSize(4));
  });

  it("reads a drawn sheet back into a design that poses like any rig fighter", () => {
    const { design, problems, notes } = readPartsSheet(partsSheetFromDesign(HEDGE_HOG));
    expect(problems).toEqual([]);
    expect(notes).toEqual([]);
    expect(checkDesign(design)).toEqual([]);
    expect(design.imageColors!.length).toBeLessThanOrEqual(IMAGE_COLORS);
    for (const bone of ["head", "torso", "upperArmF", "upperArmB", "foreArmF", "handF", "thighB", "shinF", "footF"] as const) expect(design.parts[bone]?.image, bone).toBeDefined();
    const { img } = renderPose(design, { ...showcasePoses(MARGIN_CALL)[2]!, fx: [] }, RIG_CELL);
    expect(bounds(img)!.y1).toBe(RIG_CELL.axis.y);
    // Drawn colours, their far-side shades and the outline; nothing else.
    for (const v of new Set(img.pixels)) if (v) expect(v === 1 || (v >= IMAGE_FIRST && v < IMAGE_FIRST + IMAGE_COLORS * 2)).toBe(true);
  });

  it("reads any whole scale of the guide", () => {
    const small = readPartsSheet(partsSheetFromDesign(HEDGE_HOG, 1));
    expect(small.problems).toEqual([]);
    expect(Object.keys(small.design.parts)).toHaveLength(14);
  });

  it("says what's wrong with a drawing, in words", () => {
    const { width, height } = guideSize(4);
    const empty = readPartsSheet(writePng({ width, height, colorType: 6, pixels: new Uint8Array(width * height * 4) }));
    expect(empty.problems).toContain("the head box is empty");
    expect(empty.problems).not.toContain("the open hand box is empty");
    const solid = readPartsSheet(writePng({ width, height, colorType: 6, pixels: new Uint8Array(width * height * 4).fill(255) }));
    expect(solid.problems.some((p) => p.includes("no transparent background"))).toBe(true);
    expect(() => readPartsSheet(writePng({ width: 100, height: 100, colorType: 6, pixels: new Uint8Array(100 * 100 * 4) }))).toThrow(/guide's size/);
  });

  it("turns a drawing into a fighter on the Brawler's moves, and checks it's the file listed", () => {
    const bytes = partsSheetFromDesign(HEDGE_HOG);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const entry = { id: "gi-drawn-test", name: "Drawn Test", file: "art/parts/drawn-test.png", sha256, artist: "a test" };
    const spec = drawnFighter(entry, bytes);
    expect(checkSpec(spec)).toEqual([]);
    expect(spec.attacks.find((a) => a.state === 1000)!.name).toBe("Rushing Straight");
    expect(() => drawnFighter({ ...entry, sha256: "0".repeat(64) }, bytes)).toThrow(/checksum/);
  });

  it("adds a drawn fighter to the list and the roster, once", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gi-drawn-"));
    await mkdir(path.join(root, "packages", "engine"), { recursive: true });
    await writeFile(path.join(root, "packages", "engine", "roster.json"), JSON.stringify({ fighters: [], stages: [], characters: [] }));
    await writeFile(path.join(root, "packages", "engine", "drawn-fighters.json"), JSON.stringify({ fighters: [] }));
    const bytes = partsSheetFromDesign(HEDGE_HOG, 1);
    const add = () => addDrawnFighter(root, { name: "Prickly Pear!", artist: "Antoine", bytes, sha256: "x" });
    expect(await add()).toBe("gi-prickly-pear");
    expect(drawnId("Prickly Pear!")).toBe("gi-prickly-pear");
    const roster = JSON.parse(await readFile(path.join(root, "packages", "engine", "roster.json"), "utf8"));
    expect(roster.fighters[0]).toMatchObject({ id: "gi-prickly-pear", def: "chars/gi-prickly-pear/gi-prickly-pear.def", archetype: "ALL_ROUNDER" });
    expect(roster.characters[0]).toEqual({ key: "house-prickly-pear", fighter: "gi-prickly-pear", name: "Prickly Pear!", palette: 1 });
    expect(await readFile(path.join(root, "art", "parts", "prickly-pear.png"))).toEqual(Buffer.from(bytes));
    await expect(add()).rejects.toThrow(/already a fighter/);
  });
});
