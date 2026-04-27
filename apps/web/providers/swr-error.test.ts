import { describe, expect, it } from "vitest";
import { getSWRFetchErrorMessage } from "./swr-error";

describe("getSWRFetchErrorMessage", () => {
  it("returns the message field when it is a string", () => {
    expect(
      getSWRFetchErrorMessage({
        message: "Failed to fetch thread",
        error: { issues: [{ message: "Validation error" }] },
      }),
    ).toBe("Failed to fetch thread");
  });

  it("returns the error field when it is a string", () => {
    expect(
      getSWRFetchErrorMessage({
        error: "Authorization required. Please grant permissions.",
      }),
    ).toBe("Authorization required. Please grant permissions.");
  });

  it("formats zod-style issues into a readable message", () => {
    expect(
      getSWRFetchErrorMessage({
        error: {
          issues: [{ message: "Email is required" }, { message: "Invalid ID" }],
        },
      }),
    ).toBe("Email is required, Invalid ID");
  });

  it("falls back to the default message for non-string non-issues errors", () => {
    expect(
      getSWRFetchErrorMessage({
        error: { detail: "Not directly user-facing" },
      }),
    ).toBe("An error occurred while fetching the data.");
  });
});
