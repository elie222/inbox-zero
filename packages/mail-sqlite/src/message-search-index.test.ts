import { describe, expect, it } from "vitest";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import type { SqliteDriver } from "./driver";
import {
  deleteAccountSearchIndex,
  indexMessageContent,
  migrateMessageSearchKeys,
} from "./message-search-index";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

describe("message search index", () => {
  it("replaces a message's search row when its content is indexed again", async () => {
    const { driver, close } = await mailbox(["acc-1"]);
    await driver.write(async (tx) => {
      await indexMessageContent(tx, key("acc-1", "m1"), "quarterly invoice");
      await indexMessageContent(tx, key("acc-1", "m1"), "updated receipt");
    });

    expect(await matches(driver, "invoice")).toEqual([]);
    expect(await matches(driver, "receipt")).toEqual(["acc-1/m1"]);
    await close();
  });

  it("removes one account's search rows and keeps another's", async () => {
    const { driver, close } = await mailbox(["acc-1", "acc-2"]);
    await driver.write(async (tx) => {
      await indexMessageContent(tx, key("acc-1", "m1"), "shared term");
      await indexMessageContent(tx, key("acc-2", "m1"), "shared term");
      await deleteAccountSearchIndex(tx, "acc-1");
    });

    expect(await matches(driver, "shared")).toEqual(["acc-2/m1"]);
    await close();
  });

  it("backfills keys for rows indexed before the key table existed", async () => {
    const { driver, close } = await mailbox(["acc-1"]);
    await driver.write(async (tx) => {
      await indexMessageContent(tx, key("acc-1", "m1"), "legacy invoice");
      await tx.exec(
        "DROP TABLE message_fts_keys; DELETE FROM schema_migrations WHERE id = 4;",
      );
      await migrateMessageSearchKeys(tx);
      await indexMessageContent(tx, key("acc-1", "m1"), "updated receipt");
    });

    expect(await matches(driver, "invoice")).toEqual([]);
    expect(await matches(driver, "receipt")).toEqual(["acc-1/m1"]);
    await close();
  });
});

async function mailbox(accountIds: string[]) {
  const driver = createNodeSqliteDriver();
  const store = await createSqliteMailStore(driver);
  for (const accountId of accountIds) {
    await store.ensureAccount({
      accountId,
      provider: "google",
      generation: "g1",
    });
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId, generation: "g1" },
        requestId: "bootstrap",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: [messagePatch(accountId, "m1")],
        requiredHydration: [],
        roundComplete: true,
      },
    });
  }
  return { driver, close: () => store.close() };
}

async function matches(driver: SqliteDriver, term: string) {
  const rows = await driver.read((tx) =>
    tx.query(
      "SELECT account_id, message_id FROM message_fts WHERE message_fts MATCH ? ORDER BY account_id",
      [term],
    ),
  );
  return rows.map((row) => `${row.account_id}/${row.message_id}`);
}

function key(accountId: string, messageId: string) {
  return { accountId, messageId };
}

function messagePatch(
  accountId: string,
  messageId: string,
): Extract<ProviderChange, { kind: "message_patch" }> {
  return {
    kind: "message_patch",
    key: { accountId, messageId },
    reference: {
      provider: "google",
      messageId,
      conversationId: "c1",
      version: "1",
    },
    fields: {
      subject: "Subject",
      preview: "Preview",
      from: "ada@example.com",
      to: ["me@example.com"],
      cc: [],
      receivedAtMs: 1000,
      read: false,
      starred: false,
      folderId: "inbox",
      inboxSection: null,
      labelIds: ["INBOX"],
      categoryIds: [],
      roles: ["inbox"],
      hasAttachments: false,
    },
  };
}
