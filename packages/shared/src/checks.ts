/**
 * The automatic checks on a submitted fighter (docs/PHASE3.md step 4): what a
 * run reports, and whether it passed. Pure.
 *
 * A check runs on the engine character the fighter will fight as. Until
 * community fighters are built from their own art, that is its archetype's
 * template, with the template's art (`ownArt: false`).
 */

export interface CheckSettings {
  /** Sim fights for the balance simulation, spread over the opponents. */
  fights: number;
  /** How far the fighter's win rate may be from its archetype's reference, as a share (0.1 = 10 points). */
  tolerance: number;
}

export const DEFAULT_CHECKS: CheckSettings = { fights: 200, tolerance: 0.1 };

export function validateChecks(c: CheckSettings): CheckSettings {
  if (!Number.isInteger(c.fights) || c.fights < 10 || c.fights > 5000) throw new Error(`check fights must be a whole number from 10 to 5000 (got ${c.fights})`);
  if (!(c.tolerance > 0 && c.tolerance <= 0.5)) throw new Error(`check tolerance must be above 0 and at most 0.5 (got ${c.tolerance})`);
  return c;
}

/** Smoke test: one sim fight that has to finish. */
export interface SmokeResult {
  ok: boolean;
  /** What happened, in a sentence. */
  detail: string;
}

/** Template check: the fighter's moves and numbers against its archetype's limits. */
export interface TemplateResult {
  ok: boolean;
  /** What's outside the limits (empty when ok). */
  findings: string[];
}

export interface WinTally {
  fights: number;
  wins: number;
  draws: number;
}

/** Balance simulation: the fighter's win rate against the same opponents as its archetype's reference. */
export interface BalanceResult {
  ok: boolean;
  /** The opponents both met. */
  opponents: string[];
  /** The fighter's own fights; null when it plays the reference character itself, so there is nothing of its own to measure. */
  fighter: (WinTally & { winRate: number }) | null;
  reference: WinTally & { winRate: number; fighterId: string; name: string };
  /** Fighter minus reference, as a share; null with `fighter`. */
  difference: number | null;
  tolerance: number;
}

export interface CheckResults {
  /** The engine character it was checked as. */
  checkedAs: { fighterId: string; name: string; ownArt: boolean };
  smoke: SmokeResult;
  /** Null when the smoke test failed: the rest wasn't run. */
  template: TemplateResult | null;
  balance: BalanceResult | null;
}

/** Wins plus half the draws, over fights. */
export function tallyRate(t: WinTally): number {
  return t.fights === 0 ? 0 : (t.wins + t.draws / 2) / t.fights;
}

/** `fighter` null: it plays the reference character itself, which passes by definition. */
export function balanceResult(
  fighter: WinTally | null,
  reference: WinTally & { fighterId: string; name: string },
  opponents: readonly string[],
  tolerance: number,
): BalanceResult {
  const referenceRate = tallyRate(reference);
  if (!fighter) return { ok: true, opponents: [...opponents], fighter: null, reference: { ...reference, winRate: referenceRate }, difference: null, tolerance };
  const winRate = tallyRate(fighter);
  const difference = winRate - referenceRate;
  // A hair of tolerance, so exactly 10 points passes a 10-point limit.
  return { ok: Math.abs(difference) <= tolerance + 1e-9, opponents: [...opponents], fighter: { ...fighter, winRate }, reference: { ...reference, winRate: referenceRate }, difference, tolerance };
}

/** A run passes when all three checks ran and passed. */
export function checksPassed(r: CheckResults): boolean {
  return r.smoke.ok && r.template !== null && r.template.ok && r.balance !== null && r.balance.ok;
}

const pct = (share: number) => `${(share * 100).toFixed(1)}%`;

/** One line per check, for the staff page and logs. */
export function describeChecks(r: CheckResults): string[] {
  const lines = [
    `Checked as ${r.checkedAs.name}${r.checkedAs.ownArt ? "" : " (its archetype's template, with the template's art: this fighter's own art isn't built into a character yet)"}.`,
    `Smoke test: ${r.smoke.ok ? "passed" : "FAILED"}. ${r.smoke.detail}`,
  ];
  if (r.template) lines.push(`Template check: ${r.template.ok ? "passed (moves and numbers are within its archetype's limits)" : `FAILED. ${r.template.findings.join("; ")}`}.`);
  if (r.balance) {
    const b = r.balance;
    const ref = `${b.reference.name} wins ${pct(b.reference.winRate)} of ${b.reference.fights} fights against ${b.opponents.join(", ")}`;
    lines.push(
      b.fighter && b.difference !== null
        ? `Balance simulation: ${b.ok ? "passed" : "FAILED"}. It won ${pct(b.fighter.winRate)} of ${b.fighter.fights} fights; ${ref}: ${b.difference >= 0 ? "+" : "-"}${(Math.abs(b.difference) * 100).toFixed(1)} points (limit ${(b.tolerance * 100).toFixed(0)}).`
        : `Balance simulation: passed. It plays the reference character itself; ${ref}.`,
    );
  }
  if (!r.smoke.ok) lines.push("The template check and balance simulation weren't run.");
  return lines;
}
