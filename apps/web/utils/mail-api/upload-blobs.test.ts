import { describe, expect, it } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  accountMailUploadDirectory,
  cancelAccountUpload,
  inspectAccountUpload,
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
});
