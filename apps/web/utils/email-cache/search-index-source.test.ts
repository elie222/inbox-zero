import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import { readSearchIndexThread } from "./search-index-source";

const request = {
  emailAccountId: "account-1",
  generation: "generation-1",
  threadId: "thread-1",
  token: "work-1",
  now: 1000,
};
describe("search index source snapshots", () => {
  beforeEach(async () => {
    await clearEmailCache();
    const database = await getTestDatabase();
    await database.put("searchIndexAccounts", {
      emailAccountId: request.emailAccountId,
      generation: request.generation,
    });
    await database.put("searchIndexWork", {
      emailAccountId: request.emailAccountId,
      threadId: request.threadId,
      token: request.token,
    });
  });

  it("combines current metadata with available bodies without a hidden body truncation", async () => {
    const database = await getTestDatabase();
    const textPlain = `${"body ".repeat(25_000)} searchable ending`;
    const message = getMessage();
    await database.put("threadDetails", {
      emailAccountId: request.emailAccountId,
      threadId: request.threadId,
      variant: "full",
      fetchedAt: 500,
      lastAccessedAt: 1000,
      byteSize: 1,
      data: { thread: { messages: [{ ...message, textPlain }] } },
    });
    await database.put("mailboxMessages", {
      emailAccountId: request.emailAccountId,
      messageId: message.id,
      threadId: request.threadId,
      receivedAt: 1,
      lastAccessedAt: 800,
      data: { ...message, labelIds: ["STARRED"] },
    });
    expect(await readSearchIndexThread(request)).toEqual([
      { ...message, labelIds: ["STARRED"], textPlain },
    ]);
  });

  it("rejects an obsolete token or account generation before returning source content", async () => {
    expect(
      await readSearchIndexThread({ ...request, token: "old-work" }),
    ).toBeUndefined();
    expect(
      await readSearchIndexThread({ ...request, generation: "old-generation" }),
    ).toBeUndefined();
    expect(
      await readSearchIndexThread({ ...request, emailAccountId: "account-2" }),
    ).toBeUndefined();
  });

  it("returns an empty replacement for deleted or evicted threads", async () => {
    expect(await readSearchIndexThread(request)).toEqual([]);
    const database = await getTestDatabase();
    await database.put("threadRows", {
      emailAccountId: request.emailAccountId,
      threadId: request.threadId,
      fetchedAt: -Number.MAX_SAFE_INTEGER,
      lastAccessedAt: 1000,
      data: { messages: [getMessage()] },
    });
    expect(await readSearchIndexThread(request)).toEqual([]);
  });

  it("does not mistake a unified wrapper row for account-owned message data", async () => {
    const database = await getTestDatabase();
    await database.put("threadRows", {
      emailAccountId: request.emailAccountId,
      threadId: request.threadId,
      fetchedAt: 900,
      lastAccessedAt: 1000,
      data: { thread: { messages: [getMessage()] } },
    });
    expect(await readSearchIndexThread(request)).toEqual([]);
  });
});
function getMessage(): ParsedMessage {
  return {
    id: "message-1",
    threadId: request.threadId,
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
