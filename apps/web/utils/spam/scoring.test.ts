import { describe, expect, it } from "vitest";
import { scoreTokens, tokenProbability } from "./scoring";

describe("Bayesian evidence", () => {
  it("normalizes unequal class sizes and rounds the token probability", () => {
    expect(
      tokenProbability(
        { good: 20, spam: 10 },
        { good: 200, spam: 100, bias: 0 },
      ),
    ).toBe(0.5);
    expect(
      tokenProbability({ good: 0, spam: 1 }, { good: 100, spam: 100, bias: 0 }),
    ).toBe(Math.fround(1.005 / 1.01));
  });
  it("combines one probability without changing it and handles no evidence", () => {
    expect(scoreTokens([]).score).toBe(0.5);
    expect(
      scoreTokens([{ token: "offer", occurrences: 1, probability: 0.8 }]).score,
    ).toBeCloseTo(0.8, 12);
  });
  it("caps repetition and selected evidence while remaining finite", () => {
    const candidates = Array.from({ length: 30 }, (_, i) => ({
      token: `offer${i}`,
      occurrences: 100,
      probability: 0.999_999_99,
    }));
    const result = scoreTokens(candidates);
    expect(result.selected).toHaveLength(15);
    expect(
      result.selected.filter((x) => x.token === result.selected[0].token),
    ).toHaveLength(2);
    expect(result.score).toBeGreaterThan(0.99);
    expect(result.score).toBeLessThanOrEqual(1);
  });
  it("does not use neutral tokens as evidence", () => {
    expect(
      scoreTokens([{ token: "neutral", occurrences: 2, probability: 0.55 }])
        .selected,
    ).toHaveLength(0);
  });
});
