import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runSqliteDriverContract } from "../test-support/driver-contract";
import {
  createNodeSqliteDriver,
  openOrQuarantineNodeMailbox,
  wipeNodeMailbox,
} from "./node-sqlite";
import { createSqliteMailStore } from "./store";

describe("sqlite driver contract", () => {
  it("covers commit, rollback, serialization, blobs, savepoints, and reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-driver-contract-"));
    const path = join(directory, "mailbox.sqlite");
    try {
      const report = await runSqliteDriverContract({
        open: async () => createNodeSqliteDriver(path),
      });
      expect(report.capabilities.jsonEach).toBe(true);
      expect(report.capabilities.jsonExtract).toBe(true);
      expect(report.capabilities.savepoints).toBe(true);
      if (!report.capabilities.fts5) {
        console.warn(
          "FTS5 is unavailable; local search will use LIKE over downloaded bodies and must not be reported as complete indexed search",
        );
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("node sqlite reads", () => {
  it("read the last committed state while a write transaction is still open", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-sqlite-reads-"));
    const driver = createNodeSqliteDriver(join(directory, "mailbox.sqlite"));
    try {
      await driver.write(async (tx) => {
        await tx.exec("CREATE TABLE items(name TEXT NOT NULL)");
        await tx.execute("INSERT INTO items(name) VALUES (?)", ["committed"]);
      });
      let finishWrite = () => {};
      const writeHeld = new Promise<void>((resolve) => {
        finishWrite = resolve;
      });
      const write = driver.write(async (tx) => {
        await tx.execute("INSERT INTO items(name) VALUES (?)", ["pending"]);
        await writeHeld;
        return names(await tx.query("SELECT name FROM items ORDER BY rowid"));
      });

      const read = driver.read(async (tx) =>
        names(await tx.query("SELECT name FROM items ORDER BY rowid")),
      );
      const readDuringWrite = await Promise.race([
        read,
        new Promise((resolve) => setTimeout(resolve, 500, "queued")),
      ]);
      finishWrite();

      expect(readDuringWrite).toEqual(["committed"]);
      expect(await write).toEqual(["committed", "pending"]);
      expect(
        await driver.read(async (tx) =>
          names(await tx.query("SELECT name FROM items ORDER BY rowid")),
        ),
      ).toEqual(["committed", "pending"]);
    } finally {
      await driver.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("node mailbox quarantine", () => {
  it("renames a damaged sqlite file and opens a fresh mailbox", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-sqlite-corrupt-"));
    const path = join(directory, "mailbox.sqlite");
    const garbage = Buffer.from("this is not a sqlite database at all\n");
    await writeFile(path, garbage);
    const opened = await openOrQuarantineNodeMailbox(path);
    expect(opened.quarantinedPaths).toHaveLength(1);
    expect(opened.quarantinedPaths[0]).toMatch(/mailbox\.sqlite\.corrupt-\d+$/);
    expect(await readFile(opened.quarantinedPaths[0]!)).toEqual(garbage);
    const store = await createSqliteMailStore(opened.driver);
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d1" },
      expectedRevision: null,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Recovered",
        editableHtml: "<p>Recovered</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    expect(saved.status).toBe("saved");
    await store.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("does not quarantine a healthy mailbox that already has user work", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-sqlite-healthy-"));
    const path = join(directory, "mailbox.sqlite");
    const first = await createSqliteMailStore(createNodeSqliteDriver(path));
    await first.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await first.saveDraft({
      key: { accountId: "acc-1", draftId: "d1" },
      expectedRevision: null,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Keep",
        editableHtml: "<p>Keep</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    expect(saved.status).toBe("saved");
    await first.close();
    const reopened = await openOrQuarantineNodeMailbox(path);
    expect(reopened.quarantinedPaths).toEqual([]);
    const store = await createSqliteMailStore(reopened.driver);
    expect(
      await store.readDraft({ accountId: "acc-1", draftId: "d1" }),
    ).toMatchObject({
      status: "found",
      content: { subject: "Keep" },
    });
    await store.close();
    await rm(directory, { recursive: true, force: true });
  });
});

describe("wipeNodeMailbox", () => {
  it("removes sqlite, wal, and shm so a reopen has no drafts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-sqlite-wipe-"));
    const path = join(directory, "mailbox.sqlite");
    const store = await createSqliteMailStore(createNodeSqliteDriver(path));
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d1" },
      expectedRevision: null,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Wipe me",
        editableHtml: "<p>Wipe me</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    expect(saved.status).toBe("saved");
    await store.close();
    await wipeNodeMailbox(path);
    expect(await mailboxFileExists(path)).toBe(false);
    expect(await mailboxFileExists(`${path}-wal`)).toBe(false);
    expect(await mailboxFileExists(`${path}-shm`)).toBe(false);
    await expect(wipeNodeMailbox(path)).resolves.toBeUndefined();
    const reopened = await createSqliteMailStore(createNodeSqliteDriver(path));
    expect(
      await reopened.readDraft({ accountId: "acc-1", draftId: "d1" }),
    ).toEqual({ status: "missing" });
    await reopened.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("does not throw for an in-memory path", async () => {
    await expect(wipeNodeMailbox(":memory:")).resolves.toBeUndefined();
  });
});

function names(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => String(row.name));
}

async function mailboxFileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
