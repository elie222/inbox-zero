import { expect, it, vi } from "vitest";
import { getOutlookAttachmentStream } from "./attachment";
import type { OutlookClient } from "./client";

it("uses the authenticated raw attachment endpoint and forwards cancellation", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
    },
    cancel() {
      cancelled = true;
    },
  });
  const get = vi.fn().mockResolvedValue(new Response(body));
  const request = {
    options: vi.fn().mockReturnThis(),
    responseType: vi.fn().mockReturnThis(),
    get,
  };
  const api = vi.fn().mockReturnValue(request);
  const client = { getClient: () => ({ api }) } as unknown as OutlookClient;
  const controller = new AbortController();
  const stream = await getOutlookAttachmentStream(
    client,
    "message/+",
    "attachment/=",
    controller.signal,
  );
  expect(api).toHaveBeenCalledWith(
    "/me/messages/message%2F%2B/attachments/attachment%2F%3D/$value",
  );
  expect(request.options).toHaveBeenCalledWith({ signal: controller.signal });
  expect(request.responseType).toHaveBeenCalledWith("raw");
  const reader = stream.getReader();
  expect((await reader.read()).value).toEqual(new Uint8Array([1, 2, 3]));
  controller.abort();
  await expect.poll(() => cancelled).toBe(true);
});
it("rejects an HTTP error without exposing its response body as attachment bytes", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const request = {
    options: vi.fn().mockReturnThis(),
    responseType: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(new Response(body, { status: 404 })),
  };
  const client = {
    getClient: () => ({ api: () => request }),
  } as unknown as OutlookClient;
  await expect(
    getOutlookAttachmentStream(client, "message", "file"),
  ).rejects.toThrow();
  expect(cancelled).toBe(true);
});
