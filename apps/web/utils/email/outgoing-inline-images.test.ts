// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishOutgoingInlineImages } from "./outgoing-inline-images";
import {
  inlineImageCacheKey,
  retainInlineImages,
  storeLoadedInlineImage,
  withLoadedInlineImages,
} from "./inline-image-cache";

beforeEach(() => vi.useFakeTimers());

afterEach(async () => {
  await vi.runOnlyPendingTimersAsync();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("outgoing inline images", () => {
  it("keeps both previews through the queued-to-confirmed message handoff", () => {
    const first = new Blob(["first"], { type: "image/png" });
    const second = new Blob(["second"], { type: "image/png" });
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:reader-first")
      .mockReturnValueOnce("blob:reader-second");
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = createObjectURL;
      },
    );

    publishOutgoingInlineImages("acc-1", "send-1", [
      {
        disposition: "inline",
        contentId: "<first@local>",
        preview: { blob: first },
      },
      {
        disposition: "inline",
        contentId: "second@local",
        preview: { blob: second },
      },
    ]);

    const html = '<img src="cid:first@local"><img src="cid:second@local">';
    const rendered =
      '<img src="blob:reader-first"><img src="blob:reader-second">';
    const queuedKey = inlineImageCacheKey("acc-1", "outgoing:send-1", "send-1");
    const confirmedKey = inlineImageCacheKey(
      "acc-1",
      "provider-message",
      "send-1",
    );
    expect(withLoadedInlineImages(queuedKey, html)).toBe(rendered);
    expect(withLoadedInlineImages(confirmedKey, html)).toBe(rendered);
    expect(
      withLoadedInlineImages(
        inlineImageCacheKey("acc-2", "provider-message", "send-1"),
        html,
      ),
    ).toBe(html);
    expect(createObjectURL).toHaveBeenNthCalledWith(1, first);
    expect(createObjectURL).toHaveBeenNthCalledWith(2, second);
  });

  it.each([
    false,
    true,
  ])("protects a new preview in a fully mounted cache (reader mounts: %s)", async (mountReader) => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = vi
          .fn()
          .mockReturnValue("blob:pending-preview");
        static revokeObjectURL = revokeObjectURL;
      },
    );
    const releaseMounted = Array.from({ length: 20 }, (_, index) => {
      const messageId = `mounted-${mountReader}-${index}`;
      const release = retainInlineImages(messageId);
      storeLoadedInlineImage({
        messageId,
        contentId: "image",
        objectUrl: `blob:${messageId}`,
      });
      return release;
    });
    let releaseReader: (() => void) | undefined;
    try {
      const operationId = `pending-${mountReader}`;
      publishOutgoingInlineImages("acc-1", operationId, [
        {
          disposition: "inline",
          contentId: "image",
          preview: { blob: new Blob(["image"]) },
        },
      ]);
      const key = inlineImageCacheKey("acc-1", "", operationId);
      const html = '<img src="cid:image">';
      expect(withLoadedInlineImages(key, html)).toContain(
        'src="blob:pending-preview"',
      );
      if (mountReader) releaseReader = retainInlineImages(key);
      await vi.advanceTimersByTimeAsync(30_000);
      if (mountReader) {
        expect(withLoadedInlineImages(key, html)).toContain(
          'src="blob:pending-preview"',
        );
        expect(revokeObjectURL).not.toHaveBeenCalledWith(
          "blob:pending-preview",
        );
      } else {
        expect(withLoadedInlineImages(key, html)).toBe(html);
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:pending-preview");
      }
    } finally {
      releaseReader?.();
      for (const release of releaseMounted) release();
    }
  });

  it("ignores regular attachments and inline images without local previews", () => {
    const html = '<img src="cid:file"><img src="cid:missing">';
    publishOutgoingInlineImages("acc-1", "send-2", [
      {
        disposition: "attachment",
        contentId: "file",
        preview: { blob: new Blob(["file"]) },
      },
      { disposition: "inline", contentId: "missing" },
    ]);
    expect(
      withLoadedInlineImages(inlineImageCacheKey("acc-1", "", "send-2"), html),
    ).toBe(html);
  });
});
