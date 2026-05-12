import { describe, expect, it } from "vitest";
import { getEnabledLoginProviders } from "./login-providers";

const allConfigured = {
  hasMicrosoftConfig: true,
  hasAppleConfig: true,
} as const;

describe("getEnabledLoginProviders", () => {
  describe("when LOGIN_PROVIDERS is set", () => {
    it("intersects with configured providers — narrows but never widens", () => {
      const result = getEnabledLoginProviders({
        rawAllowlist: "google,microsoft,apple,sso",
        hasMicrosoftConfig: false,
        hasAppleConfig: false,
      });
      expect(result.has("google")).toBe(true);
      expect(result.has("sso")).toBe(true);
      // Microsoft and Apple credentials aren't configured, so they're filtered out.
      expect(result.has("microsoft")).toBe(false);
      expect(result.has("apple")).toBe(false);
    });

    it("narrows to a single provider", () => {
      const result = getEnabledLoginProviders({
        rawAllowlist: "sso",
        ...allConfigured,
      });
      expect(result.has("sso")).toBe(true);
      expect(result.has("google")).toBe(false);
      expect(result.has("microsoft")).toBe(false);
      expect(result.has("apple")).toBe(false);
    });

    it("trims whitespace and is case-insensitive", () => {
      const result = getEnabledLoginProviders({
        rawAllowlist: " GOOGLE , Microsoft , SsO ",
        ...allConfigured,
      });
      expect(result.has("google")).toBe(true);
      expect(result.has("microsoft")).toBe(true);
      expect(result.has("sso")).toBe(true);
      expect(result.has("apple")).toBe(false);
    });

    it("ignores unknown tokens", () => {
      const result = getEnabledLoginProviders({
        rawAllowlist: "google,nonsense,facebook",
        ...allConfigured,
      });
      expect(result.has("google")).toBe(true);
      expect(result.size).toBe(1);
    });

    it("falls back to legacy behaviour when every token is unknown (avoids lockout)", () => {
      const result = getEnabledLoginProviders({
        rawAllowlist: "facebook,twitter",
        ...allConfigured,
        legacyShowAppleLogin: true,
        legacySsoLoginEnabled: true,
      });
      // No valid tokens -> treated as unset, falls back to legacy flags.
      expect(result.has("google")).toBe(true);
      expect(result.has("microsoft")).toBe(true);
      expect(result.has("apple")).toBe(true);
      expect(result.has("sso")).toBe(true);
    });

    it("supersedes the legacy NEXT_PUBLIC_SHOW_APPLE_LOGIN flag", () => {
      const result = getEnabledLoginProviders({
        rawAllowlist: "apple",
        ...allConfigured,
        legacyShowAppleLogin: false,
      });
      expect(result.has("apple")).toBe(true);
    });

    it("supersedes the legacy SSO_LOGIN_ENABLED flag", () => {
      const result = getEnabledLoginProviders({
        rawAllowlist: "sso",
        ...allConfigured,
        legacySsoLoginEnabled: false,
      });
      expect(result.has("sso")).toBe(true);
    });
  });

  describe("legacy fallback when LOGIN_PROVIDERS is unset", () => {
    it("includes Google by default", () => {
      const result = getEnabledLoginProviders({
        rawAllowlist: undefined,
        hasMicrosoftConfig: false,
        hasAppleConfig: false,
      });
      expect(result.has("google")).toBe(true);
    });

    it("treats empty/whitespace as unset", () => {
      const result = getEnabledLoginProviders({
        rawAllowlist: "   ",
        hasMicrosoftConfig: false,
        hasAppleConfig: false,
      });
      expect(result.has("google")).toBe(true);
      expect(result.has("microsoft")).toBe(false);
    });

    it("shows Microsoft only when configured", () => {
      const withConfig = getEnabledLoginProviders({
        rawAllowlist: undefined,
        hasMicrosoftConfig: true,
        hasAppleConfig: false,
      });
      const withoutConfig = getEnabledLoginProviders({
        rawAllowlist: undefined,
        hasMicrosoftConfig: false,
        hasAppleConfig: false,
      });
      expect(withConfig.has("microsoft")).toBe(true);
      expect(withoutConfig.has("microsoft")).toBe(false);
    });

    it("shows Apple only when configured AND legacy flag is true", () => {
      const both = getEnabledLoginProviders({
        rawAllowlist: undefined,
        hasMicrosoftConfig: false,
        hasAppleConfig: true,
        legacyShowAppleLogin: true,
      });
      const flagOnly = getEnabledLoginProviders({
        rawAllowlist: undefined,
        hasMicrosoftConfig: false,
        hasAppleConfig: false,
        legacyShowAppleLogin: true,
      });
      const configOnly = getEnabledLoginProviders({
        rawAllowlist: undefined,
        hasMicrosoftConfig: false,
        hasAppleConfig: true,
        legacyShowAppleLogin: false,
      });
      expect(both.has("apple")).toBe(true);
      expect(flagOnly.has("apple")).toBe(false);
      expect(configOnly.has("apple")).toBe(false);
    });

    it("shows SSO only when legacy flag is true", () => {
      const on = getEnabledLoginProviders({
        rawAllowlist: undefined,
        hasMicrosoftConfig: false,
        hasAppleConfig: false,
        legacySsoLoginEnabled: true,
      });
      const off = getEnabledLoginProviders({
        rawAllowlist: undefined,
        hasMicrosoftConfig: false,
        hasAppleConfig: false,
        legacySsoLoginEnabled: false,
      });
      expect(on.has("sso")).toBe(true);
      expect(off.has("sso")).toBe(false);
    });
  });
});
