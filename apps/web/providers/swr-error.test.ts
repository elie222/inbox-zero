import { describe, expect, it } from "vitest";
import { getSWRFetchErrorMessage } from "./swr-error";

describe("getSWRFetchErrorMessage", () => {
  it("preserves API explanations used by email previews", () => {
    expect(
      getSWRFetchErrorMessage({
        error:
          "Gmail is temporarily limiting requests. Please try again shortly.",
        isKnownError: true,
      }),
    ).toBe("Gmail is temporarily limiting requests. Please try again shortly.");
  });
  it("prefers an explicit message over error", () => {
    expect(
      getSWRFetchErrorMessage({ message: "Explanation", error: "Other" }),
    ).toBe("Explanation");
  });
  it("formats validation issues without exposing object coercions", () => {
    expect(
      getSWRFetchErrorMessage({
        error: { issues: [{ message: "Invalid ID" }, null, { message: 42 }] },
      }),
    ).toBe("Invalid ID, Validation error, Validation error");
  });
  it.each([
    null,
    undefined,
    {},
    { error: {} },
    { error: { issues: [] } },
    { error: "" },
  ])("safely handles malformed or empty payload %j", (payload) => {
    expect(getSWRFetchErrorMessage(payload)).toBe(
      "An error occurred while fetching the data.",
    );
  });
  it("ignores non-string message fields", () => {
    expect(
      getSWRFetchErrorMessage({ message: {}, error: "Reconnect your account" }),
    ).toBe("Reconnect your account");
  });
});
