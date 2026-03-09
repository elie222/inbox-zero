import { describe, expect, it } from "vitest";
import { normalizeLabelName } from "./normalize-label-name";

describe("normalizeLabelName", () => {
  it("normalizes case, punctuation, spacing, and edge slashes", () => {
    expect(normalizeLabelName("  Work-Items_/2026.Report  ")).toBe(
      "work items /2026 report",
    );
  });
});
