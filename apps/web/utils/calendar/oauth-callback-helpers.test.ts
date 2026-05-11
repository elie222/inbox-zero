import { describe, expect, it } from "vitest";
import {
  extractAadstsCode,
  getCalendarRedirectPath,
  getSafeOAuthErrorDescription,
  mapCalendarOAuthError,
} from "./oauth-callback-helpers";

describe("calendar OAuth callback helpers", () => {
  describe("extractAadstsCode", () => {
    it.each([
      {
        name: "AADSTS code is present",
        description: "AADSTS65004: User declined to consent to access the app.",
        expected: "AADSTS65004",
      },
      {
        name: "longer AADSTS code is present",
        description: "AADSTS7000215: Invalid client secret.",
        expected: "AADSTS7000215",
      },
      {
        name: "no code is present",
        description: "Some other error",
        expected: null,
      },
      {
        name: "description is empty",
        description: null,
        expected: null,
      },
    ])("returns expected code when $name", ({ description, expected }) => {
      expect(extractAadstsCode(description)).toBe(expected);
    });
  });

  describe("mapCalendarOAuthError", () => {
    it.each([
      {
        name: "consent declined AADSTS",
        input: {
          oauthError: "access_denied",
          errorSubcode: "cancel",
          aadstsCode: "AADSTS65004",
        },
        expected: "consent_declined",
      },
      {
        name: "admin consent required AADSTS",
        input: {
          oauthError: "access_denied",
          errorSubcode: null,
          aadstsCode: "AADSTS65001",
        },
        expected: "admin_consent_required",
      },
      {
        name: "access_denied without subcode",
        input: {
          oauthError: "access_denied",
          errorSubcode: null,
          aadstsCode: null,
        },
        expected: "access_denied",
      },
      {
        name: "fallback OAuth error",
        input: {
          oauthError: "server_error",
          errorSubcode: null,
          aadstsCode: null,
        },
        expected: "oauth_error",
      },
    ])("maps $name", ({ input, expected }) => {
      expect(mapCalendarOAuthError(input)).toBe(expected);
    });
  });

  describe("getSafeOAuthErrorDescription", () => {
    it.each([
      {
        name: "AADSTS code is present",
        description: "AADSTS65004: User declined to consent to access the app.",
        expected: "Microsoft error AADSTS65004.",
      },
      {
        name: "no AADSTS code is present",
        description: "Something else",
        expected: null,
      },
    ])("returns safe description when $name", ({ description, expected }) => {
      expect(getSafeOAuthErrorDescription(description)).toBe(expected);
    });
  });

  describe("getCalendarRedirectPath", () => {
    it.each([
      {
        name: "no return path",
        returnPath: undefined,
        expected: "/acc_123/calendars",
      },
      {
        name: "same-account onboarding return path",
        returnPath: encodeURIComponent("/acc_123/onboarding-brief?step=2"),
        expected: "/acc_123/onboarding-brief?step=2",
      },
      {
        name: "different account return path",
        returnPath: encodeURIComponent("/acc_456/briefs"),
        expected: "/acc_123/calendars",
      },
      {
        name: "return path that normalizes into a different account",
        returnPath: encodeURIComponent("/acc_123/../acc_456/briefs"),
        expected: "/acc_123/calendars",
      },
      {
        name: "external return path",
        returnPath: encodeURIComponent("https://example.com/briefs"),
        expected: "/acc_123/calendars",
      },
      {
        name: "malformed encoded value",
        returnPath: "%E0%A4%A",
        expected: "/acc_123/calendars",
      },
      {
        name: "control-character redirect bypass attempt",
        returnPath: encodeURIComponent("/\t/r3d.fi"),
        expected: "/acc_123/calendars",
      },
      {
        name: "overlapping account ID prefix",
        returnPath: encodeURIComponent("/acc_1234/briefs"),
        expected: "/acc_123/calendars",
      },
    ])("returns expected path for $name", ({ returnPath, expected }) => {
      expect(getCalendarRedirectPath("acc_123", returnPath)).toBe(expected);
    });
  });
});
