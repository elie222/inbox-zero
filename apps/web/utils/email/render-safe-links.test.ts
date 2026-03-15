import { describe, expect, it } from "vitest";
import { renderEmailTextWithSafeLinks } from "./render-safe-links";

describe("renderEmailTextWithSafeLinks", () => {
  it("renders markdown links as sanitized anchors while preserving the label", () => {
    const result = renderEmailTextWithSafeLinks(
      "Use [the login page](https://example.com/login) to continue.",
    );

    expect(result).toContain(
      '<a href="https://example.com/login">the login page</a>',
    );
  });

  it("preserves safe html anchors but escapes other html", () => {
    const result = renderEmailTextWithSafeLinks(
      'Use <a href="https://example.com/login">the login page</a>.<div style="display:none">LEAKED SECRET DATA</div>',
    );

    expect(result).toContain(
      '<a href="https://example.com/login">the login page</a>',
    );
    expect(result).not.toContain('<div style="display:none">');
    expect(result).toContain("&lt;div");
  });

  it("does not render unsafe link protocols", () => {
    const result = renderEmailTextWithSafeLinks(
      'Open <a href="javascript:alert(1)">the portal</a>.',
    );

    expect(result).not.toContain('href="javascript:alert(1)"');
    expect(result).toContain(
      "Open &lt;a href=&quot;javascript:alert(1)&quot;&gt;the portal&lt;/a&gt;.",
    );
  });

  it("decodes html entities in anchor labels before escaping them", () => {
    const result = renderEmailTextWithSafeLinks(
      'Use <a href="https://example.com/login">Tom &amp; Jerry</a>.',
    );

    expect(result).toContain(
      '<a href="https://example.com/login">Tom &amp; Jerry</a>',
    );
    expect(result).not.toContain("&amp;amp;");
  });

  it("renders markdown links whose URLs contain parentheses", () => {
    const result = renderEmailTextWithSafeLinks(
      "Use [the docs](https://example.com/path_(1)) for details.",
    );

    expect(result).toContain(
      '<a href="https://example.com/path_(1)">the docs</a>',
    );
  });

  it("falls back to the destination when a link label is empty after sanitization", () => {
    const result = renderEmailTextWithSafeLinks(
      'Use <a href="mailto:help@example.com"><span></span></a> if needed.',
    );

    expect(result).toContain(
      '<a href="mailto:help@example.com">help@example.com</a>',
    );
  });

  it("preserves newlines as plain text until the provider formatter handles them", () => {
    const result = renderEmailTextWithSafeLinks("Line one\nLine two");

    expect(result).toBe("Line one\nLine two");
    expect(result).not.toContain("<br>");
  });
});
