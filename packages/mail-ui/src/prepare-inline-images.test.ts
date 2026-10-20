/** @vitest-environment jsdom */

import { Blob } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMailHtmlDocument } from "./MailBody";
import { prepareInlineImages } from "./prepare-inline-images";
import { sanitizeMailHtml } from "./sanitize-html";

const attachment = {
  attachmentId: "attachment-1",
  filename: "logo.png",
  mimeType: "application/octet-stream",
  size: 8,
  inline: true,
  contentId: "<logo@example.test>",
};

const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]);

describe("local mail inline images", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads embedded bytes by authoritative content ID and permits them in the sandboxed document", async () => {
    const createObjectURL = vi.fn(
      (_blob: globalThis.Blob) => "blob:local-image",
    );
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = createObjectURL;
      },
    );
    const loadAttachment = vi.fn().mockResolvedValue(png);
    const result = await prepareInlineImages({
      html: sanitizeMailHtml(
        '<p>Example</p><img src="cid:LOGO%40example.test"><img src="https://example.test/remote.png">',
      ),
      attachments: [attachment],
      loadAttachment,
      signal: new AbortController().signal,
    });

    expect(loadAttachment).toHaveBeenCalledExactlyOnceWith("attachment-1");
    expect(createObjectURL.mock.calls[0][0].type).toBe("image/png");
    const document = new DOMParser().parseFromString(result.html, "text/html");
    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      "blob:local-image",
    );
    expect(result.objectUrls).toEqual(["blob:local-image"]);
    expect(document.querySelectorAll("img")[1].getAttribute("src")).toBe(
      "https://example.test/remote.png",
    );
    const srcDoc = buildMailHtmlDocument({
      html: result.html,
      isDarkMode: false,
      documentKey: "test",
      imageProxyBaseUrl: null,
      imageProxyOrigin: null,
    });
    expect(srcDoc).toContain("img-src data: blob:");
  });

  it.each([
    ["plain", "<p>Hello</p>"],
    [
      "designed",
      '<table style="font-family: Arial"><tr><td>Hi</td></tr></table>',
    ],
  ])("hides cid images that have not been swapped to blob URLs in %s emails", (_kind, body) => {
    const srcDoc = buildMailHtmlDocument({
      html: sanitizeMailHtml(
        `${body}<img src="cid:logo@example.test"><img src="CID:other@example.test"><img src="blob:local-image">`,
      ),
      isDarkMode: false,
      documentKey: "test",
      imageProxyBaseUrl: null,
      imageProxyOrigin: null,
    });
    document.open();
    document.write(srcDoc);
    document.close();
    const visibility = Array.from(document.querySelectorAll("img")).map(
      (image) => getComputedStyle(image).visibility,
    );

    expect(visibility).toEqual(["hidden", "hidden", "visible"]);
  });
  it("deduplicates repeated CIDs and leaves unresolved or unrelated images alone", async () => {
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = vi.fn(() => "blob:local-image");
      },
    );
    const loadAttachment = vi.fn().mockResolvedValue(png);
    const result = await prepareInlineImages({
      html: '<img src="cid:logo@example.test"><img src="cid:logo@example.test"><img src="cid:missing@example.test">',
      attachments: [
        attachment,
        {
          ...attachment,
          attachmentId: "unused",
          contentId: "unused@example.test",
        },
      ],
      loadAttachment,
      signal: new AbortController().signal,
    });
    expect(loadAttachment).toHaveBeenCalledExactlyOnceWith("attachment-1");
    expect(result.html.match(/blob:local-image/g)).toHaveLength(2);
    expect(result.html).toContain("cid:missing@example.test");
  });

  it("keeps the body usable when an attachment is missing or is not a raster image", async () => {
    for (const loadAttachment of [
      vi.fn().mockRejectedValue(new Error("not found")),
      vi
        .fn()
        .mockResolvedValue(new Blob(["<svg></svg>"], { type: "image/png" })),
    ]) {
      const html = '<p>Body</p><img src="cid:logo@example.test">';
      const result = await prepareInlineImages({
        html,
        attachments: [attachment],
        loadAttachment,
        signal: new AbortController().signal,
      });
      expect(result).toEqual({ html, objectUrls: [] });
    }
  });

  it("does not create URLs after a message is closed while loading", async () => {
    const controller = new AbortController();
    const createObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = createObjectURL;
      },
    );
    const result = await prepareInlineImages({
      html: '<img src="cid:logo@example.test">',
      attachments: [attachment],
      loadAttachment: async () => {
        controller.abort();
        return png as unknown as globalThis.Blob;
      },
      signal: controller.signal,
    });
    expect(result.objectUrls).toEqual([]);
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
