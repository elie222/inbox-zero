import {
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  type GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MailUploadStore } from "./upload-storage";
import { createFilesystemUploadStore } from "./upload-storage/filesystem";
import { createS3UploadStore } from "./upload-storage/s3";
import { createVercelBlobUploadStore } from "./upload-storage/vercel-blob";

const blob = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blob);

const directories: string[] = [];
const bytes = Buffer.from("private attachment");

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
    it("reads back written bytes across adapter instances", async () => {
      const create = await fixture(adapter);
      await create().put("file-1", source(), bytes.length);
      expect(await collect(await create().read("file-1"))).toEqual(bytes);
    });

    it("returns null for an absent object", async () => {
      const create = await fixture(adapter);
      expect(await create().read("missing")).toBeNull();
    });

    it("supports empty attachments", async () => {
      const create = await fixture(adapter);
      const empty = Buffer.alloc(0);
      await create().put("file-1", source(empty), 0);
      expect(await collect(await create().read("file-1"))).toEqual(empty);
    });

    it("deletes an object idempotently without deleting a sibling", async () => {
      const create = await fixture(adapter);
      await create().put("file-1", source(), bytes.length);
      await create().put("file-2", source(), bytes.length);
      await create().delete("file-1");
      await create().delete("file-1");
      expect(await create().read("file-1")).toBeNull();
      expect(await collect(await create().read("file-2"))).toEqual(bytes);
    });

    it("propagates a failing source", async () => {
      const create = await fixture(adapter);
      await expect(
        create().put(
          "file-1",
          (async function* () {
            yield bytes.subarray(0, 2);
            throw new Error("disconnected");
          })(),
          bytes.length,
        ),
      ).rejects.toThrow("disconnected");
    });
  });
}

it("uses private Vercel Blob reads and writes, with deterministic object paths", async () => {
  const create = await fixture("vercel-blob");
  await create().put("file-1", source(), bytes.length);
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

it("propagates S3 authorization errors instead of treating private objects as missing", async () => {
  const client = new S3Client({ region: "us-east-1" });
  vi.spyOn(client, "send").mockRejectedValue(
    Object.assign(new Error("denied"), { name: "AccessDenied" }),
  );
  await expect(
    createS3UploadStore({ client, bucket: "private-test" }).read("file-1"),
  ).rejects.toThrow("denied");
});

it("fails a private Blob write without falling back to public access", async () => {
  const create = await fixture("vercel-blob");
  blob.put.mockRejectedValueOnce(new Error("private store required"));
  await expect(create().put("file-1", source(), bytes.length)).rejects.toThrow(
    "private store required",
  );
  expect(blob.put).toHaveBeenCalledOnce();
  expect(blob.put.mock.calls[0][2].access).toBe("private");
});

it("filesystem creates owner-only attachment files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mail-upload-mode-"));
  directories.push(directory);
  await createFilesystemUploadStore(directory).put(
    "file-1",
    source(),
    bytes.length,
  );
  expect((await stat(join(directory, "file-1"))).mode & 0o777).toBe(0o600);
});

it("filesystem refuses to overwrite a symlink outside its upload root", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mail-upload-symlink-"));
  directories.push(directory);
  const outside = join(directory, "outside.txt");
  await writeFile(outside, "unchanged");
  await symlink(outside, join(directory, "file-1"));
  const store = createFilesystemUploadStore(directory);
  await expect(store.put("file-1", source(), bytes.length)).rejects.toThrow();
  expect(await readFile(outside, "utf8")).toBe("unchanged");
});

it("filesystem refuses a path-escaping storage key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mail-upload-escape-"));
  directories.push(directory);
  const store = createFilesystemUploadStore(directory);
  await expect(
    store.put("../escape", source(), bytes.length),
  ).rejects.toThrow();
  await expect(store.read("../escape")).rejects.toThrow();
  await expect(store.delete("../escape")).rejects.toThrow();
});

function source(content: Buffer = bytes) {
  return (async function* () {
    yield content.subarray(0, 2);
    yield content.subarray(2);
  })();
}

async function collect(source: AsyncIterable<Uint8Array> | null) {
  expect(source).not.toBeNull();
  const chunks: Uint8Array[] = [];
  for await (const chunk of source!) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function fixture(
  adapter: "filesystem" | "s3" | "vercel-blob",
): Promise<() => MailUploadStore> {
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
