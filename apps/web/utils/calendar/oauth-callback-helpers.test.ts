import { describe, expect, it } from "vitest";
import {
  extractAadstsCode,
  getSafeOAuthErrorDescription,
  mapCalendarOAuthError,
} from "./oauth-callback-helpers";

describe("calendar OAuth callback helpers", () => {
  describe("extractAadstsCode", () => {
    it("extracts AADSTS code when present", () => {
      expect(
        extractAadstsCode(
          "AADSTS65004: User declined to consent to access the app.",
        ),
      ).toBe("AADSTS65004");
    });

    it("extracts longer AADSTS codes", () => {
      expect(extractAadstsCode("AADSTS7000215: Invalid client secret.")).toBe(
        "AADSTS7000215",
      );
    });

    it("returns null when no code present", () => {
      expect(extractAadstsCode("Some other error")).toBeNull();
    });

    it("returns null for empty descriptions", () => {
      expect(extractAadstsCode(null)).toBeNull();
    });
  });

  describe("mapCalendarOAuthError", () => {
    it("maps consent declined AADSTS", () => {
      expect(
        mapCalendarOAuthError({
          oauthError: "access_denied",
          errorSubcode: "cancel",
          aadstsCode: "AADSTS65004",
        }),
      ).toBe("consent_declined");
    });

    it("maps admin consent required AADSTS", () => {
      expect(
        mapCalendarOAuthError({
          oauthError: "access_denied",
          errorSubcode: null,
          aadstsCode: "AADSTS65001",
        }),
      ).toBe("admin_consent_required");
    });

    it("maps access_denied without subcode", () => {
      expect(
        mapCalendarOAuthError({
          oauthError: "access_denied",
          errorSubcode: null,
          aadstsCode: null,
        }),
      ).toBe("access_denied");
    });

    it("falls back to oauth_error", () => {
      expect(
        mapCalendarOAuthError({
          oauthError: "server_error",
          errorSubcode: null,
          aadstsCode: null,
        }),
      ).toBe("oauth_error");
    });
  });

  describe("getSafeOAuthErrorDescription", () => {
    it("returns a sanitized message with AADSTS code", () => {
      expect(
        getSafeOAuthErrorDescription(
          "AADSTS65004: User declined to consent to access the app.",
        ),
      ).toBe("Microsoft error AADSTS65004.");
    });

    it("returns null when no AADSTS code is present", () => {
      expect(getSafeOAuthErrorDescription("Something else")).toBeNull();
    });
  });
});
