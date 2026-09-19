import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createNodeSqliteDriver,
  openOrQuarantineNodeMailbox,
} from "./node-sqlite";
import { createSqliteMailStore } from "./store";

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
