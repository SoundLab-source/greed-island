import { describe, expect, it } from "vitest";
import { AUDIT_SCRIPT, summarize } from "./web-check.ts";

describe("web check", () => {
  it("reports each page and width with problems, or that all is well", () => {
    expect(summarize([{ page: "shop", width: 375, problems: [] }])).toEqual(["All 1 page and width checks look right."]);
    expect(summarize([{ page: "shop", width: 375, problems: [] }, { page: "rankings", width: 826, problems: ['wraps: .tag "Tournament Champion"'] }])).toEqual([
      "rankings at 826px:",
      '  - wraps: .tag "Tournament Champion"',
    ]);
  });

  it("sends the page a self-contained script that returns a list", () => {
    expect(AUDIT_SCRIPT.startsWith("(() => {")).toBe(true);
    expect(AUDIT_SCRIPT.trim().endsWith("})()")).toBe(true);
    expect(() => new Function(`return ${AUDIT_SCRIPT.replace(/^\(\(\) => \{/, "(() => { return [];")}`)).not.toThrow();
  });
});
