import { describe, expect, it } from "vitest";
import {
  appendSentMessageOpenPixel,
  describeSentMessageOpen,
  isSameOriginSentMessageOpenRequest,
  isSentMessageOpenPixelUrl,
  isSentMessageOpenToken,
  sentMessageOpenPath,
  stripSentMessageOpenPixels,
} from "./sent-message-open";

const token = "abcdefghijklmnopqrstuvwxyz012345";
const pixelUrl = `https://app.example.com/t/${token}`;

describe("isSentMessageOpenToken", () => {
  it("accepts 32-character url-safe tokens", () => {
    expect(isSentMessageOpenToken(token)).toBe(true);
  });

  it("rejects short, long, or invalid tokens", () => {
    expect(isSentMessageOpenToken("short")).toBe(false);
    expect(isSentMessageOpenToken(`${token}extra`)).toBe(false);
    expect(isSentMessageOpenToken("abcdefghijklmnopqrstuvwxyz01234/")).toBe(
      false,
    );
  });
});

describe("isSentMessageOpenPixelUrl", () => {
  it("matches absolute and relative tracking URLs", () => {
    expect(isSentMessageOpenPixelUrl(pixelUrl)).toBe(true);
    expect(isSentMessageOpenPixelUrl(`/t/${token}`)).toBe(true);
  });

  it("ignores ordinary image URLs", () => {
    expect(isSentMessageOpenPixelUrl("https://cdn.example.com/photo.png")).toBe(
      false,
    );
    expect(isSentMessageOpenPixelUrl("https://app.example.com/t/nope")).toBe(
      false,
    );
    expect(isSentMessageOpenPixelUrl("not a url")).toBe(false);
  });
});

describe("appendSentMessageOpenPixel", () => {
  it("injects the pixel before the closing body tag", () => {
    const html = appendSentMessageOpenPixel(
      "<html><body><p>Hi</p></body></html>",
      pixelUrl,
    );
    expect(html).toContain(`src="${pixelUrl}"`);
    expect(html).toMatch(/<img[\s\S]*><\/body>/i);
  });

  it("appends to html fragments", () => {
    expect(appendSentMessageOpenPixel("<p>Hi</p>", pixelUrl)).toBe(
      `<p>Hi</p><img src="${pixelUrl}" width="1" height="1" alt="" style="display:none!important;width:1px;height:1px;border:0;outline:none" />`,
    );
  });
});

describe("stripSentMessageOpenPixels", () => {
  it("removes tracking pixels from displayed html", () => {
    const html = appendSentMessageOpenPixel("<p>Hi</p>", pixelUrl);
    expect(stripSentMessageOpenPixels(html)).toBe("<p>Hi</p>");
  });

  it("leaves other images in place", () => {
    const html = `<p>Hi</p><img src="https://cdn.example.com/photo.png" alt="Photo">`;
    expect(stripSentMessageOpenPixels(html)).toBe(html);
  });

  it("strips quoted and unquoted tracking pixels from reply html", () => {
    const html = [
      "<p>Thanks</p>",
      "<blockquote>",
      `<img width=1 height=1 src=${pixelUrl} alt="">`,
      "</blockquote>",
      `<img src="https://cdn.example.com/logo.png">`,
    ].join("");

    expect(stripSentMessageOpenPixels(html)).toBe(
      '<p>Thanks</p><blockquote></blockquote><img src="https://cdn.example.com/logo.png">',
    );
  });
});

describe("isSameOriginSentMessageOpenRequest", () => {
  it("ignores pixel loads from the mail client origin", () => {
    expect(
      isSameOriginSentMessageOpenRequest({
        requestUrl: pixelUrl,
        referer: "https://app.example.com/mail/sent",
      }),
    ).toBe(true);
  });

  it("counts opens from other origins and missing referers", () => {
    expect(
      isSameOriginSentMessageOpenRequest({
        requestUrl: pixelUrl,
        referer: "https://mail.example.com/",
      }),
    ).toBe(false);
    expect(
      isSameOriginSentMessageOpenRequest({
        requestUrl: pixelUrl,
        referer: null,
      }),
    ).toBe(false);
  });
});

describe("sentMessageOpenPath", () => {
  it("builds the public pixel path", () => {
    expect(sentMessageOpenPath(token)).toBe(`/t/${token}`);
  });
});

describe("describeSentMessageOpen", () => {
  const formatRelative = (date: Date) =>
    date.toISOString() === "2026-09-11T12:00:00.000Z" ? "2 hours ago" : "later";

  it("describes an unopened message", () => {
    expect(
      describeSentMessageOpen(
        { firstOpenedAt: null, lastOpenedAt: null, openCount: 0 },
        formatRelative,
      ),
    ).toEqual({ label: "Not opened", detail: "Not opened yet" });
  });

  it("describes a single open", () => {
    expect(
      describeSentMessageOpen(
        {
          firstOpenedAt: "2026-09-11T12:00:00.000Z",
          lastOpenedAt: "2026-09-11T12:00:00.000Z",
          openCount: 1,
        },
        formatRelative,
      ),
    ).toEqual({ label: "Opened", detail: "Opened 2 hours ago" });
  });

  it("describes repeated opens", () => {
    expect(
      describeSentMessageOpen(
        {
          firstOpenedAt: "2026-09-11T10:00:00.000Z",
          lastOpenedAt: "2026-09-11T12:00:00.000Z",
          openCount: 3,
        },
        formatRelative,
      ),
    ).toEqual({
      label: "Opened",
      detail: "Opened 3 times · Last opened 2 hours ago",
    });
  });
});
