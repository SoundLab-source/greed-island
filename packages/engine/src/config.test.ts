import { describe, expect, it } from "vitest";
import { loadEngineConfig } from "./config.ts";

describe("loadEngineConfig", () => {
  it("reads the game's volume, 0 to 100, and leaves it alone when unset", () => {
    expect(loadEngineConfig({}).sound).toEqual({ master: null, music: null });
    expect(loadEngineConfig({ GI_GAME_VOLUME: "0", GI_GAME_MUSIC: "40" }).sound).toEqual({ master: 0, music: 40 });
    expect(() => loadEngineConfig({ GI_GAME_VOLUME: "101" })).toThrow(/0 to 100/);
    expect(() => loadEngineConfig({ GI_GAME_MUSIC: "loud" })).toThrow(/0 to 100/);
  });
});
