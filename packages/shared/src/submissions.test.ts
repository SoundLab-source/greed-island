import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";
import {
  addFileProblem,
  communityKey,
  DEFAULT_SUBMISSIONS,
  detailsProblem,
  FILE_ROLES,
  missingFiles,
  normalizeDetails,
  pngInfo,
  SUBMISSION_STATUSES,
  submissionTransition,
  type SubmissionAction,
  type SubmissionDetails,
} from "./submissions.ts";

/** A minimal PNG header (signature + IHDR) of the given size. */
function pngHeader(width: number, height: number, extra = 0): Uint8Array {
  const bytes = new Uint8Array(33 + extra);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("submissionTransition", () => {
  it("lets the submitter send and withdraw, and staff decide", () => {
    expect(submissionTransition("DRAFT", "SUBMIT")).toEqual({ ok: true, to: "SUBMITTED" });
    expect(submissionTransition("CHANGES_REQUESTED", "SUBMIT")).toEqual({ ok: true, to: "SUBMITTED" });
    expect(submissionTransition("SUBMITTED", "APPROVE")).toEqual({ ok: true, to: "APPROVED" });
    expect(submissionTransition("SUBMITTED", "REQUEST_CHANGES")).toEqual({ ok: true, to: "CHANGES_REQUESTED" });
    expect(submissionTransition("SUBMITTED", "REJECT")).toEqual({ ok: true, to: "REJECTED" });
    expect(submissionTransition("SUBMITTED", "WITHDRAW")).toEqual({ ok: true, to: "WITHDRAWN" });
    expect(submissionTransition("DRAFT", "APPROVE")).toMatchObject({ ok: false, error: "the submission is draft" });
    expect(submissionTransition("CHANGES_REQUESTED", "APPROVE")).toMatchObject({ ok: false, error: "the submission is changes requested" });
  });

  it("never leaves a decided or withdrawn submission (exhaustive)", () => {
    const actions: SubmissionAction[] = ["SUBMIT", "WITHDRAW", "APPROVE", "REQUEST_CHANGES", "REJECT"];
    for (const status of SUBMISSION_STATUSES) {
      for (const action of actions) {
        const r = submissionTransition(status, action);
        if (["APPROVED", "REJECTED", "WITHDRAWN"].includes(status)) expect(r.ok).toBe(false);
        if (r.ok) expect(r.to).not.toBe(status);
      }
    }
  });
});

describe("details", () => {
  const base: SubmissionDetails = {
    community: "  Pixel   Monks ",
    fighterName: " Iron  Heron ",
    archetype: "GRAPPLER",
    description: " A heavy hitter. ",
    rightsBasis: "ORIGINAL",
    rightsDetails: "Drawn by our member Sam in 2026; we hold all rights.",
    rightsLink: " ",
  };

  it("normalizes what was typed", () => {
    expect(normalizeDetails(base)).toMatchObject({ community: "Pixel Monks", fighterName: "Iron Heron", description: "A heavy hitter.", rightsLink: null });
    expect(communityKey(" Pixel  MONKS")).toBe("pixel monks");
  });

  it("accepts complete details and says what's wrong otherwise", () => {
    const ok = normalizeDetails(base);
    expect(detailsProblem(ok)).toBeNull();
    expect(detailsProblem({ ...ok, community: "X" })).toMatch(/2-40/);
    expect(detailsProblem({ ...ok, fighterName: "Heron #1" })).toMatch(/^fighter name: /);
    expect(detailsProblem({ ...ok, archetype: "NINJA" as never })).toMatch(/archetypes/);
    expect(detailsProblem({ ...ok, rightsDetails: "ours" })).toMatch(/20-2000/);
    expect(detailsProblem({ ...ok, rightsLink: "http://example.com" })).toMatch(/https/);
    expect(detailsProblem({ ...ok, rightsLink: "javascript:alert(1)" })).toMatch(/https/);
    // Licensed art needs a link to the licence.
    expect(detailsProblem({ ...ok, rightsBasis: "HOLDER_LICENCE" })).toMatch(/link to the licence/);
    expect(detailsProblem({ ...ok, rightsBasis: "LICENSED", rightsLink: "https://example.com/licence" })).toBeNull();
  });
});

describe("files", () => {
  it("lists what's missing before review", () => {
    expect(missingFiles({})).toEqual(["a sprite sheet following the archetype's template", "a portrait", "an intro animation", "a win pose animation"]);
    expect(missingFiles({ SPRITES: 3, PORTRAIT: 1, INTRO: 1, WIN_POSE: 1 })).toEqual([]);
  });

  it("caps each kind and the total", () => {
    expect(addFileProblem("PORTRAIT", { PORTRAIT: 1 }, DEFAULT_SUBMISSIONS)).toMatch(/at most 1 portrait$/);
    expect(addFileProblem("PALETTE", { PALETTE: 6 }, DEFAULT_SUBMISSIONS)).toMatch(/at most 6 alternate colour sheets$/);
    expect(addFileProblem("SPRITES", { SPRITES: 16, PALETTE: 6, INTRO: 2 }, DEFAULT_SUBMISSIONS)).toMatch(/at most 24 images/);
    expect(addFileProblem("SPRITES", {}, DEFAULT_SUBMISSIONS)).toBeNull();
    expect(FILE_ROLES).toHaveLength(5);
  });

  it("accepts only PNG images of a sane size", () => {
    expect(pngInfo(pngHeader(640, 480), DEFAULT_SUBMISSIONS)).toEqual({ ok: true, width: 640, height: 480 });
    expect(pngInfo(new TextEncoder().encode("<svg onload=alert(1)>........................"), DEFAULT_SUBMISSIONS)).toMatchObject({ error: /only PNG/ });
    const gif = pngHeader(10, 10);
    gif.set([0x47, 0x49, 0x46]);
    expect(pngInfo(gif, DEFAULT_SUBMISSIONS)).toMatchObject({ error: /only PNG/ });
    const noIhdr = pngHeader(10, 10);
    noIhdr.set([0x49, 0x44, 0x41, 0x54], 12);
    expect(pngInfo(noIhdr, DEFAULT_SUBMISSIONS)).toMatchObject({ error: /damaged/ });
    expect(pngInfo(pngHeader(0, 10), DEFAULT_SUBMISSIONS)).toMatchObject({ error: /empty/ });
    expect(pngInfo(pngHeader(5000, 10), DEFAULT_SUBMISSIONS)).toMatchObject({ error: /4096 pixels/ });
    expect(pngInfo(pngHeader(10, 10, 2048), { ...DEFAULT_SUBMISSIONS, maxFileBytes: 1024 })).toMatchObject({ error: /at most 0 MB/ });
  });

  it("never throws on arbitrary bytes (property)", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
        expect(() => pngInfo(bytes, DEFAULT_SUBMISSIONS)).not.toThrow();
      }),
    );
  });
});

describe("submission config", () => {
  it("is closed to the public by default and reads its limits", () => {
    expect(loadConfig({}).submissions).toEqual(DEFAULT_SUBMISSIONS);
    expect(loadConfig({ GI_SUBMISSIONS_OPEN: "true", GI_SUBMISSION_MAX_FILE_MB: "2", GI_SUBMISSION_MAX_FILES: "10" }).submissions).toMatchObject({
      open: true,
      maxFileBytes: 2 * 1024 * 1024,
      maxFiles: 10,
    });
    expect(() => loadConfig({ GI_SUBMISSIONS_OPEN: "maybe" })).toThrow(ConfigError);
    expect(() => loadConfig({ GI_SUBMISSION_MAX_FILES: "0" })).toThrow(ConfigError);
  });
});
