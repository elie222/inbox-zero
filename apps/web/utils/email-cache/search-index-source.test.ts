import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import {
  clearEmailCache,
  clearEmailCacheForAccount,
  getEmailCacheDatabase,
} from "./database";
import { storeLocalMailMessages } from "./local-mail-messages";
import { readSearchIndexThreadPage } from "./search-index-source";
import { readSearchIndexWork } from "./search-index-work";

const identity = {
  emailAccountId: "account-1",
  generation: "generation-1",
  threadId: "thread-1",
};
describe("paged local mail source", () => {
  beforeEach(async () => {
    await clearEmailCache();
    await (await getTestDatabase()).put("searchIndexAccounts", {
      emailAccountId: identity.emailAccountId,
      generation: identity.generation,
    });
  });

  it("combines newer metadata with available bodies without truncating content", async () => {
    const textPlain = `${"body ".repeat(25_000)} searchable ending`;
    await store([{ ...getMessage(), textPlain, textHtml: "<p>Body</p>" }], 500);
    await store([{ ...getMessage(), labelIds: ["STARRED"] }], 800);
    const result = await readSearchIndexThreadPage(await request());
    expect(result?.messages[0]).toMatchObject({
      labelIds: ["STARRED"],
      textPlain,
    });
    const record = await (await getTestDatabase()).get("localMailMessages", [
      identity.emailAccountId,
      "message-1",
    ]);
    expect(record?.data.textHtml).toBe("<p>Body</p>");
    expect(result?.messages[0]).not.toHaveProperty("textHtml");
    expect(record?.byteSize).toBe(
      new Blob([JSON.stringify(record?.data)]).size,
    );
    await store([{ ...getMessage(), textPlain: "older body" }], 400);
    expect(
      (await readSearchIndexThreadPage(await request()))?.messages[0].textPlain,
    ).toBe(textPlain);
  });

  it("pages conversations larger than one index batch without skipping messages", async () => {
    const messages = Array.from({ length: 150 }, (_, i) =>
      getMessage(`message-${String(i).padStart(3, "0")}`),
    );
    await store(messages, 500);
    const current = await request();
    const first = (await readSearchIndexThreadPage(current))!;
    expect(first.messages).toHaveLength(100);
    const second = (await readSearchIndexThreadPage({
      ...current,
      afterMessageId: first.nextMessageId,
    }))!;
    expect(second.messages).toHaveLength(50);
    expect(second.nextMessageId).toBeUndefined();
    expect(
      [...first.messages, ...second.messages].map((message) => message.id),
    ).toEqual(messages.map((message) => message.id));
  });

  it("bounds page bytes and rejects continuation after a concurrent edit", async () => {
    await store(
      [getMessage("first"), getMessage("second")].map((message) => ({
        ...message,
        textPlain: "x".repeat(700_000),
      })),
      500,
    );
    const current = await request();
    const first = (await readSearchIndexThreadPage(current))!;
    expect(first.messages).toHaveLength(1);
    expect(first.nextMessageId).toBe("first");
    await store([{ ...getMessage("first"), labelIds: ["STARRED"] }], 600);
    expect(
      await readSearchIndexThreadPage({
        ...current,
        afterMessageId: first.nextMessageId,
      }),
    ).toBeUndefined();
  });

  it("fences account cleanup and never returns another account's messages", async () => {
    await store([getMessage()], 500);
    const current = await request();
    expect(
      await readSearchIndexThreadPage({
        ...current,
        emailAccountId: "account-2",
      }),
    ).toBeUndefined();
    expect(
      await readSearchIndexThreadPage({
        ...current,
        generation: "old-generation",
      }),
    ).toBeUndefined();
    await clearEmailCacheForAccount(identity.emailAccountId);
    expect(await readSearchIndexThreadPage(current)).toBeUndefined();
    expect(await (await getTestDatabase()).count("localMailMessages")).toBe(0);
  });

  it("retains signed epoch timestamps for imported historical mail", async () => {
    await store([{ ...getMessage(), internalDate: "-1000" }], 500);
    expect(
      (
        await (
          await getTestDatabase()
        ).get("localMailMessages", [identity.emailAccountId, "message-1"])
      )?.receivedAt,
    ).toBe(-1000);
  });

  it("does not retain parser binary fields and keeps empty bodies distinct from missing bodies", async () => {
    await store(
      [
        {
          ...getMessage(),
          textPlain: "",
          raw: "unwanted payload",
        } as ParsedMessage,
      ],
      500,
    );
    const result = (await readSearchIndexThreadPage(await request()))!;
    expect(result.messages[0].textPlain).toBe("");
    expect(result.messages[0]).not.toHaveProperty("raw");
  });
});
async function store(messages: ParsedMessage[], fetchedAt: number) {
  const transaction = (await getTestDatabase()).transaction(
    [
      "searchIndexAccounts",
      "searchIndexWork",
      "localMailMessages",
      "localMailTombstones",
    ],
    "readwrite",
  );
  await storeLocalMailMessages(
    transaction,
    identity.emailAccountId,
    messages,
    fetchedAt,
  );
  await transaction.done;
}
async function request() {
  const item = (await readSearchIndexWork(identity.emailAccountId))!.work[0];
  return { ...identity, token: item.token };
}
function getMessage(id = "message-1"): ParsedMessage {
  return {
    id,
    threadId: identity.threadId,
    headers: {
      date: "2026-01-01",
      from: "sender@example.com",
      to: "user@example.com",
      subject: "Example",
    },
    date: "2026-01-01",
    internalDate: "1767225600000",
    historyId: "1",
    inline: [],
    labelIds: ["INBOX", "UNREAD"],
    subject: "Example",
    snippet: "Example",
  };
}

async function getTestDatabase() {
  const database = await getEmailCacheDatabase();
  if (!database) throw new Error("Email cache database unavailable in test");
  return database;
}
