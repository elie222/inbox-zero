import { describe, expect, it } from "vitest";
import { SafeError } from "@/utils/error";
import { getStreamErrorText } from "./stream-error-text";

describe("getStreamErrorText", () => {
  it("passes a SafeError message through", () => {
    expect(getStreamErrorText(new SafeError("Account not found", 404))).toBe(
      "Account not found",
    );
  });

  it("never sends the message of a non-SafeError, only name and status", () => {
    const error = Object.assign(
      new TypeError("bad call https://u:pw@host/path?key=abc to provider"),
      { statusCode: 429 },
    );
    expect(getStreamErrorText(error)).toBe("TypeError (status 429)");
  });

  it("uses a generic label for a plain Error", () => {
    const text = getStreamErrorText(new Error("secret detail"));
    expect(text).toBe("Request failed");
    expect(text).not.toContain("secret");
  });

  it("falls back for non-errors", () => {
    expect(getStreamErrorText("boom")).toBe("An error occurred");
  });
});
