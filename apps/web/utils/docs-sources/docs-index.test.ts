import { describe, expect, it } from "vitest";
import {
  type DocsIndexEntry,
  parseLlmsTxt,
  parseSitemap,
  searchDocsIndex,
} from "./docs-index";

const sources = ["https://example.com/docs"];

describe("parseLlmsTxt", () => {
  it("parses a long hostile line in linear time", () => {
    const started = performance.now();
    parseLlmsTxt("[".repeat(200_000), "https://example.com/llms.txt", [
      "https://example.com",
    ]);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("extracts in-scope links with titles and descriptions", () => {
    const text = `# Example

> Docs for Example.

## Guides

- [Quickstart](https://example.com/docs/quickstart.md): Set up in five minutes
- [Webhooks](/docs/webhooks)
- [Blog post](https://example.com/blog/launch): Not docs
- [Elsewhere](https://other.com/docs/page)
- [Quickstart again](https://example.com/docs/quickstart.md#top)
`;

    expect(
      parseLlmsTxt(text, "https://example.com/docs/llms.txt", sources),
    ).toEqual([
      {
        title: "Quickstart",
        url: "https://example.com/docs/quickstart.md",
        description: "Set up in five minutes",
      },
      { title: "Webhooks", url: "https://example.com/docs/webhooks" },
    ]);
  });
});

describe("parseSitemap", () => {
  it("returns in-scope pages with titles from the path", () => {
    const xml = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://example.com/docs/api-keys</loc></url>
  <url><loc> https://example.com/docs/billing_faq.html </loc></url>
  <url><loc>https://example.com/pricing</loc></url>
</urlset>`;

    expect(
      parseSitemap(xml, "https://example.com/sitemap.xml", sources),
    ).toEqual({
      entries: [
        { title: "api keys", url: "https://example.com/docs/api-keys" },
        {
          title: "billing faq",
          url: "https://example.com/docs/billing_faq.html",
        },
      ],
      childSitemaps: [],
    });
  });

  it("returns child sitemaps from a sitemap index", () => {
    const xml = `<sitemapindex>
  <sitemap><loc>https://example.com/sitemap-0.xml</loc></sitemap>
</sitemapindex>`;

    expect(
      parseSitemap(xml, "https://example.com/sitemap.xml", sources),
    ).toEqual({
      entries: [],
      childSitemaps: ["https://example.com/sitemap-0.xml"],
    });
  });
});

describe("searchDocsIndex", () => {
  const entries: DocsIndexEntry[] = Array.from({ length: 40 }, (_, index) => ({
    title: `Page ${index}`,
    url: `https://example.com/docs/page-${index}`,
  }));
  entries.push(
    {
      title: "Webhook signatures",
      url: "https://example.com/docs/security/verify",
    },
    {
      title: "Events",
      url: "https://example.com/docs/webhook-events",
      description: "Webhook payload reference",
    },
  );

  it("ranks title matches above path and description matches", () => {
    const results = searchDocsIndex(entries, ["verify webhook signatures"]);
    expect(results.map((entry) => entry.title)).toEqual([
      "Webhook signatures",
      "Events",
    ]);
  });

  it("finds pages that match any of several phrasings", () => {
    const results = searchDocsIndex(entries, ["callback", "payload"]);
    expect(results.map((entry) => entry.title)).toEqual(["Events"]);
  });

  it("returns small indexes whole", () => {
    const small = entries.slice(0, 5);
    expect(searchDocsIndex(small, ["anything"])).toEqual(small);
  });
});
