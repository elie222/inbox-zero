import { describe, expect, it } from "vitest";
import { ProviderRateLimitModeError } from "@/utils/email/rate-limit-mode-error";
import { isEmailProviderRateLimitError } from "./is-provider-rate-limit-error";

describe("isEmailProviderRateLimitError", () => {
  it("recognizes active rate-limit mode without provider context", () => {
    expect(
      isEmailProviderRateLimitError({
        error: new ProviderRateLimitModeError({ provider: "google" }),
      }),
    ).toBe(true);
  });

  it("recognizes nested Gmail rate-limit errors", () => {
    expect(
      isEmailProviderRateLimitError({
        error: new Error("Batch request failed", {
          cause: Object.assign(new Error("Provider request was throttled"), {
            response: { status: 429 },
          }),
        }),
        provider: "google",
      }),
    ).toBe(true);
  });

  it("recognizes Microsoft rate-limit errors", () => {
    expect(
      isEmailProviderRateLimitError({
        error: { statusCode: 429 },
        provider: "microsoft",
      }),
    ).toBe(true);
  });

  it.each([
    [429, true],
    [503, false],
    [401, false],
  ])("classifies Fastmail HTTP %s without retrying ambiguous failures", (status, expected) => {
    expect(
      isEmailProviderRateLimitError({
        error: { status },
        provider: "fastmail",
      }),
    ).toBe(expected);
  });

  it("does not classify unrelated provider errors as rate limits", () => {
    expect(
      isEmailProviderRateLimitError({
        error: new Error("Provider failed"),
        provider: "google",
      }),
    ).toBe(false);
  });
});
