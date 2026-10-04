import { describe, expect, it } from "vitest";
import { actionExtents, bodyWarning, extent, hitWarning, verticalCover } from "./compare.ts";

describe("extent", () => {
  it("scales a character's own units to 320-wide units", () => {
    expect(extent([[0, -100, 64, -20], [-32, -64, 10, 0]], 640)).toEqual({ left: -16, top: -50, right: 32, bottom: 0 });
    expect(extent([], 320)).toBeNull();
  });
});

describe("actionExtents", () => {
  it("collects hitboxes and hurtboxes over every frame of an action", () => {
    const air = new Map([
      [200, [{ clsn1: [], clsn2: [[-10, -90, 10, 0]] }, { clsn1: [[20, -60, 50, -40]], clsn2: [[-10, -90, 30, 0]] }]],
      [0, [{ clsn1: [], clsn2: [[-12, -95, 14, 0]] }]],
    ] as const);
    const { hit, hurt } = actionExtents(air as never, 320);
    expect(hit.get(200)).toEqual({ left: 20, top: -60, right: 50, bottom: -40 });
    expect(hit.has(0)).toBe(false);
    expect(hurt.get(200)).toEqual({ left: -10, top: -90, right: 30, bottom: 0 });
  });
});

describe("warnings", () => {
  const base = { left: 14, top: -61, right: 59, bottom: -26 };
  it("flags a move whose boxes miss most of the height the base's cover", () => {
    expect(verticalCover({ left: 10, top: -94, right: 53, bottom: -67 }, base)).toBe(0);
    expect(hitWarning({ left: 10, top: -94, right: 53, bottom: -67 }, base)).toBe("sits higher than the base's");
    expect(hitWarning({ left: 10, top: -40, right: 53, bottom: 0 }, base)).toBe("sits lower than the base's");
  });
  it("flags a move that reaches much less far, and passes a close one", () => {
    expect(hitWarning({ left: 10, top: -61, right: 40, bottom: -26 }, base)).toBe("reaches much less far");
    expect(hitWarning({ left: 10, top: -70, right: 55, bottom: -30 }, base)).toBeUndefined();
  });
  it("flags a body drawn well ahead of the fighter", () => {
    expect(bodyWarning({ left: -21, top: -97, right: 74, bottom: 0 }, { left: -29, top: -106, right: 31, bottom: 1 })).toBe("the body runs ahead of the fighter");
    expect(bodyWarning({ left: -21, top: -97, right: 40, bottom: 0 }, { left: -29, top: -106, right: 31, bottom: 1 })).toBeUndefined();
  });
});
