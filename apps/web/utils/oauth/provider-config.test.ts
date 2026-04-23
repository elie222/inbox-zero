import { describe, expect, it } from "vitest";
import { isConfiguredOauthValue } from "./provider-config";

describe("isConfiguredOauthValue", () => {
  it("returns false for undefined and empty values", () => {
    expect(isConfiguredOauthValue(undefined)).toBe(false);
    expect(isConfiguredOauthValue("")).toBe(false);
    expect(isConfiguredOauthValue("   ")).toBe(false);
  });

  it("returns false for sentinel and placeholder values", () => {
    expect(isConfiguredOauthValue("skipped")).toBe(false);
    expect(isConfiguredOauthValue("your-google-client-id")).toBe(false);
    expect(isConfiguredOauthValue("your-microsoft-client-secret")).toBe(false);
  });

  it("returns true for credential-like values", () => {
    expect(isConfiguredOauthValue("abc123")).toBe(true);
    expect(isConfiguredOauthValue("GOCSPX-1234")).toBe(true);
  });
});
