import { env } from "@/env";
import { afterEach, describe, expect, it } from "vitest";
import {
  canUseMicrosoftOauth,
  isConfiguredOauthValue,
  isMicrosoftOauthEnabled,
} from "./provider-config";

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

describe("isMicrosoftOauthEnabled", () => {
  const originalValue = env.MICROSOFT_OAUTH_ENABLED;

  afterEach(() => {
    env.MICROSOFT_OAUTH_ENABLED = originalValue;
  });

  it("defaults to true", () => {
    env.MICROSOFT_OAUTH_ENABLED = true;

    expect(isMicrosoftOauthEnabled()).toBe(true);
  });

  it("returns false when Microsoft OAuth is disabled", () => {
    env.MICROSOFT_OAUTH_ENABLED = false;

    expect(isMicrosoftOauthEnabled()).toBe(false);
  });
});

describe("canUseMicrosoftOauth", () => {
  const originalClientId = env.MICROSOFT_CLIENT_ID;
  const originalClientSecret = env.MICROSOFT_CLIENT_SECRET;
  const originalEnabled = env.MICROSOFT_OAUTH_ENABLED;

  afterEach(() => {
    env.MICROSOFT_CLIENT_ID = originalClientId;
    env.MICROSOFT_CLIENT_SECRET = originalClientSecret;
    env.MICROSOFT_OAUTH_ENABLED = originalEnabled;
  });

  it("returns false when credentials are configured but OAuth is disabled", () => {
    env.MICROSOFT_CLIENT_ID = "microsoft-client-id";
    env.MICROSOFT_CLIENT_SECRET = "microsoft-client-secret";
    env.MICROSOFT_OAUTH_ENABLED = false;

    expect(canUseMicrosoftOauth()).toBe(false);
  });
});
