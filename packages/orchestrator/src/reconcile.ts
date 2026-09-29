/**
 * Startup reconciliation: finish or void every fight left mid-way by a
 * previous orchestrator. Runs while holding the orchestrator lock, so no
 * engine process from before can still be running for these fights.
 */
import { applyTransition, type FightDeps } from "./fights.ts";
import type { FightState } from "./state-machine.ts";

export interface ReconcileAction {
  fightId: string;
  number: number;
  from: FightState;
  to: FightState;
}

export async function reconcile(deps: FightDeps): Promise<ReconcileAction[]> {
  const open = await deps.db.fight.findMany({
    where: { state: { notIn: ["SETTLED", "VOIDED"] } },
    orderBy: { number: "asc" },
    select: { id: true, number: true, state: true },
  });
  const actions: ReconcileAction[] = [];
  for (const f of open) {
    let state: FightState = f.state;
    switch (state) {
      case "BOOKED":
      case "BETTING_OPEN":
      case "LOCKED":
      case "IN_PROGRESS":
        // The betting window or the engine run was lost with the old process.
        state = (await applyTransition(deps, f.id, { type: "VOID", reason: "RECONCILE_ORPHANED", detail: `found in ${state} at startup` })).to;
        state = (await applyTransition(deps, f.id, { type: "VOIDED_OK" })).to;
        break;
      case "SETTLING":
        // The winner is known; settlement is idempotent, so just finish it.
        state = (await applyTransition(deps, f.id, { type: "SETTLED_OK" })).to;
        break;
      case "VOIDING":
        state = (await applyTransition(deps, f.id, { type: "VOIDED_OK" })).to;
        break;
      default:
        continue;
    }
    actions.push({ fightId: f.id, number: f.number, from: f.state, to: state });
  }
  return actions;
}
