import { describe, expect, it } from "vitest";
import {
  normalizeOutlookCategoryName,
  sanitizeOutlookCategoryName,
} from "./label-validation";

describe("sanitizeOutlookCategoryName", () => {
  it("replaces commas with spaces and normalizes whitespace", () => {
    const result = sanitizeOutlookCategoryName("  Finance,  Updates,\t2026  ");
    expect(result).toBe("Finance Updates 2026");
  });

  it("removes control characters", () => {
    const result = sanitizeOutlookCategoryName("Alerts\n,\rSystem\tUpdate");
    expect(result).toBe("Alerts System Update");
  });

  it("truncates names to 255 characters", () => {
    const longName = `Start, ${"a".repeat(400)}`;
    const result = sanitizeOutlookCategoryName(longName);
    expect(result.length).toBe(255);
    expect(result.includes(",")).toBe(false);
  });
});

describe("normalizeOutlookCategoryName", () => {
  it("normalizes punctuation and case for matching", () => {
    const withComma = normalizeOutlookCategoryName("Quarterly, Updates");
    const withoutComma = normalizeOutlookCategoryName("quarterly updates");
    expect(withComma).toBe(withoutComma);
  });
});
