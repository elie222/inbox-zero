import { describe, expect, it } from "vitest";
import {
  getSWRFetchErrorMessage,
  normalizeSWRFetchErrorData,
} from "./swr-error";

describe("normalizeSWRFetchErrorData", () => {
  it.each([
    null,
    [],
    "error",
    42,
    false,
  ])("normalizes malformed JSON response %j before metadata access", async (payload) => {
    const response = Response.json(payload, { status: 500 });
    const data = normalizeSWRFetchErrorData(await response.json());
    expect(data.errorCode).toBeUndefined();
    expect(data.isKnownError).toBeUndefined();
    expect(getSWRFetchErrorMessage(data)).toBe(
      "An error occurred while fetching the data.",
    );
  });
  it("preserves authorization metadata and messages", () => {
    const payload = {
      error: "Reconnect",
      errorCode: "NO_REFRESH_TOKEN",
      isKnownError: true,
    };
    expect(normalizeSWRFetchErrorData(payload)).toEqual(payload);
  });
});

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
    { error: "  " },
    { message: " \t" },
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
  it("falls through blank messages to a useful error", () => {
    expect(getSWRFetchErrorMessage({ message: "  ", error: "Reconnect" })).toBe(
      "Reconnect",
    );
    expect(
      getSWRFetchErrorMessage({ error: { issues: [{ message: "  " }] } }),
    ).toBe("Validation error");
  });
});
