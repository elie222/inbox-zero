import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import { storeLocalMailMessages } from "./local-mail-messages";
import { drainSearchIndexWork } from "./search-index-drain";
import { readSearchIndexWork } from "./search-index-work";
import type { createSearchIndexClient } from "./search-index-client";

const emailAccountId = "account-1";
describe("resumable index drain", () => {
  beforeEach(async () => {
    await clearEmailCache();
    await (await getEmailCacheDatabase())!.put("searchIndexAccounts", {
      emailAccountId,
      generation: "generation-1",
    });
  });
  it("yields at a bounded page count and resumes persisted progress", async () => {
    await store(450);
    const client = makeClient();
    expect(await drainSearchIndexWork(client, emailAccountId)).toEqual({
      status: "ready",
      hasMore: true,
      blockedCount: 0,
    });
    expect(client.indexed.size).toBe(400);
    expect(
      (await readSearchIndexWork(emailAccountId))!.work[0].afterMessageId,
    ).toBe("message-399");
    expect(await drainSearchIndexWork(client, emailAccountId)).toEqual({
      status: "ready",
      hasMore: false,
      blockedCount: 0,
    });
    expect(client.indexed.size).toBe(450);
    expect((await readSearchIndexWork(emailAccountId))!.work).toEqual([]);
  });
  it("restarts from source when the worker lost its replacement state", async () => {
    await store(450);
    await drainSearchIndexWork(makeClient(), emailAccountId);
    const reopened = makeClient();
    await drainSearchIndexWork(reopened, emailAccountId);
    await drainSearchIndexWork(reopened, emailAccountId);
    expect(reopened.indexed.size).toBe(450);
  });
  it("reinitializes an older index generation while its owner remains alive", async () => {
    await store(3);
    const client = makeClient("previous-generation");
    expect(await drainSearchIndexWork(client, emailAccountId)).toEqual({
      status: "ready",
      hasMore: false,
      blockedCount: 0,
    });
    expect(client.indexed.size).toBe(3);
  });

  it("records unsupported content without starving other threads", async () => {
    await store(3);
    await store(1, "thread-2", "other");
    const client = makeClient();
    client.blockedThread = "thread-1";
    expect(await drainSearchIndexWork(client, emailAccountId)).toEqual({
      status: "ready",
      hasMore: true,
      blockedCount: 1,
    });
    expect(await drainSearchIndexWork(client, emailAccountId)).toEqual({
      status: "ready",
      hasMore: false,
      blockedCount: 1,
    });
    expect(client.indexed.size).toBe(1);
    await store(3);
    expect((await readSearchIndexWork(emailAccountId))?.blockedCount).toBe(0);
  });

  it("never acknowledges failed or stale index writes", async () => {
    await store(3);
    const client = makeClient();
    client.failApply = true;
    expect(await drainSearchIndexWork(client, emailAccountId)).toEqual({
      status: "stale",
    });
    expect((await readSearchIndexWork(emailAccountId))!.work).toHaveLength(1);
    expect(client.indexed.size).toBe(0);
  });

  it("keeps storage-limited work pending and resumes after capacity returns", async () => {
    await store(3);
    const original = (await readSearchIndexWork(emailAccountId))!.work;
    const client = makeClient();
    client.storageFull = true;
    expect(await drainSearchIndexWork(client, emailAccountId)).toEqual({
      status: "storage-full",
    });
    const paused = (await readSearchIndexWork(emailAccountId))!;
    expect(paused.work).toEqual(original);
    expect(paused.blockedCount).toBe(0);
    expect(client.indexed.size).toBe(0);
    client.storageFull = false;
    expect(await drainSearchIndexWork(client, emailAccountId)).toMatchObject({
      status: "ready",
      hasMore: false,
    });
    expect(client.indexed.size).toBe(3);
  });
});
function makeClient(previousGeneration?: string) {
  let initialized = !!previousGeneration;
  let generation = previousGeneration ?? "generation-1";
  let revision = 0;
  let token: string | undefined;
  const client: {
    indexed: Set<string>;
    failApply: boolean;
    storageFull: boolean;
    blockedThread?: string;
    request: ReturnType<typeof createSearchIndexClient>["request"];
  } = {
    indexed: new Set<string>(),
    failApply: false,
    storageFull: false,
    async request(_scope, command) {
      if (command.command === "state")
        return {
          result: initialized ? { generation, revision } : null,
        };
      if (command.command === "reset") {
        if (
          command.request.expectedGeneration !==
          (initialized ? generation : null)
        )
          return { result: false };
        generation = command.request.generation;
        initialized = true;
        revision = 0;
        return { result: true };
      }
      if (command.command === "replacementState")
        return { result: token ? { token } : null };
      if (command.command === "apply") {
        if (client.storageFull) return { error: "storage-full" };
        if (command.request.replacement?.threadId === client.blockedThread)
          return { error: "document-too-large" };
        if (client.failApply || command.request.expectedRevision !== revision)
          return { result: false };
        revision = command.request.revision;
        token =
          command.request.replacement?.phase === "finish"
            ? undefined
            : command.request.replacement?.token;
        for (const message of command.request.upserts)
          client.indexed.add(message.id);
        return { result: true };
      }
      return { error: "unavailable" };
    },
  };
  return client;
}
async function store(count: number, threadId = "thread-1", prefix = "message") {
  const transaction = (await getEmailCacheDatabase())!.transaction(
    [
      "searchIndexAccounts",
      "searchIndexWork",
      "localMailMessages",
      "localMailTombstones",

      "localMailAttachmentFiles",
      "localMailAttachmentJobs",
      "localMailThreadProtection",
    ],
    "readwrite",
  );
  const messages = Array.from(
    { length: count },
    (_, i): ParsedMessage => ({
      id: `${prefix}-${String(i).padStart(3, "0")}`,
      threadId,
      headers: {
        from: "sender@example.com",
        to: "user@example.com",
        date: "2026-01-01",
        subject: "Example",
      },
      date: "2026-01-01",
      internalDate: "1767225600000",
      historyId: "1",
      inline: [],
      labelIds: ["INBOX"],
      subject: "Example",
      snippet: "Example",
    }),
  );
  await storeLocalMailMessages(
    transaction,
    emailAccountId,
    messages,
    Date.now(),
  );
  await transaction.done;
}
