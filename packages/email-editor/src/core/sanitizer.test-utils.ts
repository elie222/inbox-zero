import { expect } from "vitest";
import { EMAIL_BODY_REMOVED_TAGS } from "./email-profile";

export function expectInert(html: string) {
  const lower = html.toLowerCase();
  for (const tag of EMAIL_BODY_REMOVED_TAGS) {
    expect(lower).not.toMatch(new RegExp(`<${tag}\\b`, "u"));
  }
  expect(lower).not.toMatch(/\son[a-z]+=/u);
  expect(lower).not.toContain("javascript:");
  expect(lower).not.toContain("vbscript:");
  expect(lower).not.toContain("data:");
  expect(lower).not.toContain("srcset");
  expect(lower).not.toContain("background=");
  expect(lower).not.toMatch(/\sid=|\sclass=/u);
  expect(lower).not.toContain('target="_self"');
  expect(lower).not.toContain('src="x"');
  // Styles must not reach the network or run code, however they are spelled.
  for (const [, style] of html.matchAll(/\sstyle="([^"]*)"/gu)) {
    expect(style).not.toMatch(/[\\<>]|\/\*/u);
    expect(style.toLowerCase()).not.toMatch(
      /url\(|expression\(|-moz-binding|position:/u,
    );
  }
}
