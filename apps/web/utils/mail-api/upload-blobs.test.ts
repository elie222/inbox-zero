import { describe, expect, it } from "vitest";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  accountMailUploadDirectory,
  admitAccountUpload,
  cancelAccountUpload,
  deleteAccountUploadDirectory,
  holdAccountUploads,
  inspectAccountUpload,
  putAccountUploadContent,
  releaseAccountUploadHolds,
} from "./upload-blobs";
import { createFileBlobStore } from "@inboxzero/mail-sqlite/blob-store";

describe("account upload inspect and cancel", () => {
  it("reports ready then missing after cancel", async () => {
    const accountId = "acc-upload-inspect";
    const directory = accountMailUploadDirectory(accountId);
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    const store = createFileBlobStore(directory);
    const bytes = Buffer.from("blob", "utf8");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    expect(
      await store.stage({
        blobId: "file-1",
        bytes: (async function* () {
          yield bytes;
        })(),
        checksum,
        sizeBytes: bytes.byteLength,
      }),
    ).toEqual({ status: "staged" });
    expect(await store.finalize("file-1")).toMatchObject({ blobId: "file-1" });
    expect(
      await store.stage({
        blobId: "file-sibling",
        bytes: (async function* () {
          yield bytes;
        })(),
        checksum,
        sizeBytes: bytes.byteLength,
      }),
    ).toEqual({ status: "staged" });
    expect(await store.finalize("file-sibling")).toMatchObject({
      blobId: "file-sibling",
    });
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "ready",
      blobId: "file-1",
    });
    expect(await cancelAccountUpload(accountId, "file-1")).toEqual({
      status: "deleted",
      blobId: "file-1",
    });
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "missing",
    });
    expect(await cancelAccountUpload(accountId, "file-1")).toEqual({
      status: "deleted",
      blobId: "file-1",
    });
    expect(await inspectAccountUpload(accountId, "../escape")).toEqual({
      status: "invalid",
    });
    expect(await cancelAccountUpload(accountId, "../escape")).toEqual({
      status: "invalid",
    });
    expect(await inspectAccountUpload(accountId, "file-sibling")).toEqual({
      status: "ready",
      blobId: "file-sibling",
    });
    await rm(directory, { recursive: true, force: true });
  });

  it("refuses cancel while a send holds the blob", async () => {
    const accountId = "acc-upload-hold";
    const directory = accountMailUploadDirectory(accountId);
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    const store = createFileBlobStore(directory);
    const bytes = Buffer.from("blob", "utf8");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    expect(
      await store.stage({
        blobId: "file-1",
        bytes: (async function* () {
          yield bytes;
        })(),
        checksum,
        sizeBytes: bytes.byteLength,
      }),
    ).toEqual({ status: "staged" });
    expect(await store.finalize("file-1")).toMatchObject({ blobId: "file-1" });
    await holdAccountUploads(accountId, ["file-1", "../escape"]);
    expect(await cancelAccountUpload(accountId, "file-1")).toEqual({
      status: "in_use",
      blobId: "file-1",
    });
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "ready",
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
    await rm(directory, { recursive: true, force: true });
  });

  it("admits metadata then streams content into a ready blob", async () => {
    const accountId = "acc-upload-content";
    const directory = accountMailUploadDirectory(accountId);
    await rm(directory, { recursive: true, force: true });
    const bytes = Buffer.from("streamed", "utf8");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    expect(
      await admitAccountUpload(accountId, {
        uploadId: "file-1",
        checksum,
        sizeBytes: bytes.byteLength,
        filename: "note.txt",
        contentType: "text/plain",
      }),
    ).toEqual({ status: "admitted", blobId: "file-1" });
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "missing",
    });
    expect(
      await putAccountUploadContent(
        accountId,
        "file-1",
        (async function* () {
          yield bytes;
        })(),
      ),
    ).toEqual({
      status: "staged",
      blobId: "file-1",
      sizeBytes: bytes.byteLength,
      checksum,
    });
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "ready",
      blobId: "file-1",
    });
    expect(
      await putAccountUploadContent(
        accountId,
        "file-1",
        (async function* () {
          yield Buffer.from("wrong", "utf8");
        })(),
      ),
    ).toEqual({ status: "rejected", code: "checksum_mismatch" });
    expect(
      await putAccountUploadContent(
        accountId,
        "missing",
        (async function* () {
          yield bytes;
        })(),
      ),
    ).toEqual({ status: "missing" });
    expect(
      await putAccountUploadContent(
        accountId,
        "../escape",
        (async function* () {
          yield bytes;
        })(),
      ),
    ).toEqual({ status: "invalid" });
    expect(
      await admitAccountUpload(accountId, {
        uploadId: "file-small",
        checksum,
        sizeBytes: 1,
        filename: "small.txt",
        contentType: "text/plain",
      }),
    ).toEqual({ status: "admitted", blobId: "file-small" });
    expect(
      await putAccountUploadContent(
        accountId,
        "file-small",
        (async function* () {
          yield bytes;
        })(),
      ),
    ).toEqual({ status: "rejected", code: "too_large" });
    await rm(directory, { recursive: true, force: true });
  });

  it("removes held and unheld blobs for one account without touching another", async () => {
    const accountId = "acc-upload-delete";
    const siblingId = "acc-upload-keep";
    const directory = accountMailUploadDirectory(accountId);
    const siblingDirectory = accountMailUploadDirectory(siblingId);
    await rm(directory, { recursive: true, force: true });
    await rm(siblingDirectory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await mkdir(siblingDirectory, { recursive: true });
    const store = createFileBlobStore(directory);
    const bytes = Buffer.from("blob", "utf8");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    expect(
      await store.stage({
        blobId: "file-1",
        bytes: (async function* () {
          yield bytes;
        })(),
        checksum,
        sizeBytes: bytes.byteLength,
      }),
    ).toEqual({ status: "staged" });
    expect(await store.finalize("file-1")).toMatchObject({ blobId: "file-1" });
    await holdAccountUploads(accountId, ["file-1"]);
    await writeFile(join(siblingDirectory, "keep.txt"), "keep");
    await deleteAccountUploadDirectory(accountId);
    await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "missing",
    });
    await expect(
      readFile(join(siblingDirectory, "keep.txt"), "utf8"),
    ).resolves.toBe("keep");
    await rm(siblingDirectory, { recursive: true, force: true });
  });

  it("does not delete the uploads root for an escaping account id", async () => {
    const siblingDirectory = accountMailUploadDirectory(
      "acc-upload-escape-keep",
    );
    await mkdir(siblingDirectory, { recursive: true });
    const sentinel = join(siblingDirectory, "keep.txt");
    await writeFile(sentinel, "keep");
    await deleteAccountUploadDirectory("");
    await deleteAccountUploadDirectory("..");
    await deleteAccountUploadDirectory("../inbox-zero-mail-uploads");
    await expect(
      deleteAccountUploadDirectory("acc-upload-missing"),
    ).resolves.toBeUndefined();
    await expect(readFile(sentinel, "utf8")).resolves.toBe("keep");
    await rm(siblingDirectory, { recursive: true, force: true });
  });
});
