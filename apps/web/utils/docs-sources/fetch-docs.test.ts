import { beforeEach, describe, expect, it, vi } from "vitest";
import { safePublicFetch } from "@/utils/mcp/safe-fetch";
import { getDocsIndex, readDocsPage } from "./fetch-docs";

vi.mock("@/utils/mcp/safe-fetch", () => ({ safePublicFetch: vi.fn() }));
vi.mock("@/utils/redis/docs-cache", () => ({
  getCachedDocs: vi.fn().mockResolvedValue(null),
  setCachedDocs: vi.fn(),
}));

const sources = ["https://example.com/docs"];

describe("readDocsPage", () => {
  beforeEach(() => {
    vi.mocked(safePublicFetch).mockReset();
  });

  it("refuses URLs outside the sources without fetching", async () => {
    await expect(
      readDocsPage("https://example.com/admin", sources),
    ).rejects.toThrow("outside the documentation sites");
    expect(safePublicFetch).not.toHaveBeenCalled();
  });

  it("refuses a redirect that leaves the sources before requesting it", async () => {
    mockRoutes({
      "https://example.com/docs/old": redirect("https://evil.com/steal"),
    });

    await expect(
      readDocsPage("https://example.com/docs/old", sources),
    ).rejects.toThrow("redirected outside");
    expect(safePublicFetch).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect to the same host outside the prefix", async () => {
    mockRoutes({ "https://example.com/docs/old": redirect("/internal") });

    await expect(
      readDocsPage("https://example.com/docs/old", sources),
    ).rejects.toThrow("redirected outside");
  });

  it("follows in-scope redirects and returns main content with links", async () => {
    mockRoutes({
      "https://example.com/docs/old": redirect("/docs/new"),
      "https://example.com/docs/new": html(`<html><body>
        <nav><a href="/docs/nav-link">Nav</a></nav>
        <main><h1>Setup</h1><p>Install the CLI.</p>
          <a href="/docs/next">Next</a><a href="https://other.com/x">Out</a>
        </main></body></html>`),
    });

    const page = await readDocsPage("https://example.com/docs/old", sources);

    expect(page).toContain("URL: https://example.com/docs/new");
    expect(page).toContain("Install the CLI.");
    expect(page).toContain("https://example.com/docs/next");
    expect(page).not.toContain("other.com");
    expect(page).not.toContain("nav-link");
  });
});

describe("getDocsIndex", () => {
  beforeEach(() => {
    vi.mocked(safePublicFetch).mockReset();
  });

  it("falls back from the prefix llms.txt to the root one", async () => {
    mockRoutes({
      "https://example.com/llms.txt": text(
        "- [Setup](https://example.com/docs/setup): Install\n- [Blog](https://example.com/blog)",
      ),
    });

    await expect(getDocsIndex(sources)).resolves.toEqual([
      {
        title: "Setup",
        url: "https://example.com/docs/setup",
        description: "Install",
      },
    ]);
  });

  it("uses the sitemap when no llms.txt exists", async () => {
    mockRoutes({
      "https://example.com/sitemap.xml": text(
        "<sitemapindex><sitemap><loc>https://example.com/sitemap-0.xml</loc></sitemap></sitemapindex>",
      ),
      "https://example.com/sitemap-0.xml": text(
        "<urlset><url><loc>https://example.com/docs/billing</loc></url></urlset>",
      ),
    });

    await expect(getDocsIndex(sources)).resolves.toEqual([
      { title: "billing", url: "https://example.com/docs/billing" },
    ]);
  });
});

function mockRoutes(routes: Record<string, Response>) {
  vi.mocked(safePublicFetch).mockImplementation(
    async (url) =>
      routes[url]?.clone() ?? new Response("not found", { status: 404 }),
  );
}

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { location } });
}

function html(body: string) {
  return new Response(body, { headers: { "content-type": "text/html" } });
}

function text(body: string) {
  return new Response(body, { headers: { "content-type": "text/plain" } });
}
