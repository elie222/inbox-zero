/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "https://app.example.com",
    NEXT_PUBLIC_IMAGE_PROXY_BASE_URL: "https://img.example.com/proxy",
    NEXT_PUBLIC_IMAGE_PROXY_USE_APP_ROUTE: true,
  },
}));

import {
  getPreparedEmailHtml,
  needsImageProxy,
  prepareEmailImages,
  prepareSanitizedEmailHtml,
  sanitizeEmailHtml,
} from "./prepare-html.client";

describe("sanitizeEmailHtml", () => {
  it("wraps and sanitizes email fragments as complete documents", () => {
    const sanitized = sanitizeEmailHtml(
      "<div onclick=\"alert('unsafe')\">Readable content</div>",
    );
    const parsedDocument = new DOMParser().parseFromString(
      sanitized,
      "text/html",
    );

    expect(sanitized).toMatch(/^<!doctype html><html><head><\/head><body>/i);
    expect(parsedDocument.body.innerHTML).toBe("<div>Readable content</div>");
  });

  it("preserves document-level styles used by email content", () => {
    const sanitized = sanitizeEmailHtml(`
      <!doctype html>
      <html lang="en">
        <head><style>p { margin: 0; }</style></head>
        <body style="background: #222; color: #eee">
          <div>Readable content</div>
        </body>
      </html>
    `);

    const parsedDocument = new DOMParser().parseFromString(
      sanitized,
      "text/html",
    );

    expect(sanitized).toMatch(/^<!doctype html>/i);
    expect(parsedDocument.body.getAttribute("style")).toBe(
      "background: #222; color: #eee",
    );
    expect(parsedDocument.head.querySelector("style")?.textContent).toContain(
      "p { margin: 0; }",
    );
  });

  it("removes executable content from complete email documents", () => {
    const sanitized = sanitizeEmailHtml(`
      <html>
        <body onload="alert('unsafe')">
          <script>alert("unsafe")</script>
          <img src="https://example.com/image.png" onerror="alert('unsafe')">
        </body>
      </html>
    `);

    const parsedDocument = new DOMParser().parseFromString(
      sanitized,
      "text/html",
    );

    expect(parsedDocument.querySelector("script")).toBeNull();
    expect(parsedDocument.body.hasAttribute("onload")).toBe(false);
    expect(parsedDocument.querySelector("img")?.hasAttribute("onerror")).toBe(
      false,
    );
  });

  it("strips sent-message open pixels so viewing mail does not count as opened", () => {
    const sanitized = sanitizeEmailHtml(
      '<p>Hi</p><img src="https://app.example.com/t/abcdefghijklmnopqrstuvwxyz012345" width="1" height="1" alt="">',
    );

    expect(sanitized).not.toContain("/t/abcdefghijklmnopqrstuvwxyz012345");
    expect(sanitized).toContain("<p>Hi</p>");
  });
});

describe("preparing html for the image proxy", () => {
  // Only remote assets need the proxy, so everything else renders at once
  // instead of waiting on a round trip to the server.
  it.each([
    ["plain markup", "<p>Thanks, see you then.</p>"],
    ["links", '<p>Read <a href="https://example.com/post">the post</a>.</p>'],
    [
      "a signature link",
      '<p>Hi</p><p>Sent with <a href="https://www.getinboxzero.com">Inbox Zero</a></p>',
    ],
    ["inline images", '<img src="cid:logo@example.com" alt="Logo">'],
    ["local styles", "<style>p { color: red; }</style><p>Hi</p>"],
    [
      "an inline-image srcset",
      '<img srcset="cid:a@example.com 1x, cid:b@example.com 2x">',
    ],
  ])("shows %s without the proxy", async (_case, html) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const sourceHtml = sanitizeEmailHtml(html);
    const messageId = `local-${_case}`;

    expect(needsImageProxy(sourceHtml)).toBe(false);
    await expect(
      prepareSanitizedEmailHtml({ messageId, sourceHtml }),
    ).resolves.toBe(sourceHtml);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it.each([
    ["an image", '<img src="https://tracker.example.com/pixel.png">'],
    ["a protocol-relative image", '<img src="//cdn.example.com/a.png">'],
    [
      "a responsive image",
      '<img srcset="https://cdn.example.com/a.png 1x, https://cdn.example.com/b.png 2x">',
    ],
    [
      "an inline background",
      '<div style="background-image: url(https://cdn.example.com/bg.png)">Hi</div>',
    ],
    [
      "a stylesheet background",
      "<style>.hero { background: url('https://cdn.example.com/bg.png'); }</style><div class=\"hero\">Hi</div>",
    ],
    ["a backslash image", '<img src="\\\\tracker.example/p.png">'],
    ["an image with a tab", '<img src="/&#9;/tracker.example/p.png">'],
    ["a relative image", '<img src="pixel.png">'],
    [
      "a css-escaped background",
      "<style>.a { background: url(\\2f\\2ftracker.example/p.png); }</style>",
    ],
    ["a css import", '<style>@import "https://tracker.example/a.css";</style>'],
    [
      "an escaped inline style",
      '<div style="background: \\75 rl(//tracker.example/p.png)">Hi</div>',
    ],
    [
      "a remote candidate after an inline image",
      '<img srcset="cid:a@example.com 1x, https://tracker.example/p.png 2x">',
    ],
    [
      "a table background",
      '<table background="https://cdn.example.com/bg.png"><tr><td>Hi</td></tr></table>',
    ],
  ])("waits for the proxy before showing %s", async (_case, html) => {
    const proxied = "<p>proxied</p>";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ html: proxied }));
    const sourceHtml = sanitizeEmailHtml(html);
    const messageId = `remote-${_case}`;

    expect(needsImageProxy(sourceHtml)).toBe(true);
    expect(getPreparedEmailHtml({ messageId, sourceHtml })).toBeUndefined();
    await expect(
      prepareSanitizedEmailHtml({ messageId, sourceHtml }),
    ).resolves.toBe(proxied);
    expect(fetchSpy).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });
});

describe("preparing remote images when the proxy fails", () => {
  it.each([
    [
      "answers with an error",
      () => Promise.resolve(new Response(null, { status: 502 })),
    ],
    ["cannot be reached", () => Promise.reject(new TypeError("fetch failed"))],
  ])("keeps remote images blocked when the proxy %s", async (_case, reply) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(reply);
    const sourceHtml = sanitizeEmailHtml(
      '<p>Hi</p><img src="https://tracker.example/p.png">',
    );

    await expect(
      prepareEmailImages({ messageId: `failed-${_case}`, sourceHtml }),
    ).resolves.toEqual({ html: sourceHtml, remoteImagesAllowed: false });
    fetchSpy.mockRestore();
  });
});
