import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithAccount } from "@/utils/fetch";
import { fetchAttachment, getAttachmentUrl } from "./download";

vi.mock("@/utils/fetch", () => ({ fetchWithAccount: vi.fn() }));

describe("getAttachmentUrl", () => {
  it("points at mail v1 attachment-content for the account", () => {
    expect(
      getAttachmentUrl({
        accountId: "acc/slash",
        messageId: "message-id",
        attachmentId: "file-1",
      }),
    ).toBe(
      "/api/mail/v1/accounts/acc%2Fslash/attachment-content?messageId=message-id&attachmentId=file-1&protocolVersion=1",
    );
  });
});

describe("fetchAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the attachment with the selected email account", async () => {
    const blob = new Blob(["attachment"]);
    vi.mocked(fetchWithAccount).mockResolvedValue(
      new Response(blob, { status: 200 }),
    );

    await expect(
      fetchAttachment({
        url: "/api/mail/v1/accounts/account-id/attachment-content?messageId=message-id",
        emailAccountId: "account-id",
      }),
    ).resolves.toEqual(blob);

    expect(fetchWithAccount).toHaveBeenCalledWith({
      url: "/api/mail/v1/accounts/account-id/attachment-content?messageId=message-id",
      emailAccountId: "account-id",
    });
  });

  it("rejects an unsuccessful attachment response", async () => {
    const cancel = vi.fn();
    vi.mocked(fetchWithAccount).mockResolvedValue(
      new Response(new ReadableStream({ cancel }), { status: 403 }),
    );

    await expect(
      fetchAttachment({
        url: "/api/mail/v1/accounts/account-id/attachment-content?messageId=message-id",
        emailAccountId: "account-id",
      }),
    ).rejects.toThrow("Failed to download attachment");
    expect(cancel).toHaveBeenCalled();
  });

  it("rejects before fetching when the email account is unavailable", async () => {
    await expect(
      fetchAttachment({
        url: "/api/mail/v1/accounts/account-id/attachment-content?messageId=message-id",
        emailAccountId: "",
      }),
    ).rejects.toThrow("Email account ID is required");

    expect(fetchWithAccount).not.toHaveBeenCalled();
  });

  it("stops an underestimated attachment at the actual byte limit", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
      },
      cancel,
    });
    vi.mocked(fetchWithAccount).mockResolvedValue(
      new Response(stream, { headers: { "content-length": "2" } }),
    );
    const progress = vi.fn();
    await expect(
      fetchAttachment({
        url: "/api/mail/v1/accounts/account-id/attachment-content",
        emailAccountId: "account-id",
        maxBytes: 5,
        onProgress: progress,
      }),
    ).rejects.toThrow("Attachment exceeds the download size limit");
    expect(cancel).toHaveBeenCalled();
    expect(progress).toHaveBeenLastCalledWith(3);
  });

  it("rejects a declared oversized response without consuming its body", async () => {
    const cancel = vi.fn();
    vi.mocked(fetchWithAccount).mockResolvedValue(
      new Response(new ReadableStream({ cancel }), {
        headers: { "content-length": "100" },
      }),
    );
    await expect(
      fetchAttachment({
        url: "/api/mail/v1/accounts/account-id/attachment-content",
        emailAccountId: "account-id",
        maxBytes: 5,
      }),
    ).rejects.toThrow("Attachment exceeds the download size limit");
    expect(cancel).toHaveBeenCalled();
  });

  it("returns a complete binary blob at the exact limit and reports actual bytes", async () => {
    vi.mocked(fetchWithAccount).mockResolvedValue(
      new Response(new Uint8Array([0, 128, 255]), {
        headers: { "content-type": "application/octet-stream" },
      }),
    );
    const progress = vi.fn();
    const result = await fetchAttachment({
      url: "/api/mail/v1/accounts/account-id/attachment-content",
      emailAccountId: "account-id",
      maxBytes: 3,
      onProgress: progress,
    });
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(
      new Uint8Array([0, 128, 255]),
    );
    expect(result.type).toBe("application/octet-stream");
    expect(progress).toHaveBeenLastCalledWith(3);
  });

  it("cancels a stalled read without returning a partial attachment", async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    vi.mocked(fetchWithAccount).mockResolvedValue(
      new Response(new ReadableStream({ cancel })),
    );
    const download = fetchAttachment({
      url: "/api/mail/v1/accounts/account-id/attachment-content",
      emailAccountId: "account-id",
      maxBytes: 5,
      signal: controller.signal,
    });
    const rejected = expect(download).rejects.toMatchObject({
      name: "AbortError",
    });
    await Promise.resolve();
    controller.abort();
    await rejected;
    expect(cancel).toHaveBeenCalled();
  });

  it("preserves binary contents across many small transport chunks", async () => {
    const expected = Uint8Array.from(
      { length: 130_009 },
      (_, index) => index % 251,
    );
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === expected.length) {
          controller.close();
          return;
        }
        const end = Math.min(offset + 7, expected.length);
        controller.enqueue(expected.subarray(offset, end));
        offset = end;
      },
    });
    vi.mocked(fetchWithAccount).mockResolvedValue(new Response(stream));
    const result = await fetchAttachment({
      url: "/api/mail/v1/accounts/account-id/attachment-content",
      emailAccountId: "account-id",
      maxBytes: expected.length,
    });
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(expected);
  });
});
