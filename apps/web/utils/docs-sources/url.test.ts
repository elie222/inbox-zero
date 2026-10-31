import { describe, expect, it } from "vitest";
import { isUrlInDocsSources, normalizeDocsSourceUrl } from "./url";

describe("normalizeDocsSourceUrl", () => {
  it.each([
    ["https://docs.example.com", "https://docs.example.com"],
    ["https://docs.example.com/", "https://docs.example.com"],
    ["docs.example.com", "https://docs.example.com"],
    ["https://Example.com/Docs/?q=1#intro", "https://example.com/Docs"],
    ["https://example.com:443/docs//", "https://example.com/docs"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeDocsSourceUrl(input)).toBe(expected);
  });

  it.each([
    "http://docs.example.com",
    "ftp://docs.example.com",
    "https://user:pass@docs.example.com",
    "https://localhost/docs",
    "https://10.0.0.1",
    "https://169.254.169.254",
    "https://example.com/docs%2F..%2Fadmin",
    "not a url at all",
  ])("rejects %s", (input) => {
    expect(normalizeDocsSourceUrl(input)).toBeNull();
  });
});

describe("isUrlInDocsSources", () => {
  const sources = ["https://example.com/docs", "https://help.example.org"];

  it.each([
    "https://example.com/docs",
    "https://example.com/docs/",
    "https://example.com/docs/getting-started?tab=1",
    "https://help.example.org/anything/at/all",
  ])("allows %s", (url) => {
    expect(isUrlInDocsSources(url, sources)).toBe(true);
  });

  it.each([
    ["non-https", "http://example.com/docs/intro"],
    ["outside prefix", "https://example.com/blog"],
    ["prefix lookalike", "https://example.com/docs-internal"],
    ["dot segments", "https://example.com/docs/../admin"],
    ["encoded separator", "https://example.com/docs/..%2Fadmin"],
    ["subdomain", "https://evil.help.example.org/page"],
    ["suffix domain", "https://help.example.org.evil.com/page"],
    ["other port", "https://help.example.org:8443/page"],
    ["credentials", "https://user@help.example.org/page"],
    ["invalid", "::::"],
  ])("rejects %s", (_name, url) => {
    expect(isUrlInDocsSources(url, sources)).toBe(false);
  });
});
