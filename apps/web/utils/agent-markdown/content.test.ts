import { describe, expect, it } from "vitest";
import {
  getHomepageMarkdown,
  getLlmsTxt,
  getMarkdownForPath,
  getNotFoundMarkdown,
} from "./content";

describe("agent markdown content", () => {
  const origin = "https://www.getinboxzero.com";

  it("includes when-to-use guidance and developer links in llms.txt", () => {
    const body = getLlmsTxt(origin);

    expect(body).toContain("## When to use this");
    expect(body).toContain("Auto-labeling and triaging");
    expect(body).toContain("https://docs.getinboxzero.com/");
    expect(body).toContain(`${origin}/api/v1/openapi`);
    expect(body).toContain("https://github.com/elie222/inbox-zero");
    expect(body).toContain("support@getinboxzero.com");
    expect(body).toContain("no public Inbox Zero product MCP server");
  });

  it("maps homepage and pricing paths", () => {
    expect(getMarkdownForPath("/", origin)).toContain("# Inbox Zero");
    expect(getMarkdownForPath("/pricing", origin)).toContain("Pricing");
    expect(getMarkdownForPath("/unknown", origin)).toBeNull();
  });

  it("builds a recoverable markdown 404", () => {
    const body = getNotFoundMarkdown(origin);
    expect(body).toContain("# Not Found");
    expect(body).toContain(`${origin}/llms.txt`);
    expect(body).toContain("https://docs.getinboxzero.com/");
    expect(body).toContain(`${origin}/sitemap.xml`);
  });

  it("points homepage markdown at llms.txt and docs", () => {
    const body = getHomepageMarkdown(origin);
    expect(body).toContain(`${origin}/llms.txt`);
    expect(body).toContain(
      "https://docs.getinboxzero.com/essentials/getting-started",
    );
  });
});
