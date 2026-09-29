import { describe, expect, it } from "vitest";
import { iniValue, parseIni } from "./ini.ts";

describe("parseIni", () => {
  const text = [
    "﻿; header comment",
    "[Info]",
    'name = "Kung Fu Man"        ;Name of character',
    'displayname = "K;F;M" ; semicolons inside quotes survive',
    "author=Elecbyte",
    "name = second value is ignored",
    "",
    "[files]",
    "cns = kfm.cns",
    "[INFO]",
    "extra = merged into the first Info section",
  ].join("\r\n");
  const ini = parseIni(text);

  it("reads quoted and unquoted values, stripping comments", () => {
    expect(iniValue(ini, "Info", "name")).toBe("Kung Fu Man");
    expect(iniValue(ini, "info", "DisplayName")).toBe("K;F;M");
    expect(iniValue(ini, "Info", "author")).toBe("Elecbyte");
  });

  it("is case-insensitive and keeps the first occurrence", () => {
    expect(iniValue(ini, "FILES", "cns")).toBe("kfm.cns");
    expect(iniValue(ini, "Info", "extra")).toBe("merged into the first Info section");
  });

  it("returns undefined for missing or empty values", () => {
    expect(iniValue(ini, "Info", "nope")).toBeUndefined();
    expect(iniValue(parseIni("[A]\nk =\n"), "A", "k")).toBeUndefined();
  });
});
