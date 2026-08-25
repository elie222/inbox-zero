import { beforeEach, describe, expect, it, vi } from "vitest";
import { getHomepageMarkdown, getLlmsTxt, getMarkdownForPath } from "./content";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("agent markdown content", () => {
  const origin = "https://www.getinboxzero.com";
  const branding = {
    brandName: "Inbox Zero",
    supportEmail: "support@getinboxzero.com",
  };

  it("includes when-to-use guidance and developer links in llms.txt", () => {
    const body = getLlmsTxt(origin, branding);

    expect(body).toContain("## When to use this");
    expect(body).toContain("Auto-labeling and triaging");
    expect(body).toContain("https://docs.getinboxzero.com/");
    expect(body).toContain(`${origin}/api/v1/openapi`);
    expect(body).toContain("https://github.com/elie222/inbox-zero");
    expect(body).toContain("support@getinboxzero.com");
    expect(body).toContain("no public product MCP server");
  });

  it("maps homepage and pricing paths", () => {
    expect(getMarkdownForPath("/", origin, branding)).toContain("# Inbox Zero");
    expect(getMarkdownForPath("/pricing", origin, branding)).toContain(
      "Pricing",
    );
    expect(getMarkdownForPath("/unknown", origin, branding)).toBeNull();
  });

  it("points homepage markdown at llms.txt and docs", () => {
    const body = getHomepageMarkdown(origin, branding);
    expect(body).toContain(`${origin}/llms.txt`);
    expect(body).toContain(
      "https://docs.getinboxzero.com/essentials/getting-started",
    );
  });

  it("uses deployment branding", () => {
    const body = getHomepageMarkdown(origin, {
      brandName: "Acme Mail",
      supportEmail: "help@example.com",
    });

    expect(body).toContain("# Acme Mail");
    expect(body).toContain("help@example.com");
    expect(body).not.toContain("support@getinboxzero.com");
  });
});
