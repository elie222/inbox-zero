import { describe, expect, it } from "vitest";
import {
  DESKTOP_STORAGE_FREE_BYTES,
  desktopStoragePressure,
} from "./storage-pressure";

describe("desktopStoragePressure", () => {
  it("is true when the mailbox volume has less than the free-space floor", async () => {
    let probed: string | undefined;
    await expect(
      desktopStoragePressure("/tmp/mail/mailbox.sqlite", {
        statfs: async (path) => {
          probed = path;
          return { bavail: 1, bsize: 4096 };
        },
      }),
    ).resolves.toBe(true);
    expect(probed).toBe("/tmp/mail");
  });

  it("is false when there is enough free space or the probe is unusable", async () => {
    await expect(
      desktopStoragePressure("/tmp/mail/mailbox.sqlite", {
        statfs: async () => ({
          bavail: DESKTOP_STORAGE_FREE_BYTES / 4096 + 1,
          bsize: 4096,
        }),
      }),
    ).resolves.toBe(false);
    await expect(
      desktopStoragePressure("/tmp/mail/mailbox.sqlite", {
        statfs: async () => {
          throw new Error("ENOENT");
        },
      }),
    ).resolves.toBe(false);
    await expect(
      desktopStoragePressure("/tmp/mail/mailbox.sqlite", {
        statfs: async () => ({ bavail: Number.NaN, bsize: 4096 }),
      }),
    ).resolves.toBe(false);
    await expect(
      desktopStoragePressure("/tmp/mail/mailbox.sqlite", {
        statfs: async () => ({ bavail: 1, bsize: 0 }),
      }),
    ).resolves.toBe(false);
  });
});
