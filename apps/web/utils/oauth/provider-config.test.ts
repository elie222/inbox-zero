import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedEnv = vi.hoisted(() => ({
  APPLE_CLIENT_ID: "",
  APPLE_CLIENT_SECRET: "",
}));

vi.mock("@/env", () => ({
  env: mockedEnv,
}));

import { hasAppleOauthConfig, isConfiguredOauthValue } from "./provider-config";

describe("isConfiguredOauthValue", () => {
  beforeEach(() => {
    mockedEnv.APPLE_CLIENT_ID = "";
    mockedEnv.APPLE_CLIENT_SECRET = "";
  });

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

  it("requires both Apple OAuth credentials", () => {
    mockedEnv.APPLE_CLIENT_ID = "com.example.web";
    expect(hasAppleOauthConfig()).toBe(false);

    mockedEnv.APPLE_CLIENT_SECRET = "secret-value";
    expect(hasAppleOauthConfig()).toBe(true);
  });
});
