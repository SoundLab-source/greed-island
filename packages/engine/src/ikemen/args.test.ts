import { DEFAULT_STATS } from "@greed-island/shared";
import { describe, expect, it } from "vitest";
import type { FightSpec } from "../types.ts";
import { buildArgs, runConfigIni, statArgs } from "./args.ts";

const spec: FightSpec = {
  fightId: "fight-1",
  sides: {
    1: { characterId: "c1", fighterId: "kfm", defPath: "chars/kfm/kfm.def", palette: 1, stats: { ...DEFAULT_STATS } },
    2: { characterId: "c2", fighterId: "kfm720", defPath: "chars/kfm720/kfm720.def", palette: 3, stats: { ...DEFAULT_STATS } },
  },
  stage: { id: "temple", defPath: "stages/kfm.def" },
  roundsToWin: 2,
};
const paths = { events: "/runs/f/events.ndjson", log: "/runs/f/match.log", config: "/runs/f/config.ini", stats: "/runs/f/stats.json" };

describe("buildArgs", () => {
  it("builds a quick-VS argv with AI on both sides, best of 3, and run artifacts", () => {
    const { argv } = buildArgs(spec, paths, { mode: "live", aiLevel: 8, simSpeed: 4 });
    const flag = (f: string) => argv[argv.indexOf(f) + 1];
    expect(flag("-p1")).toBe("chars/kfm/kfm.def");
    expect(flag("-p2")).toBe("chars/kfm720/kfm720.def");
    expect(flag("-p1.ai")).toBe("8");
    expect(flag("-p2.ai")).toBe("8");
    expect(flag("-p2.color")).toBe("3");
    expect(flag("-s")).toBe("stages/kfm.def");
    expect(flag("-rounds")).toBe("2");
    expect(flag("-salty.events")).toBe(paths.events);
    expect(flag("-config")).toBe(paths.config);
    expect(argv).not.toContain("-speedtest");
  });

  it("speeds up and mutes sim runs", () => {
    const { argv } = buildArgs(spec, paths, { mode: "sim", aiLevel: 8, simSpeed: 6, extraArgs: ["-windowed"] });
    expect(argv).toContain("-nosound");
    expect(argv[argv.indexOf("-speedtest") + 1]).toBe("6");
    expect(argv.at(-1)).toBe("-windowed");
  });

  it("passes neutral stats as no flags at all", () => {
    const { argv, ignoredStats } = buildArgs(spec, paths, { mode: "live", aiLevel: 8, simSpeed: 4 });
    expect(argv.some((a) => /\.life|\.power/.test(a))).toBe(false);
    expect(ignoredStats).toEqual({ 1: [], 2: [] });
  });

  it("rejects a bad AI level", () => {
    expect(() => buildArgs(spec, paths, { mode: "live", aiLevel: 9, simSpeed: 4 })).toThrow();
  });
});

describe("statArgs", () => {
  it("maps life and power to verified flags, and reports unverified stats as ignored", () => {
    const r = statArgs(2, { lifePct: 120, startPower: 1000, attackPct: 110, defensePct: 95 }, 1000);
    expect(r.args).toEqual(["-p2.lifeMax", "1200", "-p2.life", "1200", "-p2.power", "1000"]);
    expect(r.ignored).toEqual(["attackPct", "defensePct"]);
  });

  it("needs the base life to scale life", () => {
    expect(() => statArgs(1, { ...DEFAULT_STATS, lifePct: 110 })).toThrow(/base life/);
  });
});

describe("runConfigIni", () => {
  it("sets the game's volume only when asked", () => {
    expect(runConfigIni("f")).not.toContain("[Sound]");
    expect(runConfigIni("f", { master: 0 })).toContain("[Sound]\nMasterVolume = 0\n");
    expect(runConfigIni("f", { music: 30 })).toContain("[Sound]\nBGMVolume = 30\n");
    expect(runConfigIni("f", { master: 80, music: 0 })).toContain("[Sound]\nMasterVolume = 80\nBGMVolume = 0\n");
  });

  it("loads the mod via a comma-free Common.Lua1 entry", () => {
    const ini = runConfigIni("f");
    expect(ini).toContain("[Common]");
    const line = ini.split("\n").find((l) => l.startsWith("Lua1"));
    expect(line).toBe("Lua1 = require('external.mods.salty_events')");
    expect(line).not.toContain(",");
  });
});
