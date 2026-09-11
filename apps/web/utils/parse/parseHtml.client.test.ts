/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { findCtaLink } from "./parseHtml.client";

describe("findCtaLink", () => {
  it("returns the first CTA with a safe link", () => {
    expect(
      findCtaLink(
        '<p><a href="https://example.com/message">view message</a></p>',
      ),
    ).toEqual({
      ctaText: "View message",
      ctaLink: "https://example.com/message",
    });
  });

  it("normalizes links without a protocol", () => {
    expect(findCtaLink('<a href="example.com/reply">reply</a>')).toEqual({
      ctaText: "Reply",
      ctaLink: "https://example.com/reply",
    });
  });

  it("skips unsafe CTA links", () => {
    expect(
      findCtaLink(
        '<a href="javascript:alert(1)">view message</a><a href="https://example.com/reply">reply</a>',
      ),
    ).toEqual({
      ctaText: "Reply",
      ctaLink: "https://example.com/reply",
    });
  });
});
