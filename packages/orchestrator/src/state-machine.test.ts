import { describe, expect, it } from "vitest";
import { FIGHT_EVENT_TYPES, FIGHT_STATES, transition, type FightEvent, type FightEventType, type FightState } from "./state-machine.ts";

const sample: Record<FightEventType, FightEvent> = {
  OPEN_BETTING: { type: "OPEN_BETTING" },
  LOCK: { type: "LOCK" },
  ENGINE_STARTED: { type: "ENGINE_STARTED" },
  MATCH_END: { type: "MATCH_END", winnerSide: 1 },
  ENGINE_CRASH: { type: "ENGINE_CRASH", detail: "boom" },
  ENGINE_TIMEOUT: { type: "ENGINE_TIMEOUT", detail: "slow" },
  SETTLED_OK: { type: "SETTLED_OK" },
  VOID: { type: "VOID", reason: "ADMIN" },
  VOIDED_OK: { type: "VOIDED_OK" },
};

// Every (state, event) pair: the next state, or null if illegal.
const _ = null;
const TABLE: Record<FightState, Record<FightEventType, FightState | null>> = {
  //            OPEN_BETTING    LOCK      ENGINE_STARTED  MATCH_END   ENGINE_CRASH ENGINE_TIMEOUT SETTLED_OK VOID       VOIDED_OK
  BOOKED:       { OPEN_BETTING: "BETTING_OPEN", LOCK: _, ENGINE_STARTED: _, MATCH_END: _, ENGINE_CRASH: _, ENGINE_TIMEOUT: _, SETTLED_OK: _, VOID: "VOIDING", VOIDED_OK: _ },
  BETTING_OPEN: { OPEN_BETTING: _, LOCK: "LOCKED", ENGINE_STARTED: _, MATCH_END: _, ENGINE_CRASH: _, ENGINE_TIMEOUT: _, SETTLED_OK: _, VOID: "VOIDING", VOIDED_OK: _ },
  LOCKED:       { OPEN_BETTING: _, LOCK: _, ENGINE_STARTED: "IN_PROGRESS", MATCH_END: _, ENGINE_CRASH: "VOIDING", ENGINE_TIMEOUT: "VOIDING", SETTLED_OK: _, VOID: "VOIDING", VOIDED_OK: _ },
  IN_PROGRESS:  { OPEN_BETTING: _, LOCK: _, ENGINE_STARTED: _, MATCH_END: "SETTLING", ENGINE_CRASH: "VOIDING", ENGINE_TIMEOUT: "VOIDING", SETTLED_OK: _, VOID: "VOIDING", VOIDED_OK: _ },
  SETTLING:     { OPEN_BETTING: _, LOCK: _, ENGINE_STARTED: _, MATCH_END: _, ENGINE_CRASH: _, ENGINE_TIMEOUT: _, SETTLED_OK: "SETTLED", VOID: "VOIDING", VOIDED_OK: _ },
  SETTLED:      { OPEN_BETTING: _, LOCK: _, ENGINE_STARTED: _, MATCH_END: _, ENGINE_CRASH: _, ENGINE_TIMEOUT: _, SETTLED_OK: _, VOID: _, VOIDED_OK: _ },
  VOIDING:      { OPEN_BETTING: _, LOCK: _, ENGINE_STARTED: _, MATCH_END: _, ENGINE_CRASH: _, ENGINE_TIMEOUT: _, SETTLED_OK: _, VOID: _, VOIDED_OK: "VOIDED" },
  VOIDED:       { OPEN_BETTING: _, LOCK: _, ENGINE_STARTED: _, MATCH_END: _, ENGINE_CRASH: _, ENGINE_TIMEOUT: _, SETTLED_OK: _, VOID: _, VOIDED_OK: _ },
};

describe("transition: full legal/illegal table", () => {
  const cases = FIGHT_STATES.flatMap((s) => FIGHT_EVENT_TYPES.map((e) => [s, e, TABLE[s][e]] as const));

  it("covers every state and event", () => {
    expect(cases).toHaveLength(FIGHT_STATES.length * FIGHT_EVENT_TYPES.length);
  });

  it.each(cases)("%s + %s → %s", (state, eventType, expected) => {
    const result = transition(state, sample[eventType]);
    if (expected === null) {
      expect(result.ok).toBe(false);
    } else {
      expect(result).toMatchObject({ ok: true, from: state, to: expected });
    }
  });
});

describe("transition: effects and void reasons", () => {
  it("freezes loadouts when betting opens and locks odds at lock", () => {
    expect(transition("BOOKED", sample.OPEN_BETTING)).toMatchObject({ effects: [{ type: "FREEZE_LOADOUTS" }] });
    expect(transition("BETTING_OPEN", sample.LOCK)).toMatchObject({ effects: [{ type: "LOCK_ODDS" }] });
  });

  it("records the winning side, and settles only from SETTLING", () => {
    expect(transition("IN_PROGRESS", { type: "MATCH_END", winnerSide: 2 })).toMatchObject({
      to: "SETTLING",
      effects: [{ type: "RECORD_WINNER", winnerSide: 2 }],
    });
    expect(transition("SETTLING", sample.SETTLED_OK)).toMatchObject({ effects: [{ type: "SETTLE" }] });
  });

  it.each([
    [{ type: "MATCH_END", winnerSide: 0 } as FightEvent, "DRAW"],
    [sample.ENGINE_CRASH, "ENGINE_CRASH"],
    [sample.ENGINE_TIMEOUT, "ENGINE_TIMEOUT"],
  ])("voids with the right reason: %j", (event, reason) => {
    expect(transition("IN_PROGRESS", event)).toMatchObject({ to: "VOIDING", effects: [{ type: "RECORD_VOID", reason }] });
  });

  it("refunds everyone when the void completes", () => {
    expect(transition("VOIDING", sample.VOIDED_OK)).toMatchObject({ effects: [{ type: "REFUND_ALL" }] });
  });

  it("explains illegal moves", () => {
    expect(transition("SETTLED", sample.VOID)).toMatchObject({ ok: false, error: "VOID is not allowed in SETTLED" });
  });
});
