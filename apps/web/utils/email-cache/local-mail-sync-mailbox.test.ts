import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import { readSyncedMailboxThreads } from "./mailbox";

const account = "account";
const now = Date.now();
const day = 86_400_000;

beforeEach(async () => {
  await clearEmailCache();
  const database = (await getEmailCacheDatabase())!;
  await database.put("searchIndexAccounts", {
    emailAccountId: account,
    generation: "generation",
  });
  await database.put("mailboxMessages", {
    emailAccountId: account,
    messageId: "message",
    threadId: "thread",
    receivedAt: now - day,
    lastAccessedAt: now,
    data: getMockMessage({
      id: "message",
      threadId: "thread",
      labelIds: ["INBOX"],
      internalDate: String(now - day),
    }),
  });
  await database.put("localMailSyncStates", {
    emailAccountId: account,
    generation: "generation",
    fence: 1,
    strategy: "account-history",
    retentionAfter: 0,
    retainedAfter: now - 60 * day,
    snapshotBefore: now,
    nextWindowSize: 120 * day,
    excludedFolderIds: [],
    folders: {},
    discoveryGeneration: 1,
    discoveryComplete: false,
    nextAttemptAt: now,
    lastSyncedAt: now,
  });
});

describe("local sync mailbox projection coverage", () => {
  it("renders partial local messages without needing a legacy provider cursor", async () => {
    const snapshot = await readSyncedMailboxThreads({
      emailAccountId: account,
      query: { type: "inbox" },
    });
    expect(snapshot?.threads.map((thread) => thread.id)).toEqual(["thread"]);
    expect(snapshot?.complete).toBe(false);
    expect(snapshot?.syncedAt).toBe(now);
    expect(
      await (await getEmailCacheDatabase())!.get("mailboxSyncStates", account),
    ).toBeUndefined();
  });

  it("reports complete coverage only after replay and hides completeness during reset recovery", async () => {
    const database = (await getEmailCacheDatabase())!;
    const state = (await database.get("localMailSyncStates", account))!;
    await database.put("localMailSyncStates", {
      ...state,
      coverage: { after: now - 60 * day, before: now },
    });
    expect(
      (
        await readSyncedMailboxThreads({
          emailAccountId: account,
          query: { type: "inbox" },
        })
      )?.complete,
    ).toBe(true);
    await database.put("localMailSyncStates", {
      ...state,
      coverage: { after: now - 60 * day, before: now },
      recovering: true,
    });
    expect(
      (
        await readSyncedMailboxThreads({
          emailAccountId: account,
          query: { type: "inbox" },
        })
      )?.complete,
    ).toBe(false);
  });

  it("does not trust checkpoints from an older source generation", async () => {
    await (await getEmailCacheDatabase())!.put("searchIndexAccounts", {
      emailAccountId: account,
      generation: "replacement-generation",
    });
    expect(
      await readSyncedMailboxThreads({
        emailAccountId: account,
        query: { type: "inbox" },
      }),
    ).toBeUndefined();
  });
});
