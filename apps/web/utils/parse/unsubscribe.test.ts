import { describe, it, expect } from "vitest";
import {
  containsUnsubscribeKeyword,
  containsUnsubscribeUrlPattern,
} from "./unsubscribe";

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

    it("is case insensitive - matches uppercase", () => {
      expect(containsUnsubscribeKeyword("UNSUBSCRIBE")).toBe(true);
    });

    it("is case insensitive - matches mixed case", () => {
      expect(containsUnsubscribeKeyword("Unsubscribe")).toBe(true);
    });

    it("is case insensitive - matches 'Email Preferences'", () => {
      expect(containsUnsubscribeKeyword("Email Preferences")).toBe(true);
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

describe("containsUnsubscribeUrlPattern", () => {
  describe("detects unsubscribe URL patterns", () => {
    it("detects 'unsubscribe' in URL", () => {
      expect(
        containsUnsubscribeUrlPattern(
          "https://example.com/unsubscribe?email=test",
        ),
      ).toBe(true);
    });

    it("detects 'unsub' in URL (short form)", () => {
      expect(
        containsUnsubscribeUrlPattern(
          "https://click.example.com/campaign/unsub-email/123",
        ),
      ).toBe(true);
    });

    it("detects 'opt-out' in URL", () => {
      expect(
        containsUnsubscribeUrlPattern("https://example.com/opt-out/user123"),
      ).toBe(true);
    });

    it("detects 'optout' in URL (no hyphen)", () => {
      expect(
        containsUnsubscribeUrlPattern(
          "https://example.com/email/optout?id=abc",
        ),
      ).toBe(true);
    });

    it("detects 'list-manage' in URL (Mailchimp style)", () => {
      expect(
        containsUnsubscribeUrlPattern(
          "https://list-manage.com/track/click?u=abc&id=123",
        ),
      ).toBe(true);
    });
  });

  describe("URL pattern matching behavior", () => {
    it("is case insensitive - matches UNSUB", () => {
      expect(
        containsUnsubscribeUrlPattern("https://example.com/UNSUB/email"),
      ).toBe(true);
    });

    it("matches pattern in query string", () => {
      expect(
        containsUnsubscribeUrlPattern(
          "https://example.com/email?action=unsubscribe",
        ),
      ).toBe(true);
    });

    it("matches pattern in path", () => {
      expect(
        containsUnsubscribeUrlPattern(
          "https://example.com/unsubscribe/confirm",
        ),
      ).toBe(true);
    });

    it("matches Portuguese email example (unsub-email)", () => {
      expect(
        containsUnsubscribeUrlPattern(
          "https://click.lindtbrasil.com/campaign/unsub-email/MTM",
        ),
      ).toBe(true);
    });
  });

  describe("returns false for non-matching URLs", () => {
    it("returns false for empty string", () => {
      expect(containsUnsubscribeUrlPattern("")).toBe(false);
    });

    it("returns false for regular URLs", () => {
      expect(containsUnsubscribeUrlPattern("https://example.com/about")).toBe(
        false,
      );
    });

    it("returns false for subscribe URLs (not unsubscribe)", () => {
      expect(
        containsUnsubscribeUrlPattern("https://example.com/subscribe"),
      ).toBe(false);
    });

    it("returns false for URLs with 'sub' but not 'unsub'", () => {
      expect(
        containsUnsubscribeUrlPattern("https://example.com/submit-form"),
      ).toBe(false);
    });
  });
});
