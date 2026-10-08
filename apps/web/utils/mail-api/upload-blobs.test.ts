import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMailUploadTable } from "@/__tests__/mocks/mail-upload.mock";
import { getMailUploadStore } from "./upload-storage";
import prisma from "@/utils/__mocks__/prisma";
import {
  admitAccountUpload,
  prepareAccountUploadDeletion,
  cancelAccountUpload,
  deleteAccountUploads,
  deleteStaleMailUploads,
  holdAccountUploads,
  inspectAccountUpload,
  putAccountUploadContent,
  readAccountUploads,
  releaseAccountUploadHolds,
  setAccountUploadHold,
} from "./upload-blobs";

vi.mock("@/utils/prisma");

const accountId = "acc-1";
const bytes = Buffer.from("staged blob", "utf8");
const checksum = createHash("sha256").update(bytes).digest("hex");

describe("mail upload staging", () => {
  beforeEach(() => {
    installMailUploadTable(prisma);
  });

  it("keeps only metadata in Postgres and writes bytes to an opaque account-scoped key", async () => {
    await admit("file-1");
    await stage("file-1", bytes);
    const row = await prisma.mailUpload.findUnique({
      where: {
        emailAccountId_blobId: { emailAccountId: accountId, blobId: "file-1" },
      },
    });
    expect(row).not.toHaveProperty("content");
    expect(row!.storageKey).not.toContain("file-1");
    expect(row!.storageKey).not.toContain("note.txt");
    expect(await getMailUploadStore().read(row!.storageKey)).not.toBeNull();
  });

  it("does not publish a stale stream after an identical re-admission", async () => {
    await admit("file-1");
    const result = await putAccountUploadContent(
      accountId,
      "file-1",
      (async function* () {
        yield bytes.subarray(0, 2);
        await admit("file-1");
        yield bytes.subarray(2);
      })(),
    );
    expect(result).toEqual({ status: "missing" });
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "missing",
    });
  });

  it.each([
    "cancel",
    "sent",
    "retention",
  ])("retries a failed %s object deletion from retention without failing the action", async (path) => {
    await admit("file-1");
    await stage("file-1", bytes);
    const row = await prisma.mailUpload.findUnique({
      where: {
        emailAccountId_blobId: { emailAccountId: accountId, blobId: "file-1" },
      },
    });
    vi.spyOn(getMailUploadStore(), "delete").mockRejectedValueOnce(
      new Error("storage unavailable"),
    );
    if (path === "cancel")
      await expect(
        cancelAccountUpload(accountId, "file-1"),
      ).resolves.toMatchObject({ status: "deleted" });
    else if (path === "sent")
      await expect(
        deleteAccountUploads(accountId, ["file-1"]),
      ).resolves.toBeUndefined();
    else
      await expect(
        deleteStaleMailUploads(new Date(Date.now() + 1000)),
      ).resolves.toBe(0);
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "missing",
    });
    expect(await getMailUploadStore().read(row!.storageKey)).not.toBeNull();
    expect(await deleteStaleMailUploads(new Date(Date.now() - 1000))).toBe(1);
    expect(await getMailUploadStore().read(row!.storageKey)).toBeNull();
  });

  it("keeps stored bytes until account deletion commits, then deletes only that account's objects", async () => {
    await admit("file-1");
    await stage("file-1", bytes);
    const row = await prisma.mailUpload.findUnique({
      where: {
        emailAccountId_blobId: { emailAccountId: accountId, blobId: "file-1" },
      },
    });
    await admitAccountUpload("other-account", {
      uploadId: "file-1",
      checksum,
      sizeBytes: bytes.byteLength,
      filename: "note.txt",
      contentType: "text/plain",
    });
    await putAccountUploadContent(
      "other-account",
      "file-1",
      (async function* () {
        yield bytes;
      })(),
    );
    const cleanup = await prepareAccountUploadDeletion([accountId]);
    expect(await getMailUploadStore().read(row!.storageKey)).not.toBeNull();
    await prisma.mailUpload.deleteMany({
      where: { emailAccountId: accountId },
    });
    await cleanup();
    expect(await getMailUploadStore().read(row!.storageKey)).toBeNull();
    expect(await readAccountUploads("other-account", ["file-1"])).toMatchObject(
      { status: "ok" },
    );
  });

  it("account deletion also attempts retired generations whose earlier cleanup failed", async () => {
    await admit("file-1");
    await stage("file-1", bytes);
    const row = await prisma.mailUpload.findUnique({
      where: {
        emailAccountId_blobId: { emailAccountId: accountId, blobId: "file-1" },
      },
    });
    vi.spyOn(getMailUploadStore(), "delete").mockRejectedValueOnce(
      new Error("storage unavailable"),
    );
    await admit("file-1");
    const cleanup = await prepareAccountUploadDeletion([accountId]);
    await prisma.mailUpload.deleteMany({
      where: { emailAccountId: accountId },
    });
    await cleanup();
    expect(await getMailUploadStore().read(row!.storageKey)).toBeNull();
  });

  it("does not fail an unheld cancel when metadata cleanup fails", async () => {
    await admit("file-1");
    await stage("file-1", bytes);
    prisma.mailUpload.findMany.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    await expect(cancelAccountUpload(accountId, "file-1")).resolves.toEqual({
      status: "deleted",
      blobId: "file-1",
    });
  });

  it("does not fail account deletion when object cleanup or key lookup fails", async () => {
    await admit("file-1");
    await stage("file-1", bytes);
    const cleanup = await prepareAccountUploadDeletion([accountId]);
    vi.spyOn(getMailUploadStore(), "delete").mockRejectedValueOnce(
      new Error("storage unavailable"),
    );
    await expect(cleanup()).resolves.toBeUndefined();
    prisma.mailUploadObject.findMany.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    const unavailableCleanup = await prepareAccountUploadDeletion([accountId]);
    await expect(unavailableCleanup()).resolves.toBeUndefined();
  });

  it("hides storage details when SDK writes or streaming reads fail", async () => {
    await admit("file-1");
    vi.spyOn(getMailUploadStore(), "put").mockRejectedValueOnce(
      new Error("storage-key secret-test-credential"),
    );
    await expect(stage("file-1", bytes)).rejects.toThrow(
      "Failed to store attachment",
    );
    await stage("file-1", bytes);
    vi.spyOn(getMailUploadStore(), "read").mockResolvedValueOnce(
      (async function* () {
        yield bytes.subarray(0, 2);
        throw new Error("storage-key secret-test-credential");
      })(),
    );
    await expect(readAccountUploads(accountId, ["file-1"])).rejects.toThrow(
      "Failed to read attachment",
    );
  });

  it("retention keeps a failed orphan cleanup available for the next sweep", async () => {
    vi.useFakeTimers();
    try {
      await admit("file-1");
      await stage("file-1", bytes);
      const row = await prisma.mailUpload.findUnique({
        where: {
          emailAccountId_blobId: {
            emailAccountId: accountId,
            blobId: "file-1",
          },
        },
      });
      await prisma.mailUpload.deleteMany({
        where: { emailAccountId: accountId },
      });
      const store = getMailUploadStore();
      const remove = store.delete.bind(store);
      const spy = vi.spyOn(store, "delete").mockImplementation(async (key) => {
        if (key === row!.storageKey) throw new Error("temporarily unavailable");
        await remove(key);
      });
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
      await deleteStaleMailUploads(new Date(0));
      expect(await store.read(row!.storageKey)).not.toBeNull();
      spy.mockRestore();
      await deleteStaleMailUploads(new Date(0));
      expect(await store.read(row!.storageKey)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stages content admitted by an earlier request", async () => {
    await admit("file-1");
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "missing",
    });

    expect(await stage("file-1", bytes)).toMatchObject({
      status: "staged",
      blobId: "file-1",
      sizeBytes: bytes.byteLength,
      checksum,
    });
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "ready",
      blobId: "file-1",
    });
    expect(await readAccountUploads(accountId, ["file-1"])).toEqual({
      status: "ok",
      uploads: [
        {
          filename: "note.txt",
          contentType: "text/plain",
          content: bytes.toString("base64"),
          size: bytes.byteLength,
        },
      ],
    });
  });

  it.each([
    "admission",
    "content",
  ])("retention retries a failed deletion after key replacement by %s", async (path) => {
    vi.useFakeTimers();
    try {
      await admit("file-1");
      await stage("file-1", bytes);
      const row = await prisma.mailUpload.findUnique({
        where: {
          emailAccountId_blobId: {
            emailAccountId: accountId,
            blobId: "file-1",
          },
        },
      });
      vi.spyOn(getMailUploadStore(), "delete").mockRejectedValueOnce(
        new Error("storage unavailable"),
      );
      if (path === "admission") await admit("file-1");
      else await stage("file-1", bytes);
      expect(await getMailUploadStore().read(row!.storageKey)).not.toBeNull();
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
      await deleteStaleMailUploads(new Date(0));
      expect(await getMailUploadStore().read(row!.storageKey)).toBeNull();
      if (path === "content")
        expect(await readAccountUploads(accountId, ["file-1"])).toMatchObject({
          status: "ok",
        });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    "object",
    "lookup",
  ])("retention recovers account objects after failed %s cleanup", async (failure) => {
    vi.useFakeTimers();
    try {
      await admit("file-1");
      await stage("file-1", bytes);
      const row = await prisma.mailUpload.findUnique({
        where: {
          emailAccountId_blobId: {
            emailAccountId: accountId,
            blobId: "file-1",
          },
        },
      });
      if (failure === "lookup")
        prisma.mailUploadObject.findMany.mockRejectedValueOnce(
          new Error("database unavailable"),
        );
      const cleanup = await prepareAccountUploadDeletion([accountId]);
      await prisma.mailUpload.deleteMany({
        where: { emailAccountId: accountId },
      });
      const store = getMailUploadStore();
      const remove = store.delete.bind(store);
      const spy = vi.spyOn(store, "delete");
      if (failure === "object")
        spy.mockImplementation(async (key) => {
          if (key === row!.storageKey) throw new Error("storage unavailable");
          await remove(key);
        });
      await cleanup();
      spy.mockRestore();
      expect(await getMailUploadStore().read(row!.storageKey)).not.toBeNull();
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
      await deleteStaleMailUploads(new Date(0));
      expect(await getMailUploadStore().read(row!.storageKey)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("retention recovers an abandoned writer after its metadata was replaced", async () => {
    vi.useFakeTimers();
    try {
      await admit("file-1");
      await stage("file-1", bytes);
      const row = await prisma.mailUpload.findUnique({
        where: {
          emailAccountId_blobId: {
            emailAccountId: accountId,
            blobId: "file-1",
          },
        },
      });
      await admit("file-1");
      // A worker can finish its object write after replacement/cancel deleted
      // its old key, then crash before its final metadata compare-and-swap.
      const store = getMailUploadStore();
      await store.put(
        row!.storageKey,
        (async function* () {
          yield bytes;
        })(),
        bytes.length,
      );
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
      await deleteStaleMailUploads(new Date(0));
      expect(await store.read(row!.storageKey)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("retention sweeps more abandoned uploads and retired keys than fit in one batch", async () => {
    vi.useFakeTimers();
    try {
      const uploadIds = Array.from({ length: 250 }, (_, i) => `file-${i}`);
      for (const uploadId of uploadIds) await admit(uploadId);
      expect(await deleteStaleMailUploads(new Date(Date.now() + 1000))).toBe(
        uploadIds.length,
      );
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
      await deleteStaleMailUploads(new Date(0));
      expect(
        await prisma.mailUploadObject.findMany({ where: {} }),
      ).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retention preserves a live send hold even when upload timestamps are old", async () => {
    await admit("file-1");
    await stage("file-1", bytes);
    await holdAccountUploads(accountId, ["file-1"]);
    await deleteStaleMailUploads(new Date(Date.now() + 1000));
    expect(await readAccountUploads(accountId, ["file-1"])).toMatchObject({
      status: "ok",
    });
  });

  it("does not log storage keys or SDK credentials on cleanup failure", async () => {
    await admit("file-1");
    await stage("file-1", bytes);
    const row = await prisma.mailUpload.findUnique({
      where: {
        emailAccountId_blobId: { emailAccountId: accountId, blobId: "file-1" },
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      vi.spyOn(getMailUploadStore(), "delete").mockRejectedValueOnce(
        new Error(`${row!.storageKey} secret-test-credential`),
      );
      await cancelAccountUpload(accountId, "file-1");
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).not.toContain(row!.storageKey);
      expect(logged).not.toContain("secret-test-credential");
    } finally {
      warn.mockRestore();
    }
  });

  it("rejects content that was never admitted", async () => {
    expect(await stage("file-1", bytes)).toEqual({ status: "missing" });
  });

  it("rejects content that does not match the admitted checksum", async () => {
    await admit("file-1");
    expect(await stage("file-1", Buffer.from("staged bloc", "utf8"))).toEqual({
      status: "rejected",
      code: "checksum_mismatch",
    });
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "missing",
    });
  });

  it("does not stage content into an upload that was re-admitted mid-stream", async () => {
    await admit("file-1");
    const replacement = Buffer.from("a replacement blob", "utf8");

    const staged = await putAccountUploadContent(
      accountId,
      "file-1",
      (async function* () {
        yield bytes.subarray(0, 4);
        // The composer restarted this upload with a different file while the
        // first request was still streaming its bytes in.
        await admitAccountUpload(accountId, {
          uploadId: "file-1",
          checksum: createHash("sha256").update(replacement).digest("hex"),
          sizeBytes: replacement.byteLength,
          filename: "replacement.txt",
          contentType: "text/plain",
        });
        yield bytes.subarray(4);
      })(),
    );

    expect(staged).toEqual({ status: "missing" });
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "missing",
    });
  });

  it("restarts an upload re-admitted under the same id", async () => {
    await admit("file-1");
    await stage("file-1", bytes);
    await holdAccountUploads(accountId, ["file-1"]);

    await admit("file-1");
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "missing",
    });

    expect(await stage("file-1", bytes)).toMatchObject({
      status: "staged",
      blobId: "file-1",
    });
    // The hold the first attempt took went with it, so a cancel takes the
    // restarted upload instead of reporting it in use.
    expect(await cancelAccountUpload(accountId, "file-1")).toEqual({
      status: "deleted",
      blobId: "file-1",
    });
  });

  it("rejects content longer than the admitted size", async () => {
    await admit("file-1");
    expect(
      await stage("file-1", Buffer.concat([bytes, Buffer.from("extra")])),
    ).toEqual({ status: "rejected", code: "too_large" });
  });

  it("rejects content shorter than the admitted size", async () => {
    await admit("file-1");
    expect(await stage("file-1", bytes.subarray(1))).toEqual({
      status: "rejected",
      code: "checksum_mismatch",
    });
  });

  it("stages an empty attachment", async () => {
    const empty = Buffer.alloc(0);
    await admitAccountUpload(accountId, {
      uploadId: "file-1",
      checksum: createHash("sha256").update(empty).digest("hex"),
      sizeBytes: 0,
      filename: "empty.txt",
      contentType: "text/plain",
    });
    expect(await stage("file-1", empty)).toMatchObject({ status: "staged" });
    expect(await readAccountUploads(accountId, ["file-1"])).toMatchObject({
      status: "ok",
      uploads: [{ filename: "empty.txt", content: "", size: 0 }],
    });
  });

  it("rejects tampered content even when storage stops reading at the declared size", async () => {
    await admit("file-1");
    const store = getMailUploadStore();
    const put = store.put.bind(store);
    // Like a server that acknowledges as soon as all declared bytes arrive,
    // this transport never asks the source whether it has ended.
    vi.spyOn(store, "put").mockImplementation(async (key, source, size) => {
      const chunks: Uint8Array[] = [];
      let received = 0;
      for await (const chunk of source) {
        chunks.push(chunk);
        received += chunk.byteLength;
        if (received === size) break;
      }
      await put(
        key,
        (async function* () {
          yield* chunks;
        })(),
        size,
      );
    });
    expect(await stage("file-1", Buffer.alloc(bytes.length))).toEqual({
      status: "rejected",
      code: "checksum_mismatch",
    });
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "missing",
    });
    expect(await stage("file-1", bytes)).toMatchObject({ status: "staged" });
  });

  it("does not stage an upload storage returned from without consuming", async () => {
    await admit("file-1");
    vi.spyOn(getMailUploadStore(), "put").mockResolvedValueOnce();
    await expect(stage("file-1", bytes)).rejects.toThrow(
      "Failed to store attachment",
    );
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "missing",
    });
  });

  it("removes partial bytes when the upload stream fails", async () => {
    await admit("file-1");
    await expect(
      putAccountUploadContent(
        accountId,
        "file-1",
        (async function* () {
          yield bytes.subarray(0, 2);
          throw new Error("disconnected");
        })(),
      ),
    ).rejects.toThrow("Failed to store attachment");
    const row = await prisma.mailUpload.findUnique({
      where: {
        emailAccountId_blobId: { emailAccountId: accountId, blobId: "file-1" },
      },
    });
    expect(await getMailUploadStore().read(row!.storageKey)).toBeNull();
  });

  it("rejects an admission larger than the upload limit", async () => {
    expect(
      await admitAccountUpload(accountId, {
        uploadId: "file-1",
        checksum,
        sizeBytes: 25_000_001,
        filename: "note.txt",
        contentType: "text/plain",
      }),
    ).toEqual({ status: "invalid" });
  });

  it("rejects a path-escaping upload id", async () => {
    expect(
      await admitAccountUpload(accountId, {
        uploadId: "../escape",
        checksum,
        sizeBytes: bytes.byteLength,
        filename: "note.txt",
        contentType: "text/plain",
      }),
    ).toEqual({ status: "invalid" });
    expect(await inspectAccountUpload(accountId, "../escape")).toEqual({
      status: "invalid",
    });
  });

  it("keeps a held upload until the hold is released", async () => {
    await admit("file-1");
    await stage("file-1", bytes);
    expect(await setAccountUploadHold(accountId, "file-1", true)).toEqual({
      status: "held",
      blobId: "file-1",
    });
    expect(await cancelAccountUpload(accountId, "file-1")).toEqual({
      status: "in_use",
      blobId: "file-1",
    });

    await releaseAccountUploadHolds(accountId, ["file-1"]);
    expect(await cancelAccountUpload(accountId, "file-1")).toEqual({
      status: "deleted",
      blobId: "file-1",
    });
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "missing",
    });
  });

  it("refuses to hold an upload whose content never arrived", async () => {
    await admit("file-1");
    expect(await setAccountUploadHold(accountId, "file-1", true)).toEqual({
      status: "missing",
    });
    await holdAccountUploads(accountId, ["file-1"]);
    expect(await cancelAccountUpload(accountId, "file-1")).toEqual({
      status: "deleted",
      blobId: "file-1",
    });
  });

  it("reports the missing blob when a send's attachment is gone", async () => {
    await admit("file-1");
    await stage("file-1", bytes);
    await deleteAccountUploads(accountId, ["file-1"]);
    expect(await readAccountUploads(accountId, ["file-1"])).toEqual({
      status: "missing",
      blobId: "file-1",
    });
  });

  it("survives a database failure while cleaning up after a send", async () => {
    await admit("file-1");
    await stage("file-1", bytes);
    prisma.mailUpload.updateMany.mockRejectedValueOnce(new Error("no db"));
    prisma.mailUpload.deleteMany.mockRejectedValueOnce(new Error("no db"));

    // A send that already left the mailbox must not be reported as failed
    // because its staged bytes could not be swept up, but the release still has
    // to say it did not land so the hold endpoint can pass that on.
    await expect(
      releaseAccountUploadHolds(accountId, ["file-1"]),
    ).resolves.toBe(false);
    await expect(
      deleteAccountUploads(accountId, ["file-1"]),
    ).resolves.toBeUndefined();
  });

  it("does not read another account's uploads", async () => {
    await admit("file-1");
    await stage("file-1", bytes);
    expect(await readAccountUploads("acc-2", ["file-1"])).toEqual({
      status: "missing",
      blobId: "file-1",
    });
  });

  it("scopes upload writes, holds, inspection and deletion to the account", async () => {
    await admit("file-1");
    await stage("file-1", bytes);
    expect(await inspectAccountUpload("acc-2", "file-1")).toEqual({
      status: "missing",
    });
    expect(
      await putAccountUploadContent(
        "acc-2",
        "file-1",
        (async function* () {
          yield bytes;
        })(),
      ),
    ).toEqual({ status: "missing" });
    expect(await setAccountUploadHold("acc-2", "file-1", true)).toEqual({
      status: "missing",
    });
    await cancelAccountUpload("acc-2", "file-1");
    await deleteAccountUploads("acc-2", ["file-1"]);
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "ready",
      blobId: "file-1",
    });

    await setAccountUploadHold(accountId, "file-1", true);
    await releaseAccountUploadHolds("acc-2", ["file-1"]);
    expect(await cancelAccountUpload(accountId, "file-1")).toEqual({
      status: "in_use",
      blobId: "file-1",
    });
  });

  it("allows cancellation after an abandoned hold expires", async () => {
    vi.useFakeTimers();
    try {
      await admit("file-1");
      await stage("file-1", bytes);
      await setAccountUploadHold(accountId, "file-1", true);
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
      expect(await cancelAccountUpload(accountId, "file-1")).toEqual({
        status: "deleted",
        blobId: "file-1",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("deletes uploads a composer abandoned", async () => {
    await admit("file-1");
    await stage("file-1", bytes);
    expect(await deleteStaleMailUploads(new Date(Date.now() - 1000))).toBe(0);
    expect(await deleteStaleMailUploads(new Date(Date.now() + 1000))).toBe(1);
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "missing",
    });
  });
});

function admit(uploadId: string) {
  return admitAccountUpload(accountId, {
    uploadId,
    checksum,
    sizeBytes: bytes.byteLength,
    filename: "note.txt",
    contentType: "text/plain",
  });
}

function stage(uploadId: string, content: Buffer) {
  return putAccountUploadContent(
    accountId,
    uploadId,
    (async function* () {
      yield content;
    })(),
  );
}
