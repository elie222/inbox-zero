import { describe, expect, it } from "vitest";
import { renderEmailTextWithSafeLinks } from "./render-safe-links";

describe("renderEmailTextWithSafeLinks", () => {
  it("renders markdown links as sanitized anchors with the destination visible", () => {
    const result = renderEmailTextWithSafeLinks(
      "Use [the login page](https://example.com/login) to continue.",
    );

    expect(result).toContain(
      '<a href="https://example.com/login">the login page (example.com)</a>',
    );
  });

  it("preserves safe html anchors but escapes other html", () => {
    const result = renderEmailTextWithSafeLinks(
      'Use <a href="https://example.com/login">the login page</a>.<div style="display:none">LEAKED SECRET DATA</div>',
    );

    expect(result).toContain(
      '<a href="https://example.com/login">the login page (example.com)</a>',
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
});
