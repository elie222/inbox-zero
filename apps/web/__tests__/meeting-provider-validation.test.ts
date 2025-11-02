import { describe, expect, test } from "vitest";
import {
  getAvailableProviders,
  validateProviderForAccount,
} from "@/utils/meetings/providers/types";

describe("Meeting Provider Validation", () => {
  describe("getAvailableProviders", () => {
    test("Google accounts can use Google Meet and Zoom", () => {
      const providers = getAvailableProviders("google");
      expect(providers).toEqual(["google-meet", "zoom"]);
    });

    test("Microsoft accounts can use Teams and Zoom", () => {
      const providers = getAvailableProviders("microsoft");
      expect(providers).toEqual(["teams", "zoom"]);
    });
  });

  describe("validateProviderForAccount", () => {
    test("null provider defaults to Google Meet for Google accounts", () => {
      const result = validateProviderForAccount(null, "google");
      expect(result).toEqual({
        valid: true,
        resolvedProvider: "google-meet",
        needsFallback: false,
      });
    });

    test("null provider defaults to Teams for Microsoft accounts", () => {
      const result = validateProviderForAccount(null, "microsoft");
      expect(result).toEqual({
        valid: true,
        resolvedProvider: "teams",
        needsFallback: false,
      });
    });

    test("Teams is valid for Microsoft accounts", () => {
      const result = validateProviderForAccount("teams", "microsoft");
      expect(result).toEqual({
        valid: true,
        resolvedProvider: "teams",
        needsFallback: false,
      });
    });

    test("Teams is NOT valid for Google accounts - falls back to Google Meet", () => {
      const result = validateProviderForAccount("teams", "google");
      expect(result).toEqual({
        valid: false,
        resolvedProvider: "google-meet",
        needsFallback: true,
      });
    });

    test("Google Meet is valid for Google accounts", () => {
      const result = validateProviderForAccount("google-meet", "google");
      expect(result).toEqual({
        valid: true,
        resolvedProvider: "google-meet",
        needsFallback: false,
      });
    });

    test("Google Meet is NOT valid for Microsoft accounts - falls back to Teams", () => {
      const result = validateProviderForAccount("google-meet", "microsoft");
      expect(result).toEqual({
        valid: false,
        resolvedProvider: "teams",
        needsFallback: true,
      });
    });

    test("Zoom requires fallback for Google accounts", () => {
      const result = validateProviderForAccount("zoom", "google");
      expect(result).toEqual({
        valid: false,
        resolvedProvider: "google-meet",
        needsFallback: true,
      });
    });

    test("Zoom requires fallback for Microsoft accounts", () => {
      const result = validateProviderForAccount("zoom", "microsoft");
      expect(result).toEqual({
        valid: false,
        resolvedProvider: "teams",
        needsFallback: true,
      });
    });

    test("'none' provider is valid for both account types", () => {
      const googleResult = validateProviderForAccount("none", "google");
      expect(googleResult).toEqual({
        valid: true,
        resolvedProvider: "none",
        needsFallback: false,
      });

      const microsoftResult = validateProviderForAccount("none", "microsoft");
      expect(microsoftResult).toEqual({
        valid: true,
        resolvedProvider: "none",
        needsFallback: false,
      });
    });
  });
});
