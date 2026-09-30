import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";
import {
  automaticName,
  characterNameProblem,
  DEFAULT_STAFF,
  hasPermission,
  isStaff,
  nameKey,
  normalizeCharacterName,
  reasonProblem,
  renameProblem,
  REVIEW_STATUSES,
  reviewNoteProblem,
  reviewProblem,
  roleChangeProblem,
  USER_ROLES,
} from "./staff.ts";

describe("roles", () => {
  it("gives moderators the queue and name resets, and admins also the moderator list", () => {
    expect(isStaff("PLAYER")).toBe(false);
    expect(hasPermission("PLAYER", "review")).toBe(false);
    expect(hasPermission("MODERATOR", "review")).toBe(true);
    expect(hasPermission("MODERATOR", "reset_names")).toBe(true);
    expect(hasPermission("MODERATOR", "view_log")).toBe(true);
    expect(hasPermission("MODERATOR", "manage_moderators")).toBe(false);
    expect(hasPermission("ADMIN", "manage_moderators")).toBe(true);
  });
});

describe("reviewProblem", () => {
  const base = { status: "PENDING" as const, reviewerId: "mod", reviewerRole: "MODERATOR" as const, submitterId: "player" };

  it("lets staff decide pending requests", () => {
    expect(reviewProblem(base)).toBeNull();
    expect(reviewProblem({ ...base, reviewerRole: "ADMIN" })).toBeNull();
  });

  it("refuses players, decided requests and moderators' own requests", () => {
    expect(reviewProblem({ ...base, reviewerRole: "PLAYER" })).toMatch(/only staff/);
    expect(reviewProblem({ ...base, status: "APPROVED" })).toMatch(/already approved/);
    expect(reviewProblem({ ...base, submitterId: "mod" })).toMatch(/your own/);
  });

  it("lets an admin decide their own (it's logged)", () => {
    expect(reviewProblem({ ...base, reviewerId: "admin", reviewerRole: "ADMIN", submitterId: "admin" })).toBeNull();
  });

  it("only ever allows deciding a pending request (exhaustive)", () => {
    for (const status of REVIEW_STATUSES) {
      for (const reviewerRole of USER_ROLES) {
        const problem = reviewProblem({ ...base, status, reviewerRole });
        if (status !== "PENDING" || reviewerRole === "PLAYER") expect(problem).not.toBeNull();
      }
    }
  });
});

describe("roleChangeProblem", () => {
  const admin = { kind: "user" as const, id: "admin", role: "ADMIN" as const };
  const player = { id: "p", role: "PLAYER" as const, emailVerified: true };

  it("lets an admin appoint and remove moderators", () => {
    expect(roleChangeProblem({ actor: admin, target: player, to: "MODERATOR" })).toBeNull();
    expect(roleChangeProblem({ actor: admin, target: { ...player, role: "MODERATOR" }, to: "PLAYER" })).toBeNull();
  });

  it("keeps admins to the command line and staff to verified emails", () => {
    expect(roleChangeProblem({ actor: admin, target: player, to: "ADMIN" })).toMatch(/command line/);
    expect(roleChangeProblem({ actor: admin, target: { ...player, id: "a2", role: "ADMIN" }, to: "PLAYER" })).toMatch(/command line/);
    expect(roleChangeProblem({ actor: admin, target: { ...player, id: "admin", role: "ADMIN" }, to: "MODERATOR" })).toMatch(/own role/);
    expect(roleChangeProblem({ actor: admin, target: { ...player, emailVerified: false }, to: "MODERATOR" })).toMatch(/verified email/);
    expect(roleChangeProblem({ actor: { kind: "user", id: "m", role: "MODERATOR" }, target: player, to: "MODERATOR" })).toMatch(/only an admin/);
  });

  it("lets the command line set any role on a verified account", () => {
    expect(roleChangeProblem({ actor: { kind: "cli" }, target: player, to: "ADMIN" })).toBeNull();
    expect(roleChangeProblem({ actor: { kind: "cli" }, target: { ...player, role: "ADMIN" }, to: "PLAYER" })).toBeNull();
    expect(roleChangeProblem({ actor: { kind: "cli" }, target: { ...player, emailVerified: false }, to: "ADMIN" })).toMatch(/verified email/);
    // Removing a role never needs a verified email.
    expect(roleChangeProblem({ actor: { kind: "cli" }, target: { ...player, emailVerified: false }, to: "PLAYER" })).toBeNull();
  });
});

describe("character names", () => {
  it("normalizes spaces and compares ignoring case", () => {
    expect(normalizeCharacterName("  Iron   Lotus ")).toBe("Iron Lotus");
    expect(nameKey(" IRON  lotus")).toBe("iron lotus");
  });

  it("accepts plain names", () => {
    for (const n of ["Iron Lotus", "Mr. T-800", "Salt & Pepper", "O'Brien", "Kai 2"]) expect(characterNameProblem(n)).toBeNull();
  });

  it("refuses bad lengths, symbols, lookalike letters and names without letters", () => {
    expect(characterNameProblem("Al")).toMatch(/3-20/);
    expect(characterNameProblem("A".repeat(21))).toMatch(/3-20/);
    expect(characterNameProblem("Grey Monk #2")).toMatch(/only letters/);
    expect(characterNameProblem("Grеy Monk")).toMatch(/only letters/); // Cyrillic "е"
    expect(characterNameProblem("<script>")).toMatch(/only letters/);
    expect(characterNameProblem("123 456")).toMatch(/one letter/);
  });

  it("never accepts a name that looks automatic (property)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), fc.integer({ min: 1, max: 99_999 }), (fighter, serial) => {
        expect(characterNameProblem(normalizeCharacterName(automaticName(fighter, serial)))).not.toBeNull();
      }),
    );
  });

  it("any accepted name survives normalizing unchanged (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 24 }), (raw) => {
        const n = normalizeCharacterName(raw);
        if (characterNameProblem(n) === null) expect(normalizeCharacterName(n)).toBe(n);
      }),
    );
  });
});

describe("renameProblem", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const base = { userId: "me", ownerUserId: "me", pending: false, lastApprovedAt: null, currentName: "Grey Monk #1", name: "Iron Lotus", now };

  it("lets an owner ask for a valid new name", () => {
    expect(renameProblem(base, DEFAULT_STAFF)).toBeNull();
  });

  it("refuses house characters, other owners, a second pending request and the same name", () => {
    expect(renameProblem({ ...base, ownerUserId: null }, DEFAULT_STAFF)).toMatch(/house/);
    expect(renameProblem({ ...base, ownerUserId: "you" }, DEFAULT_STAFF)).toMatch(/you own/);
    expect(renameProblem({ ...base, pending: true }, DEFAULT_STAFF)).toMatch(/waiting/);
    expect(renameProblem({ ...base, name: "Grey Monk #1" }, DEFAULT_STAFF)).toMatch(/already its name/);
    expect(renameProblem({ ...base, name: "x" }, DEFAULT_STAFF)).toMatch(/3-20/);
  });

  it("waits the cooldown after an approved name", () => {
    const lastApprovedAt = new Date(now.getTime() - DEFAULT_STAFF.renameCooldownMs + 60_000);
    expect(renameProblem({ ...base, lastApprovedAt }, DEFAULT_STAFF)).toMatch(/after 2026-10-01 12:01 UTC/);
    expect(renameProblem({ ...base, lastApprovedAt: new Date(now.getTime() - DEFAULT_STAFF.renameCooldownMs) }, DEFAULT_STAFF)).toBeNull();
    expect(renameProblem({ ...base, lastApprovedAt: now }, { renameCooldownMs: 0 })).toBeNull();
  });
});

describe("reviewNoteProblem", () => {
  it("needs a note to reject, and keeps notes short", () => {
    expect(reviewNoteProblem("APPROVE", null)).toBeNull();
    expect(reviewNoteProblem("REJECT", null)).toMatch(/why/);
    expect(reviewNoteProblem("REJECT", "rude")).toBeNull();
    expect(reviewNoteProblem("APPROVE", "x".repeat(201))).toMatch(/at most 200/);
  });
});

describe("reasonProblem", () => {
  it("needs a short reason for a reset", () => {
    expect(reasonProblem(null)).toMatch(/why/);
    expect(reasonProblem("offensive")).toBeNull();
    expect(reasonProblem("x".repeat(201))).toMatch(/at most 200/);
  });
});

describe("staff config", () => {
  it("reads the rename cooldown in days", () => {
    expect(loadConfig({}).staff.renameCooldownMs).toBe(7 * 86_400_000);
    expect(loadConfig({ GI_RENAME_COOLDOWN_DAYS: "0" }).staff.renameCooldownMs).toBe(0);
    expect(() => loadConfig({ GI_RENAME_COOLDOWN_DAYS: "-1" })).toThrow(ConfigError);
  });
});
