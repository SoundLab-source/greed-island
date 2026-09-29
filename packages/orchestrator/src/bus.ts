/**
 * In-process event bus. The orchestrator publishes after each committed
 * change; the API's SSE stream (build step 6) subscribes.
 */
import type { EngineEvent, LiveOdds, LockedOdds, Side } from "@greed-island/shared";
import { EventEmitter } from "node:events";
import type { FightState, VoidReason } from "./state-machine.ts";

export type BusEvent =
  | { type: "fight_state"; fightId: string; number: number; state: FightState; version: number; bettingClosesAt?: string }
  | { type: "odds_live"; fightId: string; odds: LiveOdds }
  | { type: "odds_locked"; fightId: string; odds: LockedOdds }
  | { type: "engine_event"; fightId: string; event: EngineEvent }
  | { type: "fight_result"; fightId: string; number: number; result: "SETTLED"; winnerSide: Side; winnerCharacterId: string }
  | { type: "fight_result"; fightId: string; number: number; result: "VOIDED"; voidReason: VoidReason };

export class FightBus {
  private readonly emitter = new EventEmitter().setMaxListeners(0);

  publish(event: BusEvent): void {
    this.emitter.emit("event", event);
  }

  /** Returns an unsubscribe function. */
  subscribe(listener: (event: BusEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}
