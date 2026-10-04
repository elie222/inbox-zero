import { describe, expect, it } from "vitest";
import { getEnabledLoginProviders } from "./login-providers";

const allConfigured = {
  hasGoogleConfig: true,
  hasMicrosoftConfig: true,
  hasAppleConfig: true,
} as const;

describe("getEnabledLoginProviders", () => {
  it("supports an Authelia-only deployment", () => {
    expect([
      ...getEnabledLoginProviders({
        hasGoogleConfig: false,
        hasMicrosoftConfig: false,
        hasAppleConfig: false,
        ssoLoginEnabled: false,
        autheliaLoginEnabled: true,
      }),
    ]).toEqual(["authelia"]);
  });
  it("includes configured OAuth providers", () => {
    const result = getEnabledLoginProviders(allConfigured);
    expect(result.has("google")).toBe(true);
    expect(result.has("microsoft")).toBe(true);
    expect(result.has("apple")).toBe(true);
  });

  it("filters out unconfigured OAuth providers", () => {
    const result = getEnabledLoginProviders({
      hasGoogleConfig: false,
      hasMicrosoftConfig: false,
      hasAppleConfig: false,
    });
    expect(result.has("google")).toBe(false);
    expect(result.has("microsoft")).toBe(false);
    expect(result.has("apple")).toBe(false);
  });

  it("shows SSO only when enabled", () => {
    const on = getEnabledLoginProviders({
      hasGoogleConfig: false,
      hasMicrosoftConfig: false,
      hasAppleConfig: false,
      ssoLoginEnabled: true,
    });
    const off = getEnabledLoginProviders({
      hasGoogleConfig: false,
      hasMicrosoftConfig: false,
      hasAppleConfig: false,
      ssoLoginEnabled: false,
    });
    expect(on.has("sso")).toBe(true);
    expect(off.has("sso")).toBe(false);
  });
});
