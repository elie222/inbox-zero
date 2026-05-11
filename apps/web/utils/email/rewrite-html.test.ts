import { describe, expect, it } from "vitest";
import { rewriteHtmlRemoteAssetUrls } from "./rewrite-html";

const proxyOptions = {
  proxyBaseUrl: "https://img.example.com/proxy",
  signingSecret: "test-signing-secret",
  ttlSeconds: 300,
  now: new Date("2026-04-02T10:00:00.000Z"),
};

describe("rewriteHtmlRemoteAssetUrls", () => {
  it("rewrites image attributes, srcset, and css asset URLs", async () => {
    const html = `
      <style>
        @font-face { src: url("https://fonts.example.com/font.woff2"); }
        .hero { background-image: url(https://cdn.example.com/hero.png); }
      </style>
      <table background="https://cdn.example.com/background.jpg">
        <tr>
          <td style="background-image:url('https://cdn.example.com/inline.png')">
            <img src="https://cdn.example.com/photo.png?x=1&amp;y=2" />
            <img srcset="https://cdn.example.com/photo.png 1x, https://cdn.example.com/photo@2x.png 2x" />
            <img src="cid:keep-inline" />
          </td>
        </tr>
      </table>
    `;

    const rewrittenHtml = await rewriteHtmlRemoteAssetUrls(html, proxyOptions);

    expect(rewrittenHtml).toContain("https://img.example.com/proxy?u=");
    expect(rewrittenHtml).toContain(
      encodeURIComponent("https://cdn.example.com/photo.png?x=1&y=2"),
    );
    expect(rewrittenHtml).toContain(
      encodeURIComponent("https://cdn.example.com/photo@2x.png"),
    );
    expect(rewrittenHtml).toContain(
      encodeURIComponent("https://cdn.example.com/inline.png"),
    );
    expect(rewrittenHtml).toContain(
      encodeURIComponent("https://fonts.example.com/font.woff2"),
    );
    expect(rewrittenHtml).toContain('src="cid:keep-inline"');
  });

  it("preserves html structure when nothing is proxyable", async () => {
    const html = '<img src="data:image/png;base64,abc123"><p>Hello</p>';

    await expect(rewriteHtmlRemoteAssetUrls(html, proxyOptions)).resolves.toBe(
      html,
    );
  });

  it("supports unsigned custom proxy URLs when no signing secret is configured", async () => {
    const html = '<img src="https://cdn.example.com/photo.png" />';

    const rewrittenHtml = await rewriteHtmlRemoteAssetUrls(html, {
      proxyBaseUrl: "https://proxy.example.com/image",
    });

    expect(rewrittenHtml).toContain(
      'src="https://proxy.example.com/image?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png"',
    );
    expect(rewrittenHtml).not.toContain("&amp;e=");
    expect(rewrittenHtml).not.toContain("&amp;s=");
  });

  it.each([
    {
      name: "data-src attributes",
      html: '<img data-src="https://cdn.example.com/photo.png" />',
    },
    {
      name: "attribute-like text content",
      html: '<p>src="https://cdn.example.com/photo.png"</p>',
    },
  ])("does not rewrite $name", async ({ html }) => {
    await expect(rewriteHtmlRemoteAssetUrls(html, proxyOptions)).resolves.toBe(
      html,
    );
  });

  it("decodes numeric HTML entities before rewriting asset URLs", async () => {
    const html = '<img src="https://cdn.example.com/photo.png?x=1&#38;y=2" />';

    const rewrittenHtml = await rewriteHtmlRemoteAssetUrls(html, proxyOptions);

    expect(rewrittenHtml).toContain(
      encodeURIComponent("https://cdn.example.com/photo.png?x=1&y=2"),
    );
  });

  it("rewrites remote SVG href attributes", async () => {
    const html = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <image href="https://cdn.example.com/photo.png" />
        <use xlink:href="https://cdn.example.com/sprite.svg#icon" />
      </svg>
    `;

    const rewrittenHtml = await rewriteHtmlRemoteAssetUrls(html, proxyOptions);

    expect(rewrittenHtml).toContain(
      encodeURIComponent("https://cdn.example.com/photo.png"),
    );
    expect(rewrittenHtml).toContain(
      encodeURIComponent("https://cdn.example.com/sprite.svg#icon"),
    );
  });

  it.each([
    {
      name: "url contains commas",
      html: '<img srcset="https://cdn.example.com/photo,name.png 1x, https://cdn.example.com/photo@2x.png 2x" />',
      expectedUrls: [
        "https://cdn.example.com/photo,name.png",
        "https://cdn.example.com/photo@2x.png",
      ],
    },
    {
      name: "compact candidates omit whitespace after commas",
      html: '<img srcset="https://cdn.example.com/photo.png 1x,https://cdn.example.com/photo@2x.png 2x" />',
      expectedUrls: [
        "https://cdn.example.com/photo.png",
        "https://cdn.example.com/photo@2x.png",
      ],
    },
    {
      name: "compact list contains relative urls",
      html: '<img srcset="https://cdn.example.com/photo.png 1x,photo@2x.png 2x,https://cdn.example.com/photo@3x.png 3x" />',
      expectedUrls: [
        "https://cdn.example.com/photo.png",
        "https://cdn.example.com/photo@3x.png",
      ],
    },
  ])("rewrites srcset when $name", async ({ html, expectedUrls }) => {
    const rewrittenHtml = await rewriteHtmlRemoteAssetUrls(html, proxyOptions);

    for (const expectedUrl of expectedUrls) {
      expect(rewrittenHtml).toContain(encodeURIComponent(expectedUrl));
    }
  });
});
