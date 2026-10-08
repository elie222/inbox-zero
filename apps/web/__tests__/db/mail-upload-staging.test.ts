import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFilesystemUploadStore } from "@/utils/mail-api/upload-storage/filesystem";
import { getMailUploadStore } from "@/utils/mail-api/upload-storage";
import { createHash } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  admitAccountUpload,
  prepareAccountUploadDeletion,
  cancelAccountUpload,
  deleteAccountUploads,
  holdAccountUploads,
  inspectAccountUpload,
  putAccountUploadContent,
  readAccountUploads,
  releaseAccountUploadHolds,
} from "@/utils/mail-api/upload-blobs";
import prisma from "@/utils/prisma";

vi.mock("@/utils/mail-api/upload-storage", () => ({
  getMailUploadStore: vi.fn(),
}));

const bytes = Buffer.from("a staged attachment", "utf8");
const checksum = createHash("sha256").update(bytes).digest("hex");

// Admitting an upload, uploading its content, and sending it are three separate
// requests that can land on three different servers, so the bytes have to live
// somewhere all of them can read.
describe.skipIf(!process.env.RUN_DB_TESTS)(
  "mail upload staging (real database)",
  () => {
    const email = "mail-upload-staging-test@example.com";
    let emailAccountId: string;
    let directory: string;
    beforeAll(async () => {
      directory = await mkdtemp(join(tmpdir(), "mail-upload-db-test-"));
      vi.mocked(getMailUploadStore).mockImplementation(() =>
        createFilesystemUploadStore(directory),
      );
    });

    beforeEach(async () => {
      await prisma.user.deleteMany({ where: { email } });
      const user = await prisma.user.create({ data: { email } });
      const account = await prisma.account.create({
        data: {
          userId: user.id,
          provider: "google",
          providerAccountId: email,
          type: "oauth",
        },
      });
      const emailAccount = await prisma.emailAccount.create({
        data: { email, userId: user.id, accountId: account.id },
      });
      emailAccountId = emailAccount.id;
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email } });
      await rm(directory, { recursive: true, force: true });
    });

    it("reads back content admitted and uploaded by earlier requests", async () => {
      await admit("file-1");
      await stage("file-1", bytes);
      const row = await prisma.mailUpload.findUniqueOrThrow({
        where: { emailAccountId_blobId: { emailAccountId, blobId: "file-1" } },
      });
      expect(row).not.toHaveProperty("content");
      expect(await getMailUploadStore().read(row.storageKey)).not.toBeNull();

      expect(await readAccountUploads(emailAccountId, ["file-1"])).toEqual({
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

    it("preserves inline image metadata through database storage", async () => {
      await admitAccountUpload(emailAccountId, {
        uploadId: "inline-1",
        checksum,
        sizeBytes: bytes.byteLength,
        filename: "image.png",
        contentType: "image/png",
        disposition: "inline",
        contentId: "image-1@example.test",
      });
      await stage("inline-1", bytes);
      expect(
        await readAccountUploads(emailAccountId, ["inline-1"]),
      ).toMatchObject({
        status: "ok",
        uploads: [{ disposition: "inline", contentId: "image-1@example.test" }],
      });
    });

    it("does not write stale content over a replacement admission", async () => {
      await admit("file-1");
      const replacement = Buffer.from("a replacement attachment", "utf8");
      const result = await putAccountUploadContent(
        emailAccountId,
        "file-1",
        (async function* () {
          yield bytes.subarray(0, 4);
          await admitAccountUpload(emailAccountId, {
            uploadId: "file-1",
            checksum: createHash("sha256").update(replacement).digest("hex"),
            sizeBytes: replacement.byteLength,
            filename: "replacement.txt",
            contentType: "text/plain",
          });
          yield bytes.subarray(4);
        })(),
      );
      expect(result).toEqual({ status: "missing" });
      expect(await inspectAccountUpload(emailAccountId, "file-1")).toEqual({
        status: "missing",
      });
      expect(await stage("file-1", replacement)).toMatchObject({
        status: "staged",
      });
    });

    it("rejects content that does not match what was admitted", async () => {
      await admit("file-1");
      // Same length as the admitted bytes, so this reaches the checksum
      // comparison rather than stopping at the size guard.
      const tampered = Buffer.from("a staged attachmenX", "utf8");
      expect(await stage("file-1", tampered)).toEqual({
        status: "rejected",
        code: "checksum_mismatch",
      });
      expect(await inspectAccountUpload(emailAccountId, "file-1")).toEqual({
        status: "missing",
      });
    });

    it("keeps an upload a send still holds, and drops it once released", async () => {
      await admit("file-1");
      await stage("file-1", bytes);
      await holdAccountUploads(emailAccountId, ["file-1"]);

      expect(await cancelAccountUpload(emailAccountId, "file-1")).toEqual({
        status: "in_use",
        blobId: "file-1",
      });

      await releaseAccountUploadHolds(emailAccountId, ["file-1"]);
      expect(await cancelAccountUpload(emailAccountId, "file-1")).toEqual({
        status: "deleted",
        blobId: "file-1",
      });
      expect(await readAccountUploads(emailAccountId, ["file-1"])).toEqual({
        status: "missing",
        blobId: "file-1",
      });
    });

    it("drops an account's uploads when the account is deleted", async () => {
      await admit("file-1");
      await stage("file-1", bytes);

      const row = await prisma.mailUpload.findUniqueOrThrow({
        where: { emailAccountId_blobId: { emailAccountId, blobId: "file-1" } },
      });
      const cleanup = await prepareAccountUploadDeletion([emailAccountId]);
      await prisma.user.deleteMany({ where: { email } });
      await cleanup();
      expect(await getMailUploadStore().read(row.storageKey)).toBeNull();

      expect(await prisma.mailUpload.count({ where: { emailAccountId } })).toBe(
        0,
      );
    });

    it("deletes only the uploads a confirmed send used", async () => {
      await admit("file-sent");
      await stage("file-sent", bytes);
      await admit("file-kept");
      await stage("file-kept", bytes);

      await deleteAccountUploads(emailAccountId, ["file-sent"]);

      expect(await inspectAccountUpload(emailAccountId, "file-sent")).toEqual({
        status: "missing",
      });
      expect(await inspectAccountUpload(emailAccountId, "file-kept")).toEqual({
        status: "ready",
        blobId: "file-kept",
      });
    });

    function admit(uploadId: string) {
      return admitAccountUpload(emailAccountId, {
        uploadId,
        checksum,
        sizeBytes: bytes.byteLength,
        filename: "note.txt",
        contentType: "text/plain",
      });
    }

    function stage(uploadId: string, content: Buffer) {
      return putAccountUploadContent(
        emailAccountId,
        uploadId,
        (async function* () {
          yield content;
        })(),
      );
    }
  },
);
