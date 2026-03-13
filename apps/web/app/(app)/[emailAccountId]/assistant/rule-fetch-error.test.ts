import { describe, expect, it } from "vitest";
import { isMissingRuleError } from "./rule-fetch-error";

describe("isMissingRuleError", () => {
  it("returns true for 404 errors", () => {
    expect(isMissingRuleError({ status: 404 })).toBe(true);
  });

  it("returns true when the API payload says the rule was not found", () => {
    expect(isMissingRuleError({ info: { error: "Rule not found" } })).toBe(
      true,
    );
  });

  it("returns false for other errors", () => {
    expect(
      isMissingRuleError({
        info: { error: "Unauthorized" },
        message: "An error occurred while fetching the data.",
        status: 401,
      }),
    ).toBe(false);
  });

  it("returns false when there is no error", () => {
    expect(isMissingRuleError()).toBe(false);
  });
});
