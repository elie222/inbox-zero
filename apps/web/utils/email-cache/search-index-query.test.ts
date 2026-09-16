// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import { activateMailSync } from "./mail-activation";
import { storeLocalMailMessages } from "./local-mail-messages";
import { querySearchIndex } from "./search-index-query";
import type { MailMutation } from "./mail-mutations";
import type { ParsedMessage } from "@/utils/types";

vi.mock("./search-index-service", () => ({
  cleanupSearchIndex: vi.fn().mockResolvedValue(undefined),
}));
const request = {
  query: "needle",
  accounts: [{ id: "account-1", labels: [] }],
  mutations: [],
};
beforeEach(async () => {
  await clearEmailCache();
  activateMailSync("account-1");
  const db = (await getEmailCacheDatabase())!;
  await db.put("searchIndexAccounts", {
    emailAccountId: "account-1",
    generation: "generation-1",
  });
});

describe("persistent search hydration", () => {
  it("rejects deleted and changed index hits using current canonical content", async () => {
    await store("changed", "different");
    await store("match", "needle");
    const client = {
      request: vi.fn().mockResolvedValue({
        result: {
          status: "ready",
          revision: 1,
          messages: [
            { id: "deleted", threadId: "thread-deleted", rowId: "3" },
            { id: "changed", threadId: "thread-changed", rowId: "2" },
            { id: "match", threadId: "thread-match", rowId: "1" },
          ],
          nextCursor: "1",
        },
      }),
    };
    const result = await querySearchIndex(client, request);
    expect(result?.threads.map((item) => item.thread.id)).toEqual([
      "thread-match",
    ]);
    expect(result?.cursors).toEqual({ "account-1": "1" });
  });
  it("includes dirty messages not yet present in the index and excludes other accounts", async () => {
    await store("new", "needle");
    const client = {
      request: vi.fn().mockResolvedValue({
        result: { status: "ready", revision: 0, messages: [] },
      }),
    };
    const result = await querySearchIndex(client, request);
    expect(result?.threads.map((item) => item.thread.id)).toEqual([
      "thread-new",
    ]);
    expect(result?.coverage).toBe("indexing");
  });
  it("finds newly starred messages absent from disk matches and suppresses pending trash", async () => {
    await store("match", "needle");
    await (await getEmailCacheDatabase())!.clear("searchIndexWork");
    const client = {
      request: vi.fn().mockResolvedValue({
        result: { status: "ready", revision: 1, messages: [] },
      }),
    };
    const mutation = {
      id: "mutation",
      emailAccountId: "account-1",
      threadId: "thread-match",
      messageIds: ["match"],
      createdAt: 1,
      kind: "set_starred_state",
      starred: true,
    } as MailMutation;
    expect(
      (
        await querySearchIndex(client, {
          ...request,
          query: "needle is:starred",
          mutations: [mutation],
        })
      )?.threads,
    ).toHaveLength(1);
    expect(
      (
        await querySearchIndex(client, {
          ...request,
          mutations: [{ ...mutation, kind: "trash" } as MailMutation],
        })
      )?.threads,
    ).toHaveLength(0);
  });
  it("returns to the existing cache path while source seeding is incomplete", async () => {
    await (await getEmailCacheDatabase())!.put("searchIndexAccounts", {
      emailAccountId: "account-1",
      generation: "generation-1",
      seed: { store: "mailboxMessages" },
    });
    const client = { request: vi.fn() };
    expect(await querySearchIndex(client, request)).toBeUndefined();
    expect(client.request).not.toHaveBeenCalled();
  });
  it("rejects an account generation replaced during the worker request", async () => {
    const client = {
      request: vi.fn().mockImplementation(async () => {
        await (await getEmailCacheDatabase())!.put("searchIndexAccounts", {
          emailAccountId: "account-1",
          generation: "generation-2",
        });
        return { result: { status: "ready", revision: 1, messages: [] } };
      }),
    };
    expect(await querySearchIndex(client, request)).toBeUndefined();
  });
});

async function store(id: string, textPlain: string) {
  const db = (await getEmailCacheDatabase())!;
  const tx = db.transaction(
    [
      "searchIndexAccounts",
      "searchIndexWork",
      "localMailMessages",
      "localMailTombstones",
    ],
    "readwrite",
  );
  const message: ParsedMessage = {
    id,
    threadId: `thread-${id}`,
    subject: "Subject",
    snippet: "",
    headers: {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Subject",
      date: "2026-01-01",
    },
    date: "2026-01-01",
    historyId: "1",
    inline: [],
    textPlain,
  };
  await storeLocalMailMessages(tx, "account-1", [message], 1);
  await tx.done;
}
