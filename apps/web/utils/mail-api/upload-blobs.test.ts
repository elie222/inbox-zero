import { describe, expect, it } from "vitest";
import { mkdir, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  accountMailUploadDirectory,
  collectStaleMailUploads,
} from "./upload-blobs";
import { createFileBlobStore } from "@inboxzero/mail-sqlite/blob-store";

describe("collectStaleMailUploads", () => {
  it("deletes old orphans in the account upload directory and keeps live ids", async () => {
    const accountId = "acc-collect-stale";
    const directory = accountMailUploadDirectory(accountId);
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    const store = createFileBlobStore(directory);
    const bytes = Buffer.from("blob", "utf8");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    for (const blobId of ["orphan-old", "orphan-fresh", "keep-draft"]) {
      expect(
        await store.stage({
          blobId,
          bytes: (async function* () {
            yield bytes;
          })(),
          checksum,
          sizeBytes: bytes.byteLength,
        }),
      ).toEqual({ status: "staged" });
      expect(await store.finalize(blobId)).toMatchObject({ blobId });
    }
    const nowMs = Date.now();
    await utimes(
      join(directory, "orphan-old"),
      new Date(nowMs - 10_000),
      new Date(nowMs - 10_000),
    );
    await utimes(
      join(directory, "keep-draft"),
      new Date(nowMs - 10_000),
      new Date(nowMs - 10_000),
    );
    expect(
      await collectStaleMailUploads({
        accountId,
        keepIds: ["keep-draft"],
        nowMs,
        graceMs: 1000,
      }),
    ).toEqual({ deleted: ["orphan-old"] });
    expect(await store.read("orphan-old")).toBeNull();
    expect(await store.read("orphan-fresh")).not.toBeNull();
    expect(await store.read("keep-draft")).not.toBeNull();
    await rm(directory, { recursive: true, force: true });
  });
});
