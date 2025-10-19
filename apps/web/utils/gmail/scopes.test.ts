import { describe, it, expect } from "vitest";
import { BASIC_SCOPES, SCOPES } from "./scopes";

describe("Gmail Scopes", () => {
  describe("BASIC_SCOPES", () => {
    it("should only contain profile and email scopes", () => {
      expect(BASIC_SCOPES).toEqual([
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
      ]);
    });

    it("should not contain Gmail-specific scopes", () => {
      const gmailScopes = BASIC_SCOPES.filter((scope) =>
        scope.includes("gmail"),
      );
      expect(gmailScopes).toHaveLength(0);
    });

    it("should not contain calendar scopes", () => {
      const calendarScopes = BASIC_SCOPES.filter((scope) =>
        scope.includes("calendar"),
      );
      expect(calendarScopes).toHaveLength(0);
    });
  });

  describe("SCOPES", () => {
    it("should contain basic scopes", () => {
      expect(SCOPES).toContain(
        "https://www.googleapis.com/auth/userinfo.profile",
      );
      expect(SCOPES).toContain(
        "https://www.googleapis.com/auth/userinfo.email",
      );
    });

    it("should contain Gmail-specific scopes", () => {
      expect(SCOPES).toContain("https://www.googleapis.com/auth/gmail.modify");
      expect(SCOPES).toContain(
        "https://www.googleapis.com/auth/gmail.settings.basic",
      );
    });

    it("should have more scopes than BASIC_SCOPES", () => {
      expect(SCOPES.length).toBeGreaterThan(BASIC_SCOPES.length);
    });
  });

  describe("Scope separation", () => {
    it("should have no overlap between basic and Gmail-specific scopes", () => {
      const basicScopes = new Set(BASIC_SCOPES);
      const gmailScopes = SCOPES.filter((scope) => scope.includes("gmail"));

      const overlap = gmailScopes.filter((scope) => basicScopes.has(scope));
      expect(overlap).toHaveLength(0);
    });

    it("should have BASIC_SCOPES as subset of SCOPES", () => {
      const scopesSet = new Set(SCOPES);
      const allBasicScopesIncluded = BASIC_SCOPES.every((scope) =>
        scopesSet.has(scope),
      );
      expect(allBasicScopesIncluded).toBe(true);
    });
  });
});
