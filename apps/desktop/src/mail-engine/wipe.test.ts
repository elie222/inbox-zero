import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { closeAndWipeDesktopMailbox } from "./wipe";

describe("closeAndWipeDesktopMailbox", () => {
  it("closes the owner before deleting sqlite, wal, and shm", async () => {
    const directory = await mkdtemp(join(tmpdir(), "desktop-wipe-"));
    const databasePath = join(directory, "mailbox.sqlite");
    await writeFile(databasePath, "mailbox");
    await writeFile(`${databasePath}-wal`, "wal");
    await writeFile(`${databasePath}-shm`, "shm");
    const order: string[] = [];
    await closeAndWipeDesktopMailbox({
      owner: {
        async close() {
          order.push("close");
          await stat(databasePath);
        },
      },
      databasePath,
    });
    order.push("wiped");
    expect(order).toEqual(["close", "wiped"]);
    await expect(stat(databasePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(`${databasePath}-wal`)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(`${databasePath}-shm`)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await rm(directory, { recursive: true, force: true });
  });

  it("still wipes when close rejects", async () => {
    const directory = await mkdtemp(join(tmpdir(), "desktop-wipe-close-"));
    const databasePath = join(directory, "mailbox.sqlite");
    await writeFile(databasePath, "mailbox");
    await closeAndWipeDesktopMailbox({
      owner: {
        async close() {
          throw new Error("already closed");
        },
      },
      databasePath,
    });
    await expect(stat(databasePath)).rejects.toMatchObject({ code: "ENOENT" });
    await rm(directory, { recursive: true, force: true });
  });
});
