// Stand-in for the IKEMEN binary in runner tests. Behaviour is chosen by STUB_MODE.
import { appendFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => args[args.indexOf(name) + 1];
const events = flag("-salty.events");
const log = flag("-log");
const emit = (obj) => appendFileSync(events, JSON.stringify(obj) + "\n");
const dump = (winSide, w1, w2) =>
  writeFileSync(
    log,
    `table: 0x1 {\n  ["winSide"] => ${winSide}\n  ["wins"] => table: 0x2 {\n              [1] => ${w1}\n              [2] => ${w2}\n              }\n  ["lastRound"] => 3\n}\n`,
  );
const fullMatch = () => {
  emit({ type: "match_start", p1: "A", p2: "B" });
  for (const [round, winnerSide] of [[1, 1], [2, 2], [3, 1]]) {
    emit({ type: "round_start", round });
    emit({ type: "round_end", round, winnerSide, reason: "ko" });
  }
  emit({ type: "match_end", winnerSide: 1, wins: [2, 1] });
};

console.log(`stub cwd=${process.cwd()}`);
switch (process.env.STUB_MODE) {
  case "ok":
    fullMatch();
    dump(0, 2, 1);
    break;
  case "crash":
    emit({ type: "match_start" });
    emit({ type: "round_start", round: 1 });
    console.error("stub: simulated crash");
    process.exit(3);
  case "hang":
    process.on("SIGTERM", () => {}); // ignore, so the runner must escalate to SIGKILL
    setInterval(() => {}, 1000);
    break;
  case "log-only":
    dump(1, 1, 2);
    break;
  case "closed":
    // The window closed mid-match: a clean exit, and a log with nobody at the win count.
    emit({ type: "match_start", p1: "A", p2: "B" });
    emit({ type: "round_start", round: 1 });
    dump(-1, 0, 0);
    break;
  case "garbage":
    appendFileSync(events, "this is not json\n");
    break;
  case "linger":
    fullMatch();
    setInterval(() => {}, 1000);
    break;
  default:
    process.exit(99);
}
