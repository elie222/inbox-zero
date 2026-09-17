import "fake-indexeddb/auto";
import { beforeEach, expect, it, vi } from "vitest";
import {
  clearEmailCache,
  clearEmailCacheForAccount,
  getEmailCacheDatabase,
} from "./database";
import { downloadLocalMailAttachment } from "./local-mail-attachment-download";
import { fetchAttachment } from "@/utils/attachments/download";

vi.mock("@/utils/attachments/download", () => ({
  fetchAttachment: vi.fn(),
  getAttachmentUrl: () => "/attachment",
}));
const storageOptions = {
  enforceLogicalBudget: false,
  attachmentBudgetBytes: 100,
  readAdmission: async () => ({ remainingBytes: 1000, limitBytes: 1000 }),
  withStorageLock: async <T>(run: () => Promise<T>) => run(),
};
const input = {
  emailAccountId: "account",
  messageId: "message",
  attachmentId: "file",
  priority: "requested" as const,
  maxBytes: 4,
  storageOptions,
};
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("navigator", {
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        run: () => Promise<unknown>,
      ) => run(),
    },
  });
  await clearEmailCache();
  const db = (await getEmailCacheDatabase())!;
  await db.put("searchIndexAccounts", {
    emailAccountId: "account",
    generation: "g1",
    messageBytes: 0,
  });
  await db.put("localMailMessages", {
    emailAccountId: "account",
    messageId: "message",
    threadId: "thread",
    bodyFetchedAt: 1,
    fetchedAt: 1,
    receivedAt: 1,
    lastAccessedAt: 1,
    byteSize: 0,
    data: {
      id: "message",
      threadId: "thread",
      date: "",
      historyId: "",
      snippet: "",
      subject: "",
      headers: { from: "", to: "", subject: "", date: "" },
      inline: [],
      attachments: [
        {
          attachmentId: "file",
          filename: "file.txt",
          mimeType: "text/plain",
          size: 4,
          headers: {
            "content-description": "",
            "content-id": "",
            "content-type": "text/plain",
            "content-transfer-encoding": "",
          },
        },
      ],
    },
  });
  vi.mocked(fetchAttachment).mockResolvedValue(new Blob(["1234"]));
});
it("commits bounded transfers and serves subsequent reads without transport", async () => {
  expect(await downloadLocalMailAttachment(input)).toMatchObject({
    status: "ready",
    cached: true,
  });
  expect(await downloadLocalMailAttachment(input)).toMatchObject({
    status: "ready",
    cached: true,
  });
  expect(fetchAttachment).toHaveBeenCalledTimes(1);
  expect(fetchAttachment).toHaveBeenCalledWith(
    expect.objectContaining({ maxBytes: 4, signal: expect.any(AbortSignal) }),
  );
});
it("does not fetch speculative data without storage; requested data may remain uncached", async () => {
  const denied = {
    ...input,
    storageOptions: { ...storageOptions, attachmentBudgetBytes: 0 },
  };
  expect(
    await downloadLocalMailAttachment({ ...denied, priority: "speculative" }),
  ).toEqual({ status: "skipped", reason: "storage" });
  expect(fetchAttachment).not.toHaveBeenCalled();
  expect(await downloadLocalMailAttachment(denied)).toMatchObject({
    status: "ready",
    cached: false,
  });
});
it.each([
  undefined,
  Number.POSITIVE_INFINITY,
  17 * 1024 * 1024,
])("requires an external download beyond a finite memory bound (%s)", async (maxBytes) => {
  expect(await downloadLocalMailAttachment({ ...input, maxBytes })).toEqual({
    status: "external-download-required",
  });
  expect(fetchAttachment).not.toHaveBeenCalled();
});
it("fences uncached responses after account cleanup", async () => {
  vi.mocked(fetchAttachment).mockImplementation(async () => {
    await clearEmailCacheForAccount("account");
    return new Blob(["1234"]);
  });
  expect(
    await downloadLocalMailAttachment({
      ...input,
      storageOptions: { ...storageOptions, attachmentBudgetBytes: 0 },
    }),
  ).toEqual({ status: "skipped", reason: "stale" });
});
it("releases reservations on transport failure and allows retry", async () => {
  vi.mocked(fetchAttachment).mockRejectedValueOnce(
    new Error("Transport failed"),
  );
  await expect(downloadLocalMailAttachment(input)).rejects.toThrow(
    "Transport failed",
  );
  const db = (await getEmailCacheDatabase())!;
  expect((await db.getAll("localMailAttachmentJobs"))[0].state).toBe("failed");
  expect(
    (await db.get("localMailThreadProtection", ["account", "thread"]))
      ?.reservations,
  ).toEqual({});
  expect(await downloadLocalMailAttachment(input)).toMatchObject({
    status: "ready",
    cached: true,
  });
});
it("does not call transport if the account is cleared while queued", async () => {
  const acquired = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  vi.stubGlobal("navigator", {
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        run: () => Promise<unknown>,
      ) => {
        acquired.resolve();
        await release.promise;
        return run();
      },
    },
  });
  const result = downloadLocalMailAttachment(input);
  await acquired.promise;
  await clearEmailCacheForAccount("account");
  release.resolve();
  expect(await result).toEqual({ status: "skipped", reason: "stale" });
  expect(fetchAttachment).not.toHaveBeenCalled();
});
it("does not expose an old response after source generation changes", async () => {
  vi.mocked(fetchAttachment).mockImplementation(async () => {
    const db = (await getEmailCacheDatabase())!;
    await db.put("searchIndexAccounts", {
      emailAccountId: "account",
      generation: "g2",
      messageBytes: 0,
    });
    return new Blob(["1234"]);
  });
  expect(await downloadLocalMailAttachment(input)).toEqual({
    status: "skipped",
    reason: "stale",
  });
  expect(
    await (await getEmailCacheDatabase())!.count("localMailAttachmentFiles"),
  ).toBe(0);
});
it("releases the reservation when the caller cancels transport", async () => {
  const controller = new AbortController();
  vi.mocked(fetchAttachment).mockImplementation(async () => {
    controller.abort();
    return new Blob(["1234"]);
  });
  await expect(
    downloadLocalMailAttachment({ ...input, signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  const db = (await getEmailCacheDatabase())!;
  expect(
    (await db.get("localMailThreadProtection", ["account", "thread"]))
      ?.reservations,
  ).toEqual({});
  expect(await db.count("localMailAttachmentFiles")).toBe(0);
});
