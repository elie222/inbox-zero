/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { EMAIL_DOCUMENT_MARKER, buildMailHtmlDocument } from "./MailBody";
import { sanitizeMailHtml } from "./sanitize-html";

describe("sanitizeMailHtml", () => {
  it("removes executable content from complete email documents", () => {
    const sanitized = sanitizeMailHtml(`
      <html>
        <body onload="alert('unsafe')">
          <script>alert("unsafe")</script>
          <img src="https://example.com/image.png" onerror="alert('unsafe')">
          <a href="javascript:alert('unsafe')">bad link</a>
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
    expect(parsedDocument.querySelector("a")?.getAttribute("href")).toBeNull();
  });

  it("drops tracking pixels so they are never requested or drawn broken", () => {
    const sanitized = sanitizeMailHtml(`
      <html>
        <body>
          <p>Thanks for signing up.</p>
          <img src="https://track.example.com/open.gif" width="1" height="1" alt="tracker">
          <img src="https://track.example.com/o.gif" style="width:1px;height:1px">
          <img src="https://track.example.com/zero.gif" width="0" height="0">
        </body>
      </html>
    `);
    const parsedDocument = new DOMParser().parseFromString(
      sanitized,
      "text/html",
    );

    expect(parsedDocument.querySelectorAll("img")).toHaveLength(0);
    expect(parsedDocument.body.textContent).toContain("Thanks for signing up.");
  });

  it("keeps spacer and content images that are only thin in one dimension", () => {
    const sanitized = sanitizeMailHtml(`
      <img src="https://cdn.example.com/spacer.gif" width="1" height="24">
      <img src="https://cdn.example.com/divider.png" width="600" height="1">
      <img src="https://cdn.example.com/logo.png" width="120" height="40">
      <img src="https://cdn.example.com/hero.png">
    `);
    const parsedDocument = new DOMParser().parseFromString(
      sanitized,
      "text/html",
    );

    expect(
      Array.from(parsedDocument.querySelectorAll("img")).map((image) =>
        image.getAttribute("src"),
      ),
    ).toEqual([
      "https://cdn.example.com/spacer.gif",
      "https://cdn.example.com/divider.png",
      "https://cdn.example.com/logo.png",
      "https://cdn.example.com/hero.png",
    ]);
  });

  it("builds the iframe document through DOM nodes instead of string wrappers", () => {
    const sanitized = sanitizeMailHtml(`
      <section data-testid="message">
        <p>Readable <strong>content</strong></p>
      </section>
    `);
    const document = buildMailHtmlDocument({
      html: sanitized,
      isDarkMode: true,
      imageProxyBaseUrl: null,
      imageProxyOrigin: null,
      documentKey: "fragment-document",
      allowRemoteImages: false,
    });
    const parsedDocument = new DOMParser().parseFromString(
      document,
      "text/html",
    );

    expect(
      parsedDocument
        .querySelector(`meta[name="${EMAIL_DOCUMENT_MARKER}"]`)
        ?.getAttribute("content"),
    ).toBe("fragment-document");
    expect(parsedDocument.documentElement.classList.contains("dark")).toBe(
      true,
    );
    expect(parsedDocument.body.classList.contains("dark")).toBe(true);
    expect(parsedDocument.body.textContent).toContain("Readable content");
    expect(parsedDocument.body.querySelector("section")?.textContent).toContain(
      "Readable content",
    );
    expect(parsedDocument.querySelectorAll("body")).toHaveLength(1);
  });

  it("neutralizes authored dark-mode CSS inside parsed style elements", () => {
    const sanitized = sanitizeMailHtml(`
      <html>
        <head>
          <style>
            @media (prefers-color-scheme: dark) { body { color: white; } }
            @media (prefers-color-scheme: light) { body { color: black; } }
          </style>
        </head>
        <body bgcolor="#ffffff">Styled content</body>
      </html>
    `);
    const document = buildMailHtmlDocument({
      html: sanitized,
      isDarkMode: false,
      imageProxyBaseUrl: null,
      imageProxyOrigin: null,
      documentKey: "styled-document",
      allowRemoteImages: false,
    });
    const parsedDocument = new DOMParser().parseFromString(
      document,
      "text/html",
    );
    const authoredStyle = Array.from(parsedDocument.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .find((style) => style.includes("inbox-zero-authored"));

    expect(authoredStyle).toContain(
      "prefers-color-scheme: inbox-zero-authored",
    );
    expect(authoredStyle).not.toContain("prefers-color-scheme: dark");
    expect(authoredStyle).toContain("prefers-color-scheme: light");
    expect(parsedDocument.body.textContent).toContain("Styled content");
  });

  it("keeps sanitized iframe documents inert under the shared body CSP", () => {
    const sanitized = sanitizeMailHtml(`
      <div onclick="alert('unsafe')">Readable content</div>
      <script>alert("unsafe")</script>
    `);
    const document = buildMailHtmlDocument({
      html: sanitized,
      isDarkMode: false,
      imageProxyBaseUrl: null,
      imageProxyOrigin: null,
      documentKey: "test-document",
      allowRemoteImages: false,
    });
    const parsedDocument = new DOMParser().parseFromString(
      document,
      "text/html",
    );
    const csp = parsedDocument.querySelector(
      'meta[http-equiv="Content-Security-Policy"]',
    );

    expect(parsedDocument.querySelector("script")).toBeNull();
    expect(parsedDocument.querySelector("div")?.hasAttribute("onclick")).toBe(
      false,
    );
    expect(csp?.getAttribute("content")).toContain("script-src 'none'");
    expect(csp?.getAttribute("content")).toContain("img-src data:");
    expect(csp?.getAttribute("content")).not.toContain("https:");
  });

  it("links bare URLs and addresses in html bodies", () => {
    const sanitized = sanitizeMailHtml(
      "<p>Via the settings: example.com/settings or <b>support@example.com</b>.</p>",
    );
    const parsedDocument = new DOMParser().parseFromString(
      sanitized,
      "text/html",
    );
    const links = [...parsedDocument.querySelectorAll("a")].map((link) => [
      link.textContent,
      link.getAttribute("href"),
    ]);

    expect(links).toEqual([
      ["example.com/settings", "http://example.com/settings"],
      ["support@example.com", "mailto:support@example.com"],
    ]);
    expect(parsedDocument.body.textContent).toBe(
      "Via the settings: example.com/settings or support@example.com.",
    );
  });

  it("leaves existing links, code, and styles as written", () => {
    const sanitized = sanitizeMailHtml(`
      <style>a { color: red } /* see example.com/theme */</style>
      <a href="https://example.com/track?id=1">example.com/docs</a>
      <code>curl https://api.example.com/v1</code>
      <pre>open example.com/logs</pre>
      <p>Version 2.4.9 of report.final ships today in backup.zip.</p>
    `);
    const parsedDocument = new DOMParser().parseFromString(
      sanitized,
      "text/html",
    );
    const links = [...parsedDocument.querySelectorAll("a")];

    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe(
      "https://example.com/track?id=1",
    );
    expect(parsedDocument.querySelector("style")?.textContent).toContain(
      "example.com/theme",
    );
  });
});
