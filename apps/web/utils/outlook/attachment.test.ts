import { expect, it, vi } from "vitest";
import { getOutlookAttachment, getOutlookAttachmentStream } from "./attachment";
import type { OutlookClient } from "./client";

it("keeps inline base64 content without downloading it again", async () => {
  const attachment = {
    contentBytes: Buffer.from([0, 255, 128]).toString("base64"),
    size: 3,
  };
  const api = vi.fn(() => ({ get: vi.fn().mockResolvedValue(attachment) }));
  const client = { getClient: () => ({ api }) } as unknown as OutlookClient;

  expect(await getOutlookAttachment(client, "message", "file")).toEqual(
    attachment,
  );
  expect(api).toHaveBeenCalledTimes(1);
});

it("preserves a zero-byte attachment without a raw download", async () => {
  const attachment = { size: 0 };
  const api = vi.fn(() => ({ get: vi.fn().mockResolvedValue(attachment) }));
  const client = { getClient: () => ({ api }) } as unknown as OutlookClient;

  expect(await getOutlookAttachment(client, "message", "file")).toEqual(
    attachment,
  );
  expect(api).toHaveBeenCalledTimes(1);
});

it("propagates a failed raw download instead of returning an empty attachment", async () => {
  const request = {
    options: vi.fn().mockReturnThis(),
    responseType: vi.fn().mockReturnThis(),
    get: vi
      .fn()
      .mockResolvedValueOnce({ size: 5 * 1024 * 1024 })
      .mockResolvedValueOnce(new Response("unavailable", { status: 404 })),
  };
  const client = {
    getClient: () => ({ api: () => request }),
  } as unknown as OutlookClient;

  await expect(
    getOutlookAttachment(client, "message", "file"),
  ).rejects.toMatchObject({ status: 404, statusCode: 404 });
});

it.each([
  0, 2, 4,
])("rejects a raw download of %i bytes when metadata reports 3 bytes", async (downloadedSize) => {
  const request = {
    options: vi.fn().mockReturnThis(),
    responseType: vi.fn().mockReturnThis(),
    get: vi
      .fn()
      .mockResolvedValueOnce({ size: 3 })
      .mockResolvedValueOnce(new Response(Buffer.alloc(downloadedSize))),
  };
  const client = {
    getClient: () => ({ api: () => request }),
  } as unknown as OutlookClient;

  await expect(getOutlookAttachment(client, "message", "file")).rejects.toThrow(
    "Attachment size mismatch",
  );
});

it.each([
  3,
  undefined,
])("returns complete raw content when metadata size is %s", async (size) => {
  const content = Buffer.from([0, 255, 128]);
  const request = {
    options: vi.fn().mockReturnThis(),
    responseType: vi.fn().mockReturnThis(),
    get: vi
      .fn()
      .mockResolvedValueOnce({ size })
      .mockResolvedValueOnce(new Response(content)),
  };
  const client = {
    getClient: () => ({ api: () => request }),
  } as unknown as OutlookClient;

  expect(await getOutlookAttachment(client, "message", "file")).toEqual({
    contentBytes: content.toString("base64"),
    size: content.length,
  });
});

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
  ).rejects.toMatchObject({ status: 404, statusCode: 404 });
  expect(cancelled).toBe(true);
});
