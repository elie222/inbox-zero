import { describe, it, expect } from "vitest";
import { containsUnsubscribeKeyword } from "./unsubscribe";

describe("containsUnsubscribeKeyword", () => {
  describe("detects unsubscribe keywords", () => {
    it("detects 'unsubscribe'", () => {
      expect(containsUnsubscribeKeyword("Click to unsubscribe")).toBe(true);
    });

    it("detects 'email preferences'", () => {
      expect(
        containsUnsubscribeKeyword("Manage your email preferences here"),
      ).toBe(true);
    });

    it("detects 'email settings'", () => {
      expect(containsUnsubscribeKeyword("Update email settings")).toBe(true);
    });

    it("detects 'email options'", () => {
      expect(containsUnsubscribeKeyword("Change email options")).toBe(true);
    });

    it("detects 'notification preferences'", () => {
      expect(containsUnsubscribeKeyword("Edit notification preferences")).toBe(
        true,
      );
    });
  });

  describe("keyword matching behavior", () => {
    it("matches keyword at start of text", () => {
      expect(containsUnsubscribeKeyword("unsubscribe from this list")).toBe(
        true,
      );
    });

    it("matches keyword at end of text", () => {
      expect(containsUnsubscribeKeyword("Click here to unsubscribe")).toBe(
        true,
      );
    });

    it("matches keyword in middle of text", () => {
      expect(
        containsUnsubscribeKeyword("You can unsubscribe at any time"),
      ).toBe(true);
    });

    it("matches keyword as part of longer word", () => {
      // This tests that includes() matches substrings
      expect(containsUnsubscribeKeyword("unsubscribed")).toBe(true);
    });

    it("is case sensitive - does not match uppercase", () => {
      expect(containsUnsubscribeKeyword("UNSUBSCRIBE")).toBe(false);
    });

    it("is case sensitive - does not match mixed case", () => {
      expect(containsUnsubscribeKeyword("Unsubscribe")).toBe(false);
    });
  });

  describe("returns false for non-matching text", () => {
    it("returns false for empty string", () => {
      expect(containsUnsubscribeKeyword("")).toBe(false);
    });

    it("returns false for regular text", () => {
      expect(containsUnsubscribeKeyword("Hello, how are you?")).toBe(false);
    });

    it("returns false for similar but different text", () => {
      expect(containsUnsubscribeKeyword("subscribe to our newsletter")).toBe(
        false,
      );
    });

    it("returns false for partial keyword match", () => {
      expect(containsUnsubscribeKeyword("email prefer")).toBe(false);
    });

    it("returns false for keywords with typos", () => {
      expect(containsUnsubscribeKeyword("unsubscibe")).toBe(false);
    });
  });
});
