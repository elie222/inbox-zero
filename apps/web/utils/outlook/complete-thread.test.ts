import { expect, it, vi } from "vitest";
import type { OutlookClient } from "./client";
import { getThread, getThreadMessages } from "./thread";
import { createScopedLogger } from "@/utils/logger";
const logger = createScopedLogger("complete-thread-test");
const next = "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=next";
it("enumerates more than100messages only for explicit complete reads", async () => {
  const first = Array.from({ length: 100 }, (_, i) => message(String(i)));
  const { client, get } = fixture([
    { value: first, "@odata.nextLink": next },
    { value: [message("100")] },
  ]);
  expect(
    await getThread("thread", client, logger, { complete: true }),
  ).toHaveLength(101);
  expect(get).toHaveBeenCalledTimes(2);
});
it("keeps the default first-page behavior", async () => {
  const { client, get } = fixture(
    [{ value: [message("a")], "@odata.nextLink": next }],
    false,
  );
  expect(await getThread("thread", client, logger)).toHaveLength(1);
  expect(get).toHaveBeenCalledTimes(1);
});
it("includes attachment metadata continuation without requesting file contents", async () => {
  const attachmentNext =
    "https://graph.microsoft.com/v1.0/me/messages/a/attachments?$skiptoken=more";
  const { client, api } = fixture([
    {
      value: [
        {
          ...message("a"),
          attachments: [{ id: "file1" }],
          "attachments@odata.nextLink": attachmentNext,
        },
      ],
    },
    { value: [{ id: "file2", isInline: true }] },
  ]);
  const result = await getThread("thread", client, logger, { complete: true });
  expect(result[0].attachments?.map((file) => file.id)).toEqual([
    "file1",
    "file2",
  ]);
  expect(api).toHaveBeenLastCalledWith(attachmentNext);
});
it.each([
  "https://example.com/messages",
  "https://graph.microsoft.com/v1.0/me/contacts",
  "opaque-cursor",
  "https://user:password@graph.microsoft.com/v1.0/me/messages",
])("rejects unsafe continuation %s", async (link) => {
  const { client, get } = fixture([
    { value: [message("a")], "@odata.nextLink": link },
  ]);
  await expect(
    getThread("thread", client, logger, { complete: true }),
  ).rejects.toThrow();
  expect(get).toHaveBeenCalledTimes(1);
});
it("never returns a partial result when a continuation fails", async () => {
  const { client } = fixture([
    { value: [message("a")], "@odata.nextLink": next },
    new Error("Continuation failed"),
  ]);
  await expect(
    getThread("thread", client, logger, { complete: true }),
  ).rejects.toThrow("Continuation failed");
});
it("rejects repeated continuation and out-of-conversation messages", async () => {
  const repeated = fixture([
    { value: [message("a")], "@odata.nextLink": next },
    { value: [message("b")], "@odata.nextLink": next },
  ]);
  await expect(
    getThread("thread", repeated.client, logger, { complete: true }),
  ).rejects.toThrow();
  const wrongThread = fixture([
    { value: [{ ...message("a"), conversationId: "other" }] },
  ]);
  await expect(
    getThread("thread", wrongThread.client, logger, { complete: true }),
  ).rejects.toThrow();
});
it("fails honestly when the full conversation exceeds its message cap", async () => {
  const { client } = fixture([
    { value: Array.from({ length: 1001 }, (_, i) => message(String(i))) },
  ]);
  await expect(
    getThread("thread", client, logger, { complete: true }),
  ).rejects.toThrow("message limit");
});
it("does not infer an empty attachment inventory from a missing expansion", async () => {
  const { client, api } = fixture([
    { value: [{ ...message("a"), attachments: undefined }] },
    { value: [{ id: "inline", isInline: true }] },
  ]);
  const result = await getThread("thread", client, logger, { complete: true });
  expect(result[0].attachments).toEqual([{ id: "inline", isInline: true }]);
  expect(api).toHaveBeenLastCalledWith("/me/messages/a/attachments");
});
it("does not return partial attachment metadata after its continuation fails", async () => {
  const link =
    "https://graph.microsoft.com/v1.0/me/messages/a/attachments?$skiptoken=more";
  const { client } = fixture([
    {
      value: [
        {
          ...message("a"),
          attachments: [{ id: "file" }],
          "attachments@odata.nextLink": link,
        },
      ],
    },
    new Error("Attachment page failed"),
  ]);
  await expect(
    getThread("thread", client, logger, { complete: true }),
  ).rejects.toThrow("Attachment page failed");
});
it("rejects repeated attachment metadata continuation", async () => {
  const link =
    "https://graph.microsoft.com/v1.0/me/messages/a/attachments?$skiptoken=more";
  const { client } = fixture([
    {
      value: [
        {
          ...message("a"),
          attachments: [{ id: "file" }],
          "attachments@odata.nextLink": link,
        },
      ],
    },
    { value: [{ id: "second" }], "@odata.nextLink": link },
  ]);
  await expect(
    getThread("thread", client, logger, { complete: true }),
  ).rejects.toThrow("repeated");
});

it("cancels folder and category decoration with the explicit snapshot signal", async () => {
  const controller = new AbortController();
  let metadataCalls = 0;
  const api = vi.fn((path: string) => {
    let signal: AbortSignal | undefined;
    const request = {
      select: vi.fn().mockReturnThis(),
      expand: vi.fn().mockReturnThis(),
      top: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      responseType: vi.fn().mockReturnThis(),
      options(options: { signal?: AbortSignal }) {
        signal = options.signal;
        return request;
      },
      get() {
        if (path === "/me/messages")
          return Promise.resolve(Response.json({ value: [message("a")] }));
        metadataCalls++;
        return new Promise((_resolve, reject) =>
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          }),
        );
      },
    };
    return request;
  });
  const client = {
    getClient: () => ({ api }),
    getFolderIdCache: () => null,
    getCategoryMapCache: () => null,
    setFolderIdCache: vi.fn(),
    setCategoryMapCache: vi.fn(),
  } as unknown as OutlookClient;
  const result = getThreadMessages("thread", client, logger, {
    complete: true,
    signal: controller.signal,
  });
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await expect.poll(() => metadataCalls).toBeGreaterThan(1);
  controller.abort();
  await rejected;
});

function message(id: string) {
  return {
    id,
    conversationId: "thread",
    attachments: [],
    receivedDateTime: "2026-01-01T00:00:00Z",
  };
}
function fixture(pages: unknown[], raw = true) {
  const get = vi.fn().mockImplementation(async () => {
    const page = pages.shift();
    if (page instanceof Error) throw page;
    return raw ? Response.json(page) : page;
  });
  const request = {
    get,
    select: vi.fn().mockReturnThis(),
    expand: vi.fn().mockReturnThis(),
    top: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    options: vi.fn().mockReturnThis(),
    responseType: vi.fn().mockReturnThis(),
  };
  const api = vi.fn().mockReturnValue(request);
  return {
    client: { getClient: () => ({ api }) } as unknown as OutlookClient,
    api,
    get,
  };
}
