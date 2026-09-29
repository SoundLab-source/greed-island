/**
 * Fight lifecycle (docs/ARCHITECTURE.md §2). `transition` is pure: it decides
 * the next state and which effects to run, and nothing else. The
 * orchestrator applies each transition in one DB transaction.
 *
 *   BOOKED → BETTING_OPEN → LOCKED → IN_PROGRESS → SETTLING → SETTLED
 *   any non-terminal → VOIDING → VOIDED
 */
import type { WinnerSide } from "@greed-island/shared";

export const FIGHT_STATES = ["BOOKED", "BETTING_OPEN", "LOCKED", "IN_PROGRESS", "SETTLING", "SETTLED", "VOIDING", "VOIDED"] as const;
export type FightState = (typeof FIGHT_STATES)[number];

export const TERMINAL_STATES: readonly FightState[] = ["SETTLED", "VOIDED"];

export const VOID_REASONS = ["DRAW", "ENGINE_CRASH", "ENGINE_TIMEOUT", "RECONCILE_ORPHANED", "ADMIN"] as const;
export type VoidReason = (typeof VOID_REASONS)[number];

export type FightEvent =
  | { type: "OPEN_BETTING" }
  | { type: "LOCK" }
  | { type: "ENGINE_STARTED" }
  | { type: "MATCH_END"; winnerSide: WinnerSide }
  | { type: "ENGINE_CRASH"; detail: string }
  | { type: "ENGINE_TIMEOUT"; detail: string }
  | { type: "SETTLED_OK" }
  | { type: "VOID"; reason: VoidReason; detail?: string }
  | { type: "VOIDED_OK" };

export type FightEventType = FightEvent["type"];
export const FIGHT_EVENT_TYPES: readonly FightEventType[] = [
  "OPEN_BETTING",
  "LOCK",
  "ENGINE_STARTED",
  "MATCH_END",
  "ENGINE_CRASH",
  "ENGINE_TIMEOUT",
  "SETTLED_OK",
  "VOID",
  "VOIDED_OK",
];

/** Work the orchestrator must do inside the same DB transaction as the state change. */
export type Effect =
  | { type: "FREEZE_LOADOUTS" }
  | { type: "LOCK_ODDS" }
  | { type: "RECORD_WINNER"; winnerSide: 1 | 2 }
  | { type: "SETTLE" }
  | { type: "RECORD_VOID"; reason: VoidReason; detail?: string | undefined }
  | { type: "REFUND_ALL" };

export type TransitionResult =
  | { ok: true; from: FightState; to: FightState; effects: Effect[] }
  | { ok: false; from: FightState; error: string };

export function isTerminal(state: FightState): boolean {
  return TERMINAL_STATES.includes(state);
}

const ok = (from: FightState, to: FightState, effects: Effect[] = []): TransitionResult => ({ ok: true, from, to, effects });
const voiding = (from: FightState, reason: VoidReason, detail?: string): TransitionResult =>
  ok(from, "VOIDING", [{ type: "RECORD_VOID", reason, detail }]);

export function transition(state: FightState, event: FightEvent): TransitionResult {
  const illegal = (): TransitionResult => ({ ok: false, from: state, error: `${event.type} is not allowed in ${state}` });

  // Any non-terminal state can be voided, except one already on its way out.
  if (event.type === "VOID") {
    if (isTerminal(state) || state === "VOIDING") return illegal();
    return voiding(state, event.reason, event.detail);
  }

  switch (state) {
    case "BOOKED":
      return event.type === "OPEN_BETTING" ? ok(state, "BETTING_OPEN", [{ type: "FREEZE_LOADOUTS" }]) : illegal();
    case "BETTING_OPEN":
      return event.type === "LOCK" ? ok(state, "LOCKED", [{ type: "LOCK_ODDS" }]) : illegal();
    case "LOCKED":
      if (event.type === "ENGINE_STARTED") return ok(state, "IN_PROGRESS");
      // The engine can fail before it reports starting.
      if (event.type === "ENGINE_CRASH") return voiding(state, "ENGINE_CRASH", event.detail);
      if (event.type === "ENGINE_TIMEOUT") return voiding(state, "ENGINE_TIMEOUT", event.detail);
      return illegal();
    case "IN_PROGRESS":
      if (event.type === "MATCH_END") {
        // Winners are sides. A draw (0) voids the fight and refunds everyone.
        if (event.winnerSide === 0) return voiding(state, "DRAW");
        return ok(state, "SETTLING", [{ type: "RECORD_WINNER", winnerSide: event.winnerSide }]);
      }
      if (event.type === "ENGINE_CRASH") return voiding(state, "ENGINE_CRASH", event.detail);
      if (event.type === "ENGINE_TIMEOUT") return voiding(state, "ENGINE_TIMEOUT", event.detail);
      return illegal();
    case "SETTLING":
      return event.type === "SETTLED_OK" ? ok(state, "SETTLED", [{ type: "SETTLE" }]) : illegal();
    case "VOIDING":
      return event.type === "VOIDED_OK" ? ok(state, "VOIDED", [{ type: "REFUND_ALL" }]) : illegal();
    case "SETTLED":
    case "VOIDED":
      return illegal();
  }
}
