/**
 * Balance checks: the report `pnpm templates:balance` prints. Pure.
 */
import { winRate, type BalanceSummary } from "./stats.ts";

/** Below this many fights, a pairing's win rate says too little to call it lopsided. */
const MIN_PAIR_FIGHTS = 10;

const pct = (share: number, digits = 0) => `${(share * 100).toFixed(digits)}%`;

/** Columns are right-aligned, except the first and any listed in `left`. */
function table(rows: readonly (readonly string[])[], left: readonly number[] = []): string[] {
  const widths = rows[0]!.map((_, c) => Math.max(...rows.map((r) => r[c]!.length)));
  return rows.map((r) => r.map((cell, c) => (c === 0 || left.includes(c) ? cell.padEnd(widths[c]!) : cell.padStart(widths[c]!))).join("  ").trimEnd());
}

/** `names` maps fighter ids to what to call them; ids without a name are shown as they are. */
export function formatSummary(s: BalanceSummary, names: Readonly<Record<string, string>> = {}): string {
  const name = (id: string) => names[id] ?? id;
  const lines: string[] = [];
  const band = s.targets.overallBand;
  const target = `${pct(0.5 - band)}–${pct(0.5 + band)}`;

  lines.push(`${s.fights} fights finished${s.failed.length ? `, ${s.failed.length} FAILED (crashed or timed out; not counted)` : ""}.`, "");
  lines.push(
    ...table(
      [
        ["Fighter", "Fights", "Won", "Lost", "Drawn", "Win rate", "Likely range", "Rounds", "Life left", "Verdict"],
        ...s.fighters.map((f) => [
          name(f.id),
          String(f.fights),
          String(f.wins),
          String(f.losses),
          String(f.draws),
          pct(f.winRate, 1),
          `${pct(f.low)}–${pct(f.high)}`,
          `${f.roundsWon}–${f.roundsLost}`,
          f.lifeLeftInWins === null ? "" : pct(f.lifeLeftInWins),
          f.verdict.startsWith("too") ? f.verdict.toUpperCase() : f.verdict,
        ]),
      ],
      [9],
    ),
  );
  lines.push("", `"Likely range": where the true win rate probably is, given this many fights. "Life left": average life remaining in rounds won.`);
  if (s.fighters.some((f) => f.verdict.startsWith("leaning"))) lines.push(`"leaning": outside the target, but with too few fights to be sure. Run more (--fights).`);

  const ids = s.fighters.map((f) => f.id);
  const anyPair = ids.flatMap((a) => ids.map((b) => s.matchups[a]?.[b]?.fights ?? 0)).some((n) => n > 0);
  if (anyPair) {
    lines.push("", "Win rate of the row against the column:");
    lines.push(
      ...table([
        ["", ...ids.map(name)],
        ...ids.map((a) => [
          name(a),
          ...ids.map((b) => {
            const t = s.matchups[a]?.[b];
            return a === b ? "–" : !t || t.fights === 0 ? "" : `${pct(winRate(t))} (${t.fights})`;
          }),
        ]),
      ]),
    );
  }
  const mb = s.targets.matchupBand;
  const pairFights = Math.min(...ids.flatMap((a) => ids.map((b) => s.matchups[a]?.[b]?.fights ?? 0)).filter((n) => n > 0), Infinity);
  lines.push(
    "",
    pairFights < MIN_PAIR_FIGHTS
      ? `Too few fights per pairing to judge matchups (${MIN_PAIR_FIGHTS} or more needed).`
      : s.lopsided.length
      ? `Lopsided matchups (outside ${pct(0.5 - mb)}–${pct(0.5 + mb)}): ${s.lopsided.map((l) => `${name(l.winner)} beats ${name(l.loser)} ${pct(l.winRate)} of ${l.fights}`).join("; ")}.`
      : `No lopsided matchups (all within ${pct(0.5 - mb)}–${pct(0.5 + mb)}).`,
  );

  const played = s.fighters.filter((f) => f.fights > 0);
  if (played.length > 1) {
    const top = played[0]!;
    const bottom = played[played.length - 1]!;
    lines.push(`Gap between strongest and weakest: ${(s.spread * 100).toFixed(1)} points (${name(top.id)} ${pct(top.winRate, 1)}, ${name(bottom.id)} ${pct(bottom.winRate, 1)}). Target: everyone within ${target}.`);
  }
  if (s.p1.fights > 0) lines.push(`The player 1 side won ${pct(winRate(s.p1), 1)} of fights (near 50% means the side doesn't matter).`);
  if (s.rounds > 0) lines.push(`${s.rounds} rounds, ${s.roundsByTime} decided by the clock.${s.avgTicks === null ? "" : ` An average fight lasts ${Math.round(s.avgTicks / 60)} seconds of game time.`}`);
  lines.push("", s.balanced ? `Balanced: every fighter is within ${target}.` : `Not balanced yet: ${s.fighters.filter((f) => f.verdict !== "ok").map((f) => `${name(f.id)} is ${f.verdict}`).join(", ")}.`);
  return lines.join("\n");
}
