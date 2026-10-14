import { describe, expect, it, vi } from "vitest";
import { readDesktopAttachment } from "./attachment";

const payload = {
  accountId: "account-1",
  messageId: "message-1",
  attachmentId: "part/&1",
};

describe("desktop inline attachment transport", () => {
  it("fetches bytes from the hosted account endpoint using the desktop session", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const fetch = vi.fn().mockResolvedValue(new Response(bytes));
    expect(
      await readDesktopAttachment({
        payload,
        origin: "https://mail.example.test",
        fetch,
      }),
    ).toEqual(bytes);
    const [url, init] = fetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://mail.example.test");
    expect(parsed.pathname).toBe(
      "/api/mail/v1/accounts/account-1/attachment-content",
    );
    expect(parsed.searchParams.get("attachmentId")).toBe("part/&1");
    expect(parsed.searchParams.get("messageId")).toBe("message-1");
    expect(parsed.searchParams.get("protocolVersion")).toBe("1");
    expect(init.headers).toEqual({ "X-Email-Account-ID": "account-1" });
    expect(init.credentials).toBe("include");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects malformed requests before fetching", async () => {
    const fetch = vi.fn();
    await expect(
      readDesktopAttachment({
        payload: { ...payload, accountId: "" },
        origin: "https://mail.example.test",
        fetch,
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    403, 404, 500,
  ])("rejects HTTP %s without exposing error page bytes", async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response("error", { status }));
    await expect(
      readDesktopAttachment({
        payload,
        origin: "https://mail.example.test",
        fetch,
      }),
    ).rejects.toThrow("download failed");
  });

  it("cancels oversized responses before reading them", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { "content-length": String(25 * 1024 * 1024 + 1) },
    });
    await expect(
      readDesktopAttachment({
        payload,
        origin: "https://mail.example.test",
        fetch: vi.fn().mockResolvedValue(response),
      }),
    ).rejects.toThrow("download failed");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds streamed bytes when content-length is absent", async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(25 * 1024 * 1024));
          controller.enqueue(new Uint8Array(1));
        },
        cancel,
      }),
    );
    await expect(
      readDesktopAttachment({
        payload,
        origin: "https://mail.example.test",
        fetch: vi.fn().mockResolvedValue(response),
      }),
    ).rejects.toThrow("size limit");
    expect(cancel).toHaveBeenCalledOnce();
  });
});
