import { describe, it, expect } from "vitest";
import { parseEventPrefix, PrefixType } from "./prefix-parser";

describe("parseEventPrefix", () => {
  it("returns HARD_BLOCK with unchanged cleanTitle when no prefix", () => {
    const result = parseEventPrefix("Team Meeting");
    expect(result.type).toBe(PrefixType.HARD_BLOCK);
    expect(result.cleanTitle).toBe("Team Meeting");
  });

  it("returns SOFT with cleanTitle without ~ when ~ prefix", () => {
    const result = parseEventPrefix("~Lunch with friend");
    expect(result.type).toBe(PrefixType.SOFT);
    expect(result.cleanTitle).toBe("Lunch with friend");
  });

  it("returns INFORMATIONAL with cleanTitle without FYI: when FYI: prefix", () => {
    const result = parseEventPrefix("FYI: Conference happening");
    expect(result.type).toBe(PrefixType.INFORMATIONAL);
    expect(result.cleanTitle).toBe("Conference happening");
  });

  it("returns INFORMATIONAL for lowercase fyi: prefix (case-insensitive)", () => {
    const result = parseEventPrefix("fyi: some event");
    expect(result.type).toBe(PrefixType.INFORMATIONAL);
    expect(result.cleanTitle).toBe("some event");
  });

  it("trims whitespace after ~ prefix", () => {
    const result = parseEventPrefix("~   Gym session");
    expect(result.type).toBe(PrefixType.SOFT);
    expect(result.cleanTitle).toBe("Gym session");
  });

  it("trims whitespace after fyi: prefix", () => {
    const result = parseEventPrefix("FYI:   Important notice");
    expect(result.type).toBe(PrefixType.INFORMATIONAL);
    expect(result.cleanTitle).toBe("Important notice");
  });

  it("trims leading/trailing whitespace from the full title", () => {
    const result = parseEventPrefix("  Team Meeting  ");
    expect(result.type).toBe(PrefixType.HARD_BLOCK);
    expect(result.cleanTitle).toBe("Team Meeting");
  });
});
