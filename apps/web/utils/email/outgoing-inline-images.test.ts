// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareOutgoingInlineImages } from "./outgoing-inline-images";
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
  it("keeps an independent preview through the queued-to-confirmed message handoff", async () => {
    const blob = new Blob(["image"], { type: "image/png" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, blob: async () => blob }),
    );
    const createObjectURL = vi.fn().mockReturnValue("blob:reader-preview");
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = createObjectURL;
      },
    );

    const publish = await prepareOutgoingInlineImages("acc-1", [
      {
        disposition: "inline",
        contentId: "<image@local>",
        previewUrl: "blob:composer-preview",
      },
    ]);
    publish("send-1");

    const html = '<img src="cid:image@local">';
    const queuedKey = inlineImageCacheKey("acc-1", "outgoing:send-1", "send-1");
    const confirmedKey = inlineImageCacheKey(
      "acc-1",
      "provider-message",
      "send-1",
    );
    expect(withLoadedInlineImages(queuedKey, html)).toContain(
      'src="blob:reader-preview"',
    );
    expect(withLoadedInlineImages(confirmedKey, html)).toContain(
      'src="blob:reader-preview"',
    );
    expect(
      withLoadedInlineImages(
        inlineImageCacheKey("acc-2", "provider-message", "send-1"),
        html,
      ),
    ).toBe(html);
    expect(createObjectURL).toHaveBeenCalledWith(blob);
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
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, blob: async () => new Blob(["image"]) }),
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
      const publish = await prepareOutgoingInlineImages("acc-1", [
        {
          disposition: "inline",
          contentId: "image",
          previewUrl: "blob:composer-preview",
        },
      ]);
      const operationId = `pending-${mountReader}`;
      publish(operationId);
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

  it("does not block sending when a local preview cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("revoked")));
    const publish = await prepareOutgoingInlineImages("acc-1", [
      {
        disposition: "inline",
        contentId: "missing",
        previewUrl: "blob:revoked",
      },
    ]);
    expect(() => publish("send-2")).not.toThrow();
  });

  it("ignores regular attachments and remote image URLs", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await prepareOutgoingInlineImages("acc-1", [
      { disposition: "attachment", contentId: "file", previewUrl: "blob:file" },
      {
        disposition: "inline",
        contentId: "remote",
        previewUrl: "https://example.com/image",
      },
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
