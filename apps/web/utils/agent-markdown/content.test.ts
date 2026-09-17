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

  it("omits a live MCP connect URL while the server is disabled", () => {
    const body = getLlmsTxt(origin, branding);

    expect(body).toContain("## When to use this");
    expect(body).toContain("Auto-labeling and triaging");
    expect(body).toContain("https://docs.getinboxzero.com/");
    expect(body).toContain(`${origin}/api/v1/openapi`);
    expect(body).toContain("https://github.com/elie222/inbox-zero");
    expect(body).toContain("support@getinboxzero.com");
    expect(body).toContain("https://docs.getinboxzero.com/api-reference/mcp");
    expect(body).not.toContain(
      `connect the remote MCP server at ${origin}/mcp`,
    );
    expect(body).not.toContain("MCP_SERVER_ENABLED");
    expect(body).not.toContain("not generally available");
    expect(body).not.toContain("disabled on this deployment");
  });

  it("points assistants at MCP when the server is enabled", () => {
    const body = getLlmsTxt(origin, branding, true);

    expect(body).toContain(`connect the remote MCP server at ${origin}/mcp`);
    expect(body).toContain(
      `- MCP server (OAuth, Streamable HTTP): ${origin}/mcp`,
    );
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
