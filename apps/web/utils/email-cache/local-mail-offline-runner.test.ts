import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import { fetchWithAccount } from "@/utils/fetch";
import { fetchAttachment } from "@/utils/attachments/download";
import { LOCAL_MAIL_ATTACHMENT_MEMORY_LIMIT } from "./local-mail-attachment-download";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import { bootstrapLocalMailStorageLedgerBatch } from "./local-mail-storage-ledger-bootstrap";
import { prepareLocalMailOfflineConversation } from "./local-mail-offline-plan";
import { saveLocalMailOfflineConversation } from "./local-mail-offline-save";
import {
  cancelLocalMailOfflineSnapshot,
  readLocalMailOfflineSnapshot,
} from "./local-mail-attachments";
import {
  drainLocalMailOfflineDownloads,
  forgetLocalMailOfflineDownloadWaits,
} from "./local-mail-offline-runner";

vi.mock("@/utils/fetch", () => ({ fetchWithAccount: vi.fn() }));
vi.mock("@/utils/attachments/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/attachments/download")>()),
  fetchAttachment: vi.fn(),
}));

const attachment = {
  attachmentId: "attachment",
  filename: "notes.txt",
  mimeType: "text/plain",
  size: 12,
  headers: {},
};

beforeEach(async () => {
  vi.clearAllMocks();
  await clearEmailCache();
  forgetLocalMailOfflineDownloadWaits("account");
  vi.stubGlobal("navigator", {
    onLine: true,
    storage: { estimate: async () => ({ quota: 1024 ** 3, usage: 0 }) },
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        run: (lock: object) => unknown,
      ) => run({}),
    },
  });
  const db = (await getEmailCacheDatabase())!;
  await db.put("searchIndexAccounts", {
    emailAccountId: "account",
    generation: "generation",
    messageBytes: 0,
  });
  while ((await bootstrapLocalMailStorageLedgerBatch()) === "progress") {}
  const ledger = (await db.get("localMailStorageLedger", "origin"))!;
  await db.put("localMailStorageLedger", {
    ...ledger,
    index: { status: "ready", bytes: 0 },
  });
  vi.mocked(fetchWithAccount).mockImplementation(async () =>
    Response.json({
      thread: {
        id: "thread",
        messages: [
          getMockMessage({
            id: "message",
            threadId: "thread",
            attachments: [attachment],
          }),
        ],
        snippet: "",
      },
    }),
  );
  vi.mocked(fetchAttachment).mockImplementation(
    async () => new Blob(["attachment!"]),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function pin() {
  const plan = await prepareLocalMailOfflineConversation({
    emailAccountId: "account",
    threadId: "thread",
  });
  return saveLocalMailOfflineConversation(plan);
}

it("downloads a pinned conversation's attachments until it is available offline", async () => {
  await pin();
  expect(
    await readLocalMailOfflineSnapshot({
      emailAccountId: "account",
      threadId: "thread",
    }),
  ).toMatchObject({ attachmentsReady: false, cachedBytes: 0 });

  expect(
    await drainLocalMailOfflineDownloads({ emailAccountId: "account" }),
  ).toBe("progress");

  expect(
    await readLocalMailOfflineSnapshot({
      emailAccountId: "account",
      threadId: "thread",
    }),
  ).toMatchObject({ attachmentsReady: true, invalidated: false });
  expect(
    await drainLocalMailOfflineDownloads({ emailAccountId: "account" }),
  ).toBe("idle");
  expect(fetchAttachment).toHaveBeenCalledTimes(1);
});

it("leaves conversations that were never pinned alone", async () => {
  const db = (await getEmailCacheDatabase())!;
  await db.put("localMailAttachmentJobs", {
    emailAccountId: "account",
    threadId: "thread",
    messageId: "message",
    attachmentId: "attachment",
    revision: "revision",
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    reportedBytes: attachment.size,
    reservationId: "reservation",
    state: "pending",
    attempts: 0,
    updatedAt: Date.now(),
  });
  expect(
    await drainLocalMailOfflineDownloads({ emailAccountId: "account" }),
  ).toBe("idle");
  expect(fetchAttachment).not.toHaveBeenCalled();
});

it("stops downloading once the offline copy is removed", async () => {
  await pin();
  await cancelLocalMailOfflineSnapshot({
    emailAccountId: "account",
    threadId: "thread",
  });
  expect(
    await readLocalMailOfflineSnapshot({
      emailAccountId: "account",
      threadId: "thread",
    }),
  ).toBeUndefined();
  expect(
    await drainLocalMailOfflineDownloads({ emailAccountId: "account" }),
  ).toBe("idle");
  expect(fetchAttachment).not.toHaveBeenCalled();
});

it("waits out a failed transfer instead of retrying it on the next pass", async () => {
  await pin();
  vi.mocked(fetchAttachment).mockRejectedValue(new Error("network"));
  await expect(
    drainLocalMailOfflineDownloads({ emailAccountId: "account" }),
  ).rejects.toThrow("network");
  const db = (await getEmailCacheDatabase())!;
  const failed = await db.getAllFromIndex(
    "localMailAttachmentJobs",
    "byAccount",
    "account",
  );
  expect(failed).toMatchObject([{ state: "failed", attempts: 1 }]);

  vi.mocked(fetchAttachment).mockResolvedValue(new Blob(["attachment!"]));
  expect(
    await drainLocalMailOfflineDownloads({ emailAccountId: "account" }),
  ).toBe("blocked");
  expect(fetchAttachment).toHaveBeenCalledTimes(1);

  expect(
    await drainLocalMailOfflineDownloads({
      emailAccountId: "account",
      now: Date.now() + 60_000,
    }),
  ).toBe("progress");
  expect(
    await readLocalMailOfflineSnapshot({
      emailAccountId: "account",
      threadId: "thread",
    }),
  ).toMatchObject({ attachmentsReady: true });
});

it("reports a conversation that changed rather than downloading a stale copy", async () => {
  await pin();
  const db = (await getEmailCacheDatabase())!;
  const protection = (await db.get("localMailThreadProtection", [
    "account",
    "thread",
  ]))!;
  await db.put("localMailThreadProtection", {
    ...protection,
    pinSnapshotInvalidated: true,
  });
  expect(
    await drainLocalMailOfflineDownloads({ emailAccountId: "account" }),
  ).toBe("idle");
  expect(fetchAttachment).not.toHaveBeenCalled();
  expect(
    await readLocalMailOfflineSnapshot({
      emailAccountId: "account",
      threadId: "thread",
    }),
  ).toMatchObject({ invalidated: true, attachmentsReady: false });
});

it("attempts a file whose size the provider did not report", async () => {
  vi.mocked(fetchWithAccount).mockImplementation(async () =>
    Response.json({
      thread: {
        id: "thread",
        messages: [
          getMockMessage({
            id: "message",
            threadId: "thread",
            attachments: [{ ...attachment, size: 0 }],
          }),
        ],
        snippet: "",
      },
    }),
  );
  await pin();
  expect(
    await drainLocalMailOfflineDownloads({ emailAccountId: "account" }),
  ).toBe("progress");
  // The transfer ceiling has to match what the storable check promises, or a
  // file it calls storable is refused and retried until it is exhausted.
  expect(vi.mocked(fetchAttachment).mock.calls[0][0]).toMatchObject({
    maxBytes: LOCAL_MAIL_ATTACHMENT_MEMORY_LIMIT,
  });
  expect(
    await readLocalMailOfflineSnapshot({
      emailAccountId: "account",
      threadId: "thread",
    }),
  ).toMatchObject({ attachmentsReady: true });
});

it("reports a file too large to keep without retrying it", async () => {
  vi.mocked(fetchWithAccount).mockImplementation(async () =>
    Response.json({
      thread: {
        id: "thread",
        messages: [
          getMockMessage({
            id: "message",
            threadId: "thread",
            attachments: [
              { ...attachment, size: LOCAL_MAIL_ATTACHMENT_MEMORY_LIMIT + 1 },
            ],
          }),
        ],
        snippet: "",
      },
    }),
  );
  await pin();
  // Blocked rather than progress: reporting progress would have the sync loop
  // return to this job every 250ms for as long as the pin exists.
  for (let pass = 0; pass < 3; pass++)
    expect(
      await drainLocalMailOfflineDownloads({ emailAccountId: "account" }),
    ).toBe("blocked");
  expect(fetchAttachment).not.toHaveBeenCalled();
});
