import { describe, expect, it } from "vitest";
import {
  classifyMicrosoftOAuthCallbackError,
  classifyMicrosoftOAuthError,
  extractAadstsCode,
  getSafeMicrosoftOAuthErrorDescription,
  getMissingMicrosoftScopes,
  parseMicrosoftScopes,
} from "./microsoft-oauth";

describe("microsoft OAuth helpers", () => {
  describe("extractAadstsCode", () => {
    it("extracts AADSTS codes from Microsoft errors", () => {
      expect(
        extractAadstsCode(
          "AADSTS65001: The user or administrator has not consented to use the application.",
        ),
      ).toBe("AADSTS65001");
    });

    it("returns null when no code is present", () => {
      expect(extractAadstsCode("Something else")).toBeNull();
    });
  });

  describe("parseMicrosoftScopes", () => {
    it("parses comma or space separated scopes", () => {
      expect(parseMicrosoftScopes("openid profile,email")).toEqual([
        "openid",
        "profile",
        "email",
      ]);
    });
  });

  describe("getMissingMicrosoftScopes", () => {
    it("returns expected scopes that were not granted", () => {
      expect(
        getMissingMicrosoftScopes("openid profile email", [
          "openid",
          "profile",
          "email",
          "offline_access",
        ]),
      ).toEqual(["offline_access"]);
    });
  });

  describe("classifyMicrosoftOAuthError", () => {
    it("maps admin consent required errors", () => {
      expect(
        classifyMicrosoftOAuthError(
          "AADSTS65001: The user or administrator has not consented to use the application.",
        ),
      ).toMatchObject({
        errorCode: "admin_consent_required",
        aadstsCode: "AADSTS65001",
      });
    });

    it("maps invalid scope configuration errors", () => {
      expect(
        classifyMicrosoftOAuthError(
          "AADSTS70011: The provided request must include a scope input parameter.",
        ),
      ).toMatchObject({
        errorCode: "invalid_scope_configuration",
        aadstsCode: "AADSTS70011",
      });
    });

    it("maps missing refresh token errors", () => {
      expect(
        classifyMicrosoftOAuthError(
          "No refresh token returned from Microsoft (ensure offline_access scope and correct app type)",
        ),
      ).toMatchObject({
        errorCode: "consent_incomplete",
      });
    });

    it("maps broader incomplete consent errors", () => {
      expect(
        classifyMicrosoftOAuthError(
          "Microsoft did not grant all required permissions. Please reconnect and approve every requested permission.",
        ),
      ).toMatchObject({
        errorCode: "consent_incomplete",
      });
    });
  });

  describe("classifyMicrosoftOAuthCallbackError", () => {
    it("maps admin consent required callback errors", () => {
      expect(
        classifyMicrosoftOAuthCallbackError({
          oauthError: "access_denied",
          errorDescription:
            "AADSTS65001: The user or administrator has not consented to use the application.",
        }),
      ).toMatchObject({
        errorCode: "admin_consent_required",
        aadstsCode: "AADSTS65001",
      });
    });

    it("maps declined consent callback errors", () => {
      expect(
        classifyMicrosoftOAuthCallbackError({
          oauthError: "access_denied",
          errorDescription:
            "AADSTS65004: The resource owner or authorization server denied the request.",
        }),
      ).toMatchObject({
        errorCode: "consent_declined",
        aadstsCode: "AADSTS65004",
      });
    });
  });

  describe("getSafeMicrosoftOAuthErrorDescription", () => {
    it("returns a sanitized AADSTS message", () => {
      expect(
        getSafeMicrosoftOAuthErrorDescription(
          "AADSTS700016: Application with identifier was not found in the directory.",
        ),
      ).toBe("Microsoft error AADSTS700016.");
    });

    it("returns null when no AADSTS code is present", () => {
      expect(
        getSafeMicrosoftOAuthErrorDescription("Something went wrong"),
      ).toBeNull();
    });
  });
});
