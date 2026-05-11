import { describe, it, expect } from "vitest";
import {
  cleanUnsubscribeLink,
  containsUnsubscribeKeyword,
  containsUnsubscribeUrlPattern,
  getHttpUnsubscribeLink,
  getUserFacingUnsubscribeLink,
  parseListUnsubscribeHeader,
} from "./unsubscribe";

describe("containsUnsubscribeKeyword", () => {
  it.each([
    ["unsubscribe keyword", "Click to unsubscribe", true],
    ["email preferences keyword", "Manage your email preferences here", true],
    ["email settings keyword", "Update email settings", true],
    ["email options keyword", "Change email options", true],
    ["notification preferences keyword", "Edit notification preferences", true],
    ["keyword at start of text", "unsubscribe from this list", true],
    ["keyword at end of text", "Click here to unsubscribe", true],
    ["keyword in middle of text", "You can unsubscribe at any time", true],
    ["keyword as part of longer word", "unsubscribed", true],
    ["uppercase keyword", "UNSUBSCRIBE", true],
    ["mixed-case keyword", "Unsubscribe", true],
    ["mixed-case email preferences", "Email Preferences", true],
    ["empty string", "", false],
    ["regular text", "Hello, how are you?", false],
    ["similar but different text", "subscribe to our newsletter", false],
    ["partial keyword match", "email prefer", false],
    ["keyword with typo", "unsubscibe", false],
  ])("returns %s for %s", (_name, text, expected) => {
    expect(containsUnsubscribeKeyword(text)).toBe(expected);
  });
});

describe("containsUnsubscribeUrlPattern", () => {
  it.each([
    ["unsubscribe in URL", "https://example.com/unsubscribe?email=test", true],
    [
      "short unsub form",
      "https://click.example.com/campaign/unsub-email/123",
      true,
    ],
    ["opt-out URL", "https://example.com/opt-out/user123", true],
    ["optout URL", "https://example.com/email/optout?id=abc", true],
    [
      "Mailchimp-style list-manage URL",
      "https://list-manage.com/track/click?u=abc&id=123",
      true,
    ],
    ["case-insensitive UNSUB", "https://example.com/UNSUB/email", true],
    [
      "pattern in query string",
      "https://example.com/email?action=unsubscribe",
      true,
    ],
    ["pattern in path", "https://example.com/unsubscribe/confirm", true],
    [
      "Portuguese unsub-email example",
      "https://click.lindtbrasil.com/campaign/unsub-email/MTM",
      true,
    ],
    ["empty string", "", false],
    ["regular URL", "https://example.com/about", false],
    ["subscribe URL", "https://example.com/subscribe", false],
    ["sub without unsub", "https://example.com/submit-form", false],
  ])("returns %s for %s", (_name, url, expected) => {
    expect(containsUnsubscribeUrlPattern(url)).toBe(expected);
  });
});

describe("cleanUnsubscribeLink", () => {
  it.each([
    [
      "surrounding angle brackets",
      "<https://example.com/unsub>",
      "https://example.com/unsub",
    ],
    [
      "surrounding whitespace",
      "  https://example.com/unsub  ",
      "https://example.com/unsub",
    ],
    ["empty strings", "   ", undefined],
  ])("cleans %s", (_name, link, expected) => {
    expect(cleanUnsubscribeLink(link)).toBe(expected);
  });
});

describe("parseListUnsubscribeHeader", () => {
  it("parses multiple header values", () => {
    expect(
      parseListUnsubscribeHeader(
        "<mailto:unsubscribe@example.com>, <https://example.com/unsub?id=1>",
      ),
    ).toEqual([
      "mailto:unsubscribe@example.com",
      "https://example.com/unsub?id=1",
    ]);
  });

  it("returns empty array for missing values", () => {
    expect(parseListUnsubscribeHeader()).toEqual([]);
  });
});

describe("getHttpUnsubscribeLink", () => {
  it("prefers HTTP URLs from list-unsubscribe header", () => {
    expect(
      getHttpUnsubscribeLink({
        listUnsubscribeHeader:
          "<mailto:unsubscribe@example.com>, <https://example.com/unsub?id=1>",
        unsubscribeLink: "https://fallback.example.com/unsub",
      }),
    ).toBe("https://example.com/unsub?id=1");
  });

  it("falls back to unsubscribe link when header has no HTTP URL", () => {
    expect(
      getHttpUnsubscribeLink({
        listUnsubscribeHeader: "<mailto:unsubscribe@example.com>",
        unsubscribeLink: "https://fallback.example.com/unsub",
      }),
    ).toBe("https://fallback.example.com/unsub");
  });

  it("returns undefined when no HTTP URL is present", () => {
    expect(
      getHttpUnsubscribeLink({
        listUnsubscribeHeader: "<mailto:unsubscribe@example.com>",
        unsubscribeLink: "mailto:alt@example.com",
      }),
    ).toBeUndefined();
  });

  it("finds HTTP URLs in stored mixed unsubscribe data", () => {
    expect(
      getHttpUnsubscribeLink({
        unsubscribeLink:
          "<mailto:unsubscribe@example.com>, <https://example.com/unsub?id=1>",
      }),
    ).toBe("https://example.com/unsub?id=1");
  });
});

describe("getUserFacingUnsubscribeLink", () => {
  it("returns the first safe manual unsubscribe link from a mixed header", () => {
    expect(
      getUserFacingUnsubscribeLink({
        listUnsubscribeHeader:
          "<javascript:alert(1)>, <mailto:unsubscribe@example.com>, <https://example.com/unsub?id=1>",
      }),
    ).toBe("mailto:unsubscribe@example.com");
  });

  it("returns undefined when every unsubscribe link uses an unsafe scheme", () => {
    expect(
      getUserFacingUnsubscribeLink({
        unsubscribeLink: "javascript:alert(1)",
      }),
    ).toBeUndefined();
  });

  it("treats a direct unsubscribe URL with commas as a single link", () => {
    expect(
      getUserFacingUnsubscribeLink({
        unsubscribeLink:
          "https://example.com/unsub?tags=product-updates,weekly-digest",
      }),
    ).toBe("https://example.com/unsub?tags=product-updates,weekly-digest");
  });
});
