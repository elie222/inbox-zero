import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMailUploadTable } from "@/__tests__/mocks/mail-upload.mock";
import prisma from "@/utils/__mocks__/prisma";
import {
  admitAccountUpload,
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

  it("rejects content longer than the admitted size", async () => {
    await admit("file-1");
    expect(
      await stage("file-1", Buffer.concat([bytes, Buffer.from("extra")])),
    ).toEqual({ status: "rejected", code: "too_large" });
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

  it("does not read another account's uploads", async () => {
    await admit("file-1");
    await stage("file-1", bytes);
    expect(await readAccountUploads("acc-2", ["file-1"])).toEqual({
      status: "missing",
      blobId: "file-1",
    });
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
