import { fetchAttachment } from "./download";
import { beforeEach, expect, it, vi } from "vitest";
import { createOpenedConversationAttachments } from "./opened-conversation";
import { downloadLocalMailAttachment } from "@/utils/email-cache/local-mail-attachment-download";
import {
  getLocalMailAttachmentReference,
  readLocalMailAttachment,
} from "@/utils/email-cache/local-mail-attachments";
vi.mock("@/utils/email-cache/local-mail-attachment-download", () => ({
  downloadLocalMailAttachment: vi.fn(),
}));
vi.mock("@/utils/email-cache/local-mail-attachments", () => ({
  getLocalMailAttachmentReference: vi.fn(),
  readLocalMailAttachment: vi.fn(),
}));
vi.mock("./download", () => ({
  fetchAttachment: vi.fn(),
  getAttachmentUrl: () => "/attachment",
}));
const MiB = 1024 * 1024;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("document", { visibilityState: "visible" });
  vi.mocked(getLocalMailAttachmentReference).mockImplementation(
    async ({ messageId, attachmentId }) => ({
      emailAccountId: "account",
      threadId: "thread",
      messageId,
      attachmentId,
      revision: "1",
      filename: "image.png",
      mimeType: "image/png",
      reportedBytes: MiB,
    }),
  );
  vi.mocked(readLocalMailAttachment).mockResolvedValue(undefined);
  vi.mocked(downloadLocalMailAttachment).mockResolvedValue({
    status: "ready",
    cached: true,
    blob: new Blob([new Uint8Array(MiB)]),
  });
});
it("shares a three MiB allowance across messages and CID/preview consumers", async () => {
  const session = createOpenedConversationAttachments("account", "thread");
  const results = await Promise.all(
    ["a", "b", "c", "d"].map((id) => session.load(id, "file")),
  );
  expect(results.filter(Boolean)).toHaveLength(3);
  expect(downloadLocalMailAttachment).toHaveBeenCalledTimes(3);
});
it.each([
  "hidden",
  "offline",
  "saveData",
])("allows cached previews but no speculative transfer when %s", async (condition) => {
  if (condition === "hidden")
    vi.stubGlobal("document", { visibilityState: "hidden" });
  if (condition === "offline") vi.stubGlobal("navigator", { onLine: false });
  if (condition === "saveData")
    vi.stubGlobal("navigator", {
      onLine: true,
      connection: { saveData: true },
    });
  const session = createOpenedConversationAttachments("account", "thread");
  expect(await session.load("a", "file")).toBeUndefined();
  vi.mocked(readLocalMailAttachment).mockResolvedValue(new Blob(["cached"]));
  expect(await session.load("a", "file")).toBeInstanceOf(Blob);
  expect(downloadLocalMailAttachment).not.toHaveBeenCalled();
});
it.each([
  undefined,
  2 * MiB,
])("skips unknown and oversized metadata (%s)", async (reportedBytes) => {
  const ref = (await getLocalMailAttachmentReference({
    emailAccountId: "account",
    messageId: "a",
    attachmentId: "file",
  }))!;
  vi.mocked(getLocalMailAttachmentReference).mockResolvedValue({
    ...ref,
    reportedBytes,
  });
  expect(
    await createOpenedConversationAttachments("account", "thread").load(
      "a",
      "file",
    ),
  ).toBeUndefined();
  expect(downloadLocalMailAttachment).not.toHaveBeenCalled();
});
it("releases unused reservations after failures so another preview can run", async () => {
  vi.mocked(downloadLocalMailAttachment).mockRejectedValueOnce(
    new Error("failed"),
  );
  const session = createOpenedConversationAttachments("account", "thread");
  await expect(session.load("a", "file")).rejects.toThrow("failed");
  await Promise.all(["b", "c", "d"].map((id) => session.load(id, "file")));
  expect(downloadLocalMailAttachment).toHaveBeenCalledTimes(4);
});
it("cancels pending work on close and never exposes its response", async () => {
  const started = Promise.withResolvers<AbortSignal>();
  const finish = Promise.withResolvers<void>();
  vi.mocked(downloadLocalMailAttachment).mockImplementation(
    async ({ signal }) => {
      started.resolve(signal!);
      await finish.promise;
      return { status: "ready", cached: true, blob: new Blob(["old"]) };
    },
  );
  const session = createOpenedConversationAttachments("account", "thread");
  const pending = session.load("a", "file");
  const result = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  const signal = await started.promise;
  session.close();
  expect(signal.aborted).toBe(true);
  finish.resolve();
  await result;
});
it("does not fetch an unregistered assistant message unless its foreground session allows it", async () => {
  vi.mocked(getLocalMailAttachmentReference).mockResolvedValue(undefined);
  const attachment = {
    attachmentId: "file",
    filename: "file.png",
    mimeType: "image/png",
    size: 128,
    headers: {
      "content-description": "",
      "content-id": "",
      "content-type": "image/png",
      "content-transfer-encoding": "",
    },
  };
  expect(
    await createOpenedConversationAttachments("account", "thread").load(
      "a",
      "file",
      undefined,
      attachment,
    ),
  ).toBeUndefined();
  expect(downloadLocalMailAttachment).not.toHaveBeenCalled();
});

it("bounds foreground assistant fallback without starting canonical downloads", async () => {
  vi.mocked(getLocalMailAttachmentReference).mockResolvedValue(undefined);
  vi.mocked(fetchAttachment).mockResolvedValue(new Blob(["image"]));
  vi.stubGlobal("navigator", {
    onLine: true,
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        run: () => Promise<unknown>,
      ) => run(),
    },
  });
  const attachment = {
    attachmentId: "file",
    filename: "file.png",
    mimeType: "image/png",
    size: 128,
    headers: {
      "content-description": "",
      "content-id": "",
      "content-type": "image/png",
      "content-transfer-encoding": "",
    },
  };
  const blob = await createOpenedConversationAttachments(
    "account",
    "thread",
    true,
  ).load("a", "file", undefined, attachment);
  expect(await blob?.text()).toBe("image");
  expect(fetchAttachment).toHaveBeenCalledWith(
    expect.objectContaining({ maxBytes: 128, signal: expect.any(AbortSignal) }),
  );
  expect(downloadLocalMailAttachment).not.toHaveBeenCalled();
});
it("starts a fresh preview when a replaced consumer cancels the previous request", async () => {
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  vi.mocked(downloadLocalMailAttachment).mockImplementationOnce(async () => {
    started.resolve();
    await finish.promise;
    return { status: "ready", cached: true, blob: new Blob(["old"]) };
  });
  const session = createOpenedConversationAttachments("account", "thread");
  const controller = new AbortController();
  const first = session.load("a", "file", controller.signal);
  const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
  await started.promise;
  controller.abort();
  const second = session.load("a", "file", new AbortController().signal);
  finish.resolve();
  await rejected;
  await expect(second).resolves.toBeInstanceOf(Blob);
});
