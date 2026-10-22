// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareOutgoingInlineImages } from "./outgoing-inline-images";
import {
  inlineImageCacheKey,
  withLoadedInlineImages,
} from "./inline-image-cache";

afterEach(() => vi.unstubAllGlobals());

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
