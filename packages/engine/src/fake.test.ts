import type { EngineEvent } from "@greed-island/shared";
import { DEFAULT_STATS } from "@greed-island/shared";
import { describe, expect, it } from "vitest";
import { createFakeSource, generateScript } from "./fake.ts";
import type { FightSpec } from "./types.ts";

const side = (id: string, rating = 1500) => ({
  characterId: id,
  fighterId: id,
  defPath: `chars/${id}/${id}.def`,
  palette: 1,
  stats: { ...DEFAULT_STATS },
  rating: { rating, deviation: 50, volatility: 0.06 },
});
const spec = (fightId: string, r1 = 1500, r2 = 1500): FightSpec => ({
  fightId,
  sides: { 1: side("a", r1), 2: side("b", r2) },
  stage: { id: "s", defPath: "stages/s.def" },
  roundsToWin: 2,
});

describe("fake engine", () => {
  it("runs a consistent best-of-3 and reports every event", async () => {
    const events: EngineEvent[] = [];
    const outcome = await createFakeSource({ seed: "t" }).run(spec("f1"), { onEvent: (e) => events.push(e) });
    expect(outcome.kind).toBe("finished");
    expect(events[0]?.type).toBe("match_start");
    expect(events.at(-1)?.type).toBe("match_end");
  });

  it("is deterministic per seed and fight", () => {
    expect(generateScript(spec("f1"), { seed: "x" })).toEqual(generateScript(spec("f1"), { seed: "x" }));
  });

  it("mostly lets the much stronger side win", async () => {
    const source = createFakeSource({ seed: "strength" });
    let side1 = 0;
    for (let i = 0; i < 200; i++) {
      const o = await source.run(spec(`f${i}`, 2100, 1300));
      if (o.kind === "finished" && o.winnerSide === 1) side1++;
    }
    expect(side1).toBeGreaterThan(170);
  });

  it("can script crashes, hangs, bad events and draws", async () => {
    const source = (ending: "crash" | "hang" | "bad_events") =>
      createFakeSource({ timeoutMs: 1, script: () => ({ rounds: [{ winnerSide: 1, reason: "ko" }, { winnerSide: 1, reason: "ko" }], ending }) });
    expect((await source("crash").run(spec("c"))).kind).toBe("engine_crash");
    expect((await source("hang").run(spec("h"))).kind).toBe("engine_timeout");
    expect((await source("bad_events").run(spec("b"))).kind).toBe("engine_crash");
    const draw = createFakeSource({ script: () => ({ rounds: [{ winnerSide: 1, reason: "ko" }, { winnerSide: 2, reason: "ko" }, { winnerSide: 0, reason: "time" }], ending: "normal" }) });
    expect(await draw.run(spec("d"))).toMatchObject({ kind: "finished", winnerSide: 0 });
  });

  it("stops on abort", async () => {
    const ctrl = new AbortController();
    const running = createFakeSource({ eventDelayMs: 50 }).run(spec("a"), { signal: ctrl.signal });
    ctrl.abort();
    expect(await running).toMatchObject({ kind: "engine_crash", detail: "aborted" });
  });
});

describe("fake round detail", () => {
  it("is plausible for the round's result: a knockout leaves the loser at 0, the lowest is never above the end", async () => {
    const { fakeRoundDetail, seededRandom: rnd } = await import("./fake.ts");
    const random = rnd("detail");
    for (let i = 0; i < 200; i++) {
      const winnerSide = ((i % 3) as 0 | 1 | 2);
      const reason = i % 4 === 0 ? "time" : "ko";
      const d = fakeRoundDetail(random, { winnerSide, reason });
      for (const k of [0, 1] as const) {
        expect(d.low[k]).toBeLessThanOrEqual(d.life[k]);
        expect(d.life[k]).toBeGreaterThanOrEqual(0);
        expect(d.life[k]).toBeLessThanOrEqual(1000);
      }
      if (winnerSide !== 0 && reason === "ko") expect(d.life[winnerSide === 1 ? 1 : 0]).toBe(0);
      expect([0, 1, 2]).toContain(d.firstHit);
      expect(d.ticks).toBeGreaterThan(0);
    }
  });
});
