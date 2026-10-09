/**
 * The match cycle: book → open betting → wait → lock → run the engine →
 * settle or void → repeat. One fight at a time; every state change goes
 * through applyTransition.
 */
import type { EventSource, FightSpec } from "@greed-island/engine";
import { parseCosmetics, type EngineOutcome, type Side } from "@greed-island/shared";
import { setTimeout as sleep } from "node:timers/promises";
import { applyTransition, bookFight, recordRound, type FightDeps } from "./fights.ts";
import { cryptoRng, type Rng } from "./matchmaking.ts";
import { isTerminal, type FightState, type VoidReason } from "./state-machine.ts";

export interface OrchestratorDeps extends FightDeps {
  source: EventSource;
  rng?: Rng;
  log?: (message: string) => void;
}

export type FightSummary =
  | { fightId: string; number: number; result: "SETTLED"; winnerSide: Side }
  | { fightId: string; number: number; result: "VOIDED"; voidReason: VoidReason };

export class Orchestrator {
  private readonly abort = new AbortController();
  private readonly rng: Rng;
  private readonly log: (message: string) => void;

  constructor(private readonly deps: OrchestratorDeps) {
    if (deps.source.mode === "sim") {
      throw new Error("sim mode is for smoke tests only and never books fights; use live or fake");
    }
    this.rng = deps.rng ?? cryptoRng;
    this.log = deps.log ?? (() => {});
  }

  get stopped(): boolean {
    return this.abort.signal.aborted;
  }

  /** Stop after the current step. A fight interrupted before it finishes is voided. */
  stop(): void {
    this.abort.abort();
  }

  /** Run fights until stopped (or `count` fights have closed). */
  async run(count = Infinity): Promise<FightSummary[]> {
    const done: FightSummary[] = [];
    while (!this.stopped && done.length < count) {
      let summary: FightSummary | null = null;
      try {
        summary = await this.runOneFight();
      } catch (err) {
        if (this.stopped) break;
        this.log(`fight failed: ${(err as Error).stack ?? String(err)}`);
      }
      if (summary) {
        done.push(summary);
        if (done.length < count) await this.pause(this.deps.orch.interFightDelayMs);
      } else if (!this.stopped) {
        // Nothing bookable, or an error: wait before trying again instead of spinning.
        this.log("nothing to book (or an error); retrying shortly");
        await this.pause(Math.max(this.deps.orch.idleRetryMs, this.deps.orch.interFightDelayMs));
      }
    }
    return done;
  }

  private async pause(ms: number): Promise<void> {
    if (ms <= 0) return;
    try {
      await sleep(ms, undefined, { signal: this.abort.signal });
    } catch {
      // stopped
    }
  }

  /** Book and run a single fight to SETTLED or VOIDED. Returns null if nothing could be booked. */
  async runOneFight(): Promise<FightSummary | null> {
    const deps = this.deps;
    const booked = await bookFight(deps, this.rng, deps.source.mode === "live" ? "live" : "fake");
    if (!booked) return null;
    const id = booked.id;
    let state: FightState = booked.state;
    const move = async (event: Parameters<typeof applyTransition>[2]) => {
      state = (await applyTransition(deps, id, event)).to;
      return state;
    };

    try {
      await move({ type: "OPEN_BETTING" });
      this.log(`#${booked.number} betting open for ${deps.orch.bettingWindowMs} ms`);
      await sleep(deps.orch.bettingWindowMs, undefined, { signal: this.abort.signal });
      await move({ type: "LOCK" });

      const spec = await this.fightSpec(id);
      await move({ type: "ENGINE_STARTED" });
      const rounds: Promise<void>[] = [];
      const outcome: EngineOutcome = await deps.source.run(spec, {
        signal: this.abort.signal,
        onEvent: (event) => {
          deps.bus.publish({ type: "engine_event", fightId: id, event });
          if (event.type === "round_end") rounds.push(recordRound(deps.db, id, event));
        },
      });
      await Promise.all(rounds);

      if (outcome.kind === "finished") {
        await move({ type: "MATCH_END", winnerSide: outcome.winnerSide });
      } else if (this.stopped) {
        // We stopped the engine ourselves (shutdown): not a crash.
        await move({ type: "VOID", reason: "ADMIN", detail: "orchestrator stopped" });
      } else if (outcome.kind === "engine_timeout") {
        await move({ type: "ENGINE_TIMEOUT", detail: outcome.detail });
      } else {
        await move({ type: "ENGINE_CRASH", detail: outcome.detail });
      }
      if (state === "SETTLING") await move({ type: "SETTLED_OK" });
      if (state === "VOIDING") await move({ type: "VOIDED_OK" });
    } catch (err) {
      // Anything unexpected (or a stop mid-fight): void it so nobody's stake is stuck.
      if (!isTerminal(state)) {
        const detail = this.stopped ? "orchestrator stopped" : `orchestrator error: ${(err as Error).message}`.slice(0, 500);
        if (state !== "VOIDING") await move({ type: "VOID", reason: "ADMIN", detail });
        await move({ type: "VOIDED_OK" });
      }
      if (!this.stopped) throw err;
    }

    const fight = await deps.db.fight.findUniqueOrThrow({ where: { id } });
    this.log(`#${fight.number} ${fight.state}${fight.winnerSide ? ` (side ${fight.winnerSide} won)` : ` (${fight.voidReason})`}`);
    return fight.state === "SETTLED"
      ? { fightId: id, number: fight.number, result: "SETTLED", winnerSide: fight.winnerSide as Side }
      : { fightId: id, number: fight.number, result: "VOIDED", voidReason: fight.voidReason! };
  }

  /** What the runner launches: characters and stage from the frozen loadouts. */
  private async fightSpec(fightId: string): Promise<FightSpec> {
    const fight = await this.deps.db.fight.findUniqueOrThrow({
      where: { id: fightId },
      include: { stage: true, loadouts: { include: { character: { include: { fighter: true } } }, orderBy: { side: "asc" } } },
    });
    const side = (s: Side) => {
      const l = fight.loadouts[s - 1]!;
      // Wearing an NFT look with recoloured sprites: its own character, whose colour 1 is the look's.
      const look = parseCosmetics(l.cosmetics).look;
      return {
        characterId: l.characterId,
        fighterId: l.fighterId,
        defPath: look?.defPath ?? l.character.fighter.defPath,
        palette: look?.defPath ? 1 : l.character.palette,
        stats: { lifePct: l.lifePct, startPower: l.startPower, attackPct: l.attackPct, defensePct: l.defensePct },
        rating: { rating: l.rating, deviation: l.deviation, volatility: l.volatility },
        // The name bettors saw (frozen with the loadout), on the health bar too.
        displayName: l.name,
      };
    };
    return { fightId, sides: { 1: side(1), 2: side(2) }, stage: { id: fight.stage.id, defPath: fight.stage.defPath }, roundsToWin: fight.roundsToWin };
  }
}
