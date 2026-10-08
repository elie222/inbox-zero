import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  type GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { BlobStore } from "@inboxzero/mail-core/ports/blob-store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFilesystemUploadStore } from "./upload-storage/filesystem";
import { createS3UploadStore } from "./upload-storage/s3";
import { createVercelBlobUploadStore } from "./upload-storage/vercel-blob";

const blob = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blob);

const directories: string[] = [];
const bytes = Buffer.from("private attachment");
const checksum = createHash("sha256").update(bytes).digest("hex");

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

for (const adapter of ["filesystem", "s3", "vercel-blob"] as const) {
  describe(`${adapter} upload storage contract`, () => {
    it("keeps staged bytes unreadable until finalized, across adapter instances", async () => {
      const create = await fixture(adapter);
      const writer = create();
      expect(await writer.stage(input())).toEqual({ status: "staged" });
      expect(await create().read("file-1")).toBeNull();
      expect(await create().finalize("file-1")).toEqual({
        blobId: "file-1",
        sizeBytes: bytes.length,
        checksum,
      });
      expect(await collect(await create().read("file-1"))).toEqual(bytes);
    });

    it("returns null for an absent object", async () => {
      const create = await fixture(adapter);
      expect(await create().read("missing")).toBeNull();
      expect(await create().finalize("missing")).toBeNull();
    });

    it.each([
      ["long", Buffer.concat([bytes, Buffer.from("extra")]), "too_large"],
      ["short", bytes.subarray(1), "checksum_mismatch"],
      ["tampered", Buffer.alloc(bytes.length), "checksum_mismatch"],
    ])("rejects %s content and leaves no readable object", async (_name, content, code) => {
      const create = await fixture(adapter);
      expect(await create().stage(input(content))).toEqual({
        status: "rejected",
        code,
      });
      expect(await create().finalize("file-1")).toBeNull();
      expect(await create().read("file-1")).toBeNull();
    });

    it("rejects an oversize admission without reading the source", async () => {
      const create = await fixture(adapter);
      const next = vi.fn();
      expect(
        await create().stage({
          ...input(),
          sizeBytes: 25_000_001,
          bytes: (async function* () {
            next();
            yield bytes;
          })(),
        }),
      ).toEqual({ status: "rejected", code: "too_large" });
      expect(next).not.toHaveBeenCalled();
    });

    it("removes partial data when the source fails", async () => {
      const create = await fixture(adapter);
      await expect(
        create().stage({
          ...input(),
          bytes: (async function* () {
            yield bytes.subarray(0, 2);
            throw new Error("disconnected");
          })(),
        }),
      ).rejects.toThrow("disconnected");
      expect(await create().finalize("file-1")).toBeNull();
    });

    it("supports empty attachments", async () => {
      const create = await fixture(adapter);
      const empty = Buffer.alloc(0);
      expect(
        await create().stage({
          ...input(empty),
          sizeBytes: 0,
          checksum: createHash("sha256").update(empty).digest("hex"),
        }),
      ).toEqual({ status: "staged" });
      expect(await create().finalize("file-1")).toMatchObject({ sizeBytes: 0 });
      expect(await collect(await create().read("file-1"))).toEqual(empty);
    });

    it("deletes staged and finalized bytes without deleting a sibling", async () => {
      const create = await fixture(adapter);
      await create().stage(input());
      await create().stage({ ...input(), blobId: "file-2" });
      await create().finalize("file-2");
      await create().delete("file-1");
      await create().delete("file-1");
      expect(await create().finalize("file-1")).toBeNull();
      expect(await collect(await create().read("file-2"))).toEqual(bytes);
      await create().delete("file-2");
      expect(await create().read("file-2")).toBeNull();
    });

    it("refuses a path escaping storage key", async () => {
      const create = await fixture(adapter);
      await expect(
        create().stage({ ...input(), blobId: "../escape" }),
      ).rejects.toThrow();
      await expect(create().read("../escape")).rejects.toThrow();
      await expect(create().delete("../escape")).rejects.toThrow();
    });
  });
}

it("uses streaming private S3 objects without ACLs or public URLs", async () => {
  const create = await fixture("s3");
  await create().stage(input());
  await create().finalize("file-1");
  expect(await collect(await create().read("file-1"))).toEqual(bytes);
});

it("uses private Vercel Blob reads and writes, with deterministic object paths", async () => {
  const create = await fixture("vercel-blob");
  await create().stage(input());
  await create().finalize("file-1");
  expect(await collect(await create().read("file-1"))).toEqual(bytes);
  for (const [, body, options] of blob.put.mock.calls) {
    expect(body).toBeInstanceOf(Readable);
    expect(options).toMatchObject({
      access: "private",
      addRandomSuffix: false,
    });
  }
  for (const [, options] of blob.get.mock.calls)
    expect(options).toMatchObject({ access: "private", useCache: false });
});

function input(content: Buffer = bytes) {
  return {
    blobId: "file-1",
    bytes: (async function* () {
      yield content.subarray(0, 2);
      yield content.subarray(2);
    })(),
    checksum,
    sizeBytes: bytes.length,
  };
}

async function collect(source: AsyncIterable<Uint8Array> | null) {
  expect(source).not.toBeNull();
  const chunks: Uint8Array[] = [];
  for await (const chunk of source!) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function fixture(
  adapter: "filesystem" | "s3" | "vercel-blob",
): Promise<() => BlobStore> {
  if (adapter === "filesystem") {
    const directory = await mkdtemp(join(tmpdir(), "mail-upload-contract-"));
    directories.push(directory);
    return () => createFilesystemUploadStore(directory);
  }
  const objects = new Map<string, Buffer>();
  if (adapter === "s3") {
    const client = new S3Client({
      region: "us-east-1",
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
    });
    vi.spyOn(client, "send").mockImplementation((async (
      command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand,
    ) => {
      expect(command.input).not.toHaveProperty("ACL");
      if (command instanceof PutObjectCommand) {
        expect(command.input.Body).toBeInstanceOf(Readable);
        const content = await collect(
          command.input.Body as AsyncIterable<Uint8Array>,
        );
        expect(command.input.ContentLength).toBe(content.length);
        objects.set(command.input.Key!, content);
        return {};
      }
      if (command instanceof DeleteObjectCommand) {
        objects.delete(command.input.Key!);
        return {};
      }
      const content = objects.get(command.input.Key!);
      if (!content)
        throw Object.assign(new Error("missing"), {
          name: "NoSuchKey",
          $metadata: { httpStatusCode: 404 },
        });
      return { Body: Readable.from([content]) };
    }) as never);
    return () => createS3UploadStore({ client, bucket: "private-test" });
  }
  blob.put
    .mockReset()
    .mockImplementation(
      async (key: string, source: AsyncIterable<Uint8Array>) => {
        objects.set(key, await collect(source));
        return {
          pathname: key,
          url: `https://test.private.blob.vercel-storage.com/${key}`,
        };
      },
    );
  blob.get.mockReset().mockImplementation(async (key: string) => {
    const content = objects.get(key);
    return content
      ? {
          statusCode: 200,
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue(content);
              controller.close();
            },
          }),
        }
      : null;
  });
  blob.del.mockReset().mockImplementation(async (key: string) => {
    objects.delete(key);
  });
  return () => createVercelBlobUploadStore();
}
