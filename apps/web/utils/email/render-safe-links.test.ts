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

  it("shows visible destinations instead of hidden anchors when hidden links are disabled", () => {
    const result = renderEmailTextWithSafeLinks(
      "Use [the login page](https://example.com/login) or email [support](mailto:help@example.com).",
      { allowHiddenLinks: false },
    );

    expect(result).toContain(
      "Use https://example.com/login or email help@example.com.",
    );
    expect(result).not.toContain("<a href=");
  });

  it.each([
    {
      name: "label contains a different domain",
      text: "Use [getinboxzero.com](https://attacker.tld/login) to continue.",
      expected:
        '<a href="https://attacker.tld/login">getinboxzero.com - attacker.tld</a>',
    },
    {
      name: "label contains a different subdomain",
      text: "Use [login.example.com](https://evil.example.com/login) to continue.",
      expected:
        '<a href="https://evil.example.com/login">login.example.com - evil.example.com</a>',
    },
    {
      name: "URL label contains a different path",
      text: "Use [https://example.com/login](https://example.com/phish) to continue.",
      expected:
        '<a href="https://example.com/phish">https://example.com/login - https://example.com/phish</a>',
    },
    {
      name: "scheme-less URL label contains a different path",
      text: "Use [example.com/login](https://example.com/phish) to continue.",
      expected:
        '<a href="https://example.com/phish">example.com/login - https://example.com/phish</a>',
    },
    {
      name: "scheme-less label specifies a different port",
      text: "Use [example.com:8080](http://example.com:9090/path) to continue.",
      expected:
        '<a href="http://example.com:9090/path">example.com:8080 - http://example.com:9090/path</a>',
    },
    {
      name: "scheme-less label specifies a fragment",
      text: "Use [example.com#section](https://example.com/other) to continue.",
      expected:
        '<a href="https://example.com/other">example.com#section - https://example.com/other</a>',
    },
    {
      name: "URL label explicitly includes the root slash",
      text: "Use [https://example.com/](https://example.com/phish) to continue.",
      expected:
        '<a href="https://example.com/phish">https://example.com/ - https://example.com/phish</a>',
    },
  ])("discloses the full destination when $name", ({ text, expected }) => {
    expect(renderEmailTextWithSafeLinks(text)).toContain(expected);
  });

  it("treats scheme-less URL labels as protocol-agnostic matches", () => {
    const result = renderEmailTextWithSafeLinks(
      "Use [example.com/login](http://example.com/login) to continue.",
    );

    expect(result).toContain(
      '<a href="http://example.com/login">example.com/login</a>',
    );
  });

  it("keeps bare URL labels unchanged when only the destination path differs", () => {
    const result = renderEmailTextWithSafeLinks(
      "Use [https://example.com](https://example.com/phish) to continue.",
    );

    expect(result).toContain(
      '<a href="https://example.com/phish">https://example.com</a>',
    );
  });

  it("treats www-only hostname differences as the same destination", () => {
    const result = renderEmailTextWithSafeLinks(
      "Use [www.example.com](https://example.com/login) to continue.",
    );

    expect(result).toContain(
      '<a href="https://example.com/login">www.example.com</a>',
    );
  });

  it("keeps generic labels unchanged when hidden links are enabled", () => {
    const result = renderEmailTextWithSafeLinks(
      "Use [click here](https://example.com/login) to continue.",
    );

    expect(result).toContain(
      '<a href="https://example.com/login">click here</a>',
    );
  });

  it("preserves newlines as plain text until the provider formatter handles them", () => {
    const result = renderEmailTextWithSafeLinks("Line one\nLine two");

    expect(result).toBe("Line one\nLine two");
    expect(result).not.toContain("<br>");
  });
});
