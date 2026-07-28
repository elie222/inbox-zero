import { describe, expect, it } from "vitest";
import { getCardSlugSuggestion, normalizeCardSlug } from "./slug";

describe("normalizeCardSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(normalizeCardSlug("Chris Dagesse")).toBe("chris-dagesse");
  });

  it("strips characters that can't appear in the public path", () => {
    expect(normalizeCardSlug("chris@nucar.com")).toBe("chrisnucarcom");
    expect(normalizeCardSlug("Café Owner")).toBe("cafe-owner");
  });
});

describe("getCardSlugSuggestion", () => {
  it("suggests the full name", () => {
    expect(getCardSlugSuggestion("Chris Dagesse")).toBe("chris-dagesse");
  });

  // An account with no name set falls back rather than producing ""
  it("falls back when there's nothing usable", () => {
    expect(getCardSlugSuggestion(null)).toBe("my-card");
    expect(getCardSlugSuggestion("  ")).toBe("my-card");
    expect(getCardSlugSuggestion("chris@nucar.com")).toBe("my-card");
  });

  // Two letters would make a guessable link and fails the action's minimum
  it("avoids suggestions shorter than three characters", () => {
    expect(getCardSlugSuggestion("Jo").length).toBeGreaterThanOrEqual(3);
  });
});
