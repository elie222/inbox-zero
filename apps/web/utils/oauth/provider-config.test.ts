import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedEnv = vi.hoisted(() => ({
  APPLE_APP_BUNDLE_IDENTIFIER: "",
  APPLE_CLIENT_ID: "",
  APPLE_KEY_ID: "",
  APPLE_PRIVATE_KEY: "",
  APPLE_TEAM_ID: "",
}));

vi.mock("@/env", () => ({
  env: mockedEnv,
}));

import { hasAppleOauthConfig, isConfiguredOauthValue } from "./provider-config";

describe("isConfiguredOauthValue", () => {
  beforeEach(() => {
    mockedEnv.APPLE_APP_BUNDLE_IDENTIFIER = "";
    mockedEnv.APPLE_CLIENT_ID = "";
    mockedEnv.APPLE_KEY_ID = "";
    mockedEnv.APPLE_PRIVATE_KEY = "";
    mockedEnv.APPLE_TEAM_ID = "";
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

  it("requires all Apple mobile OAuth values", () => {
    mockedEnv.APPLE_CLIENT_ID = "com.example.web";
    expect(hasAppleOauthConfig()).toBe(false);

    mockedEnv.APPLE_TEAM_ID = "TEAM123456";
    expect(hasAppleOauthConfig()).toBe(false);

    mockedEnv.APPLE_KEY_ID = "KEY1234567";
    expect(hasAppleOauthConfig()).toBe(false);

    mockedEnv.APPLE_PRIVATE_KEY = "private-key-value";
    expect(hasAppleOauthConfig()).toBe(false);

    mockedEnv.APPLE_APP_BUNDLE_IDENTIFIER = "com.example.app";
    expect(hasAppleOauthConfig()).toBe(true);
  });
});
