import { expect } from "vitest";

export function expectInert(html: string) {
  const lower = html.toLowerCase();
  expect(lower).not.toMatch(
    /<(?:script|svg|math|iframe|object|embed|form|input|button|meta|base|link|style|noscript|template)\b/u,
  );
  expect(lower).not.toMatch(/\son[a-z]+=/u);
  expect(lower).not.toContain("javascript:");
  expect(lower).not.toContain("vbscript:");
  expect(lower).not.toContain("data:text");
  expect(lower).not.toContain("data:image/svg");
  expect(lower).not.toContain("url(");
  expect(lower).not.toContain("u\\72l(");
  expect(lower).not.toContain("expression(");
  expect(lower).not.toContain("srcset");
  expect(lower).not.toContain("background=");
  expect(lower).not.toContain("position:");
  expect(lower).not.toMatch(/\sid=|\sclass=/u);
  expect(lower).not.toContain('target="_self"');
  expect(lower).not.toContain('src="x"');
}
