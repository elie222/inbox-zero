import { describe, it, expect } from "vitest";
import { summariseBody } from "./validation";

describe("summariseBody", () => {
  it("rejects textPlain exceeding 50,000 characters", () => {
    const result = summariseBody.safeParse({
      textPlain: "a".repeat(50_001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects textHtml exceeding 50,000 characters", () => {
    const result = summariseBody.safeParse({
      textHtml: "a".repeat(50_001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts text fields at the 50,000-character limit", () => {
    const result = summariseBody.safeParse({
      textPlain: "a".repeat(50_000),
      textHtml: "a".repeat(50_000),
    });
    expect(result.success).toBe(true);
  });
});
