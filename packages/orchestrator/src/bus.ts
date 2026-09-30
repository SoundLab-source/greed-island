/**
 * In-process event bus. The orchestrator publishes after each committed
 * change; the API's SSE stream (build step 6) subscribes.
 */
import type { EngineEvent, LiveOdds, LockedOdds, Salt, Side, Tier, TitleCode } from "@greed-island/shared";
import { EventEmitter } from "node:events";
import type { FightState, VoidReason } from "./state-machine.ts";

export type BusEvent =
  | { type: "fight_state"; fightId: string; number: number; state: FightState; version: number; bettingClosesAt?: string }
  | { type: "odds_live"; fightId: string; odds: LiveOdds }
  | { type: "odds_locked"; fightId: string; odds: LockedOdds }
  | { type: "engine_event"; fightId: string; event: EngineEvent }
  | { type: "fight_result"; fightId: string; number: number; result: "SETTLED"; winnerSide: Side; winnerCharacterId: string; ownerReward?: Salt }
  | { type: "fight_result"; fightId: string; number: number; result: "VOIDED"; voidReason: VoidReason }
  /** fightId/number are null for a tournament won by walkover. */
  | { type: "title_earned"; fightId: string | null; number: number | null; characterId: string; name: string; code: TitleCode; label: string }
  | { type: "tournament"; tournamentId: string; number: number; tier: Tier; status: "STARTED"; size: number }
  | { type: "tournament"; tournamentId: string; number: number; tier: Tier; status: "CANCELLED"; detail: string }
  | {
      type: "tournament";
      tournamentId: string;
      number: number;
      tier: Tier;
      status: "FINISHED";
      champion: { characterId: string; name: string };
      podium: { name: string; label: string; balance: Salt }[];
    }
  | { type: "season"; seasonId: string; number: number; status: "STARTED"; startsAt: string; endsAt: string }
  | {
      type: "season";
      seasonId: string;
      number: number;
      status: "ENDED";
      champion: { characterId: string; name: string } | null;
      topBettor: { name: string; saltWon: Salt } | null;
    };

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
