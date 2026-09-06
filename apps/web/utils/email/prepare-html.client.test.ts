/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "https://app.example.com",
    NEXT_PUBLIC_IMAGE_PROXY_BASE_URL: "https://img.example.com/proxy",
    NEXT_PUBLIC_IMAGE_PROXY_USE_APP_ROUTE: true,
  },
}));

import { sanitizeEmailHtml } from "./prepare-html.client";

describe("sanitizeEmailHtml", () => {
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

    const document = new DOMParser().parseFromString(sanitized, "text/html");

    expect(document.body.getAttribute("style")).toBe(
      "background: #222; color: #eee",
    );
    expect(document.head.querySelector("style")?.textContent).toContain(
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

    const document = new DOMParser().parseFromString(sanitized, "text/html");

    expect(document.querySelector("script")).toBeNull();
    expect(document.body.hasAttribute("onload")).toBe(false);
    expect(document.querySelector("img")?.hasAttribute("onerror")).toBe(false);
  });
});
