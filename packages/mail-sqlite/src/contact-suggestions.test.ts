import { afterEach, describe, expect, it } from "vitest";
import type { MailStore } from "@inboxzero/mail-core/ports/mail-store";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";
import { migrateMailbox } from "./migrations";

const stores: MailStore[] = [];
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
});

describe("local contact suggestions", () => {
  it("weights sent-to (including own sender without Sent) above received-only, then frequency and recency", async () => {
    const { store } = await setup();
    await write(store, [
      message("s1", "me@example.com", ["Sent Friend <sent@example.com>"]),
      message("s2", "me@example.com", [
        "Frequent Friend <frequent@example.com>",
      ]),
      message("s3", "me@example.com", [
        "Frequent Friend <frequent@example.com>",
      ]),
      message("old", "me@example.com", ["Old Friend <old@example.com>"], 1),
      ...Array.from({ length: 10 }, (_, i) =>
        message(`r${i}`, "Incoming Friend <incoming@example.com>", [
          "me@example.com",
        ]),
      ),
      message("alias", "alias@example.com", [
        "Alias Friend <alias-friend@example.com>",
      ]),
      message(
        "sent-role",
        "unknown@example.com",
        ["Role Friend <role@example.com>"],
        Date.now(),
        ["sent"],
      ),
    ]);
    const results = await search(store, "friend");
    expect(results.map((c) => c.emailAddress)).toEqual([
      "frequent@example.com",
      "alias-friend@example.com",
      "sent@example.com",
      "role@example.com",
      "old@example.com",
      "incoming@example.com",
    ]);
  });

  it("matches email/name prefixes and word prefixes case-insensitively, dedupes and chooses the most frequent nonempty name", async () => {
    const { store } = await setup();
    await write(store, [
      message("1", "Jane Cooper <JANE@example.com>"),
      message("2", "Jane Cooper <jane@example.com>"),
      message("3", "J. C. <jane@example.com>"),
      message("4", "jane@example.com"),
    ]);
    expect(await search(store, "COO")).toEqual([
      { emailAddress: "jane@example.com", name: "Jane Cooper" },
    ]);
    expect(await search(store, "JANE@")).toHaveLength(1);
    expect(await search(store, "ane")).toEqual([]);
    expect(await search(store, "   ")).toEqual([]);
  });

  it("excludes own/alias, automated and selected addresses; caps results and scopes accounts", async () => {
    const { store } = await setup();
    const addresses = [
      "me",
      "alias",
      "noreply",
      "no-reply",
      "do-not-reply",
      "donotreply",
      "notifications",
      "mailer-daemon",
      "postmaster",
      "bounce",
      "bounce+123",
    ];
    await write(store, [
      ...addresses.map((a, i) =>
        message(`bad${i}`, `Friend <${a}@example.com>`),
      ),
      ...Array.from({ length: 12 }, (_, i) =>
        message(`good${i}`, `Friend <person${i}@example.com>`),
      ),
    ]);
    const results = await search(store, "friend", ["PERSON0@example.com"]);
    expect(results).toHaveLength(8);
    expect(
      results.every(
        (c) =>
          c.emailAddress.startsWith("person") &&
          c.emailAddress !== "person0@example.com",
      ),
    ).toBe(true);
    await store.ensureAccount({
      accountId: "other",
      provider: "google",
      generation: "g",
    });
    await write(
      store,
      [
        message(
          "other",
          "Other Friend <other@example.com>",
          [],
          Date.now(),
          [],
          "other",
        ),
      ],
      "other",
    );
    expect((await search(store, "other")).length).toBe(0);
  });

  it("updates incrementally without double counting, removes deleted interactions and purges all derived rows", async () => {
    const { store, driver } = await setup();
    await write(store, [
      message("1", "me@example.com", ["Old Friend <old@example.com>"]),
    ]);
    await write(store, [
      message("1", "me@example.com", ["New Friend <new@example.com>"]),
    ]);
    expect(await search(store, "old")).toEqual([]);
    expect(await search(store, "new")).toHaveLength(1);
    await write(store, [
      {
        kind: "message_deleted",
        evidence: "provider-confirmed",
        key: { accountId: "a", messageId: "1" },
      },
    ]);
    expect(await search(store, "new")).toEqual([]);
    await write(store, [message("2", "Purge Friend <purge@example.com>")]);
    await store.purgeAccount("a");
    expect(await search(store, "friend")).toEqual([]);
    for (const table of [
      "contact_interactions",
      "contact_stats",
      "contact_tokens",
      "contact_indexed_messages",
    ]) {
      expect(
        await driver.read((tx) =>
          tx.query(`SELECT * FROM ${table} WHERE account_id = 'a'`),
        ),
      ).toEqual([]);
    }
  });

  it("learns self aliases from Sent, indexes cc, and clears contacts on generation changes", async () => {
    const { store } = await setup();
    const sent = message(
      "alias-sent",
      "Own Alias <sent-alias@example.com>",
      ["Recipient <recipient@example.com>"],
      1_800_000_000_000,
      ["sent"],
    );
    if (sent.kind !== "message_patch") throw new Error("expected message");
    sent.fields.cc = ["Cc Friend <cc@example.com>"];
    await write(store, [
      sent,
      message("alias-in", "Own Alias <sent-alias@example.com>"),
    ]);
    expect(await search(store, "own")).toEqual([]);
    expect(await search(store, "cc")).toEqual([
      { emailAddress: "cc@example.com", name: "Cc Friend" },
    ]);
    await store.ensureAccount({
      accountId: "a",
      provider: "google",
      generation: "new",
    });
    expect(await search(store, "recipient")).toEqual([]);
  });

  it("updates the best name and recency when the latest named interaction is deleted", async () => {
    const { store } = await setup();
    await write(store, [
      message("1", "Jane Cooper <jane@example.com>", [], 1),
      message("2", "Jane Cooper <jane@example.com>"),
      message("3", "Janet Smith <jane@example.com>", [], 2),
    ]);
    expect((await search(store, "jane"))[0].name).toBe("Jane Cooper");
    await write(store, [
      {
        kind: "message_deleted",
        evidence: "provider-confirmed",
        key: { accountId: "a", messageId: "2" },
      },
    ]);
    expect((await search(store, "janet"))[0].name).toBe("Janet Smith");
    expect(await search(store, "jane%")).toEqual([]);
  });

  it("migrates existing stores without eager indexing, backfills in bounded batches and survives repeat migration", async () => {
    const { store, driver } = await setup();
    await write(
      store,
      Array.from({ length: 205 }, (_, i) =>
        message(`${i}`, `Backfill Friend <person${i}@example.com>`),
      ),
    );
    await driver.write(async (tx) => {
      for (const table of [
        "contact_interactions",
        "contact_stats",
        "contact_tokens",
        "contact_indexed_messages",
      ])
        await tx.exec(`DROP TABLE ${table}`);
      await tx.exec("DELETE FROM schema_migrations WHERE id = 10");
      await migrateMailbox(tx, "ignored");
      await migrateMailbox(tx, "ignored");
    });
    expect(await search(store, "backfill")).toEqual([]);
    expect(await store.indexContactBacklog()).toEqual({ remaining: true });
    expect(
      await driver.read((tx) =>
        tx.query("SELECT COUNT(*) AS n FROM contact_indexed_messages"),
      ),
    ).toEqual([{ n: 100 }]);
    while ((await store.indexContactBacklog()).remaining) {
      /* engine-paced batches */
    }
    expect(await search(store, "backfill")).toHaveLength(8);
    await write(store, [
      {
        kind: "message_deleted",
        evidence: "provider-confirmed",
        key: { accountId: "a", messageId: "0" },
      },
    ]);
    expect(await search(store, "person0@")).toEqual([]);
  });
});

async function setup() {
  const driver = createNodeSqliteDriver();
  const store = await createSqliteMailStore(driver);
  stores.push(store);
  await store.ensureAccount({
    accountId: "a",
    provider: "google",
    generation: "g",
  });
  return { store, driver };
}
function search(store: MailStore, query: string, excludeEmails: string[] = []) {
  return store.readContactSuggestions({
    accountId: "a",
    query,
    ownAddresses: ["me@example.com", "alias@example.com"],
    excludeEmails,
  });
}
async function write(
  store: MailStore,
  changes: ProviderChange[],
  accountId = "a",
) {
  expect(
    await store.applyHydration({
      session: { accountId, generation: "g" },
      requestId: "test",
      changes,
      bodies: [],
    }),
  ).toMatchObject({ status: "committed" });
}
function message(
  id: string,
  from: string,
  to: string[] = ["me@example.com"],
  receivedAtMs = 1_800_000_000_000,
  roles: ("sent" | "inbox")[] = [],
  accountId = "a",
): ProviderChange {
  return {
    kind: "message_patch",
    key: { accountId, messageId: id },
    reference: {
      provider: "google",
      messageId: id,
      conversationId: id,
      version: "1",
    },
    fields: {
      from,
      to,
      cc: [],
      receivedAtMs,
      roles,
      subject: "",
      preview: "",
      read: true,
      starred: false,
      folderId: null,
      labelIds: [],
      categoryIds: [],
      hasAttachments: false,
    },
  };
}
