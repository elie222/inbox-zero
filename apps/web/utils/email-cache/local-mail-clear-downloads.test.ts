import "fake-indexeddb/auto";
import { beforeEach, expect, it, vi } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import { clearLocalMailDownloads } from "./local-mail-clear-downloads";

vi.mock("./mail-activation", () => ({
  isMailSyncActivated: () => false,
  clearMailActivation: vi.fn(),
}));
vi.mock("./search-index-client", () => ({
  createSearchIndexClient: () => ({
    cleanupAccount: async () => ({ result: true }),
    close: vi.fn(),
  }),
}));
const scope = {
  emailAccountId: "account",
  generation: "generation",
  now: 100,
  withStorageLock: async <T>(run: () => Promise<T>) => run(),
};
beforeEach(async () => {
  await clearEmailCache();
  const db = (await getEmailCacheDatabase())!;
  await db.put("searchIndexAccounts", {
    emailAccountId: scope.emailAccountId,
    generation: scope.generation,
  });
});
it("does not remove a draft or its downloaded source", async () => {
  const db = (await getEmailCacheDatabase())!;
  await seed("message");
  await db.put("replyDrafts", {
    emailAccountId: "account",
    threadId: "thread",
    messageId: "message",
    revision: 1,
    content: { text: "unsent" } as never,
    updatedAt: 1,
  });
  expect(await clearLocalMailDownloads(scope)).toMatchObject({
    status: "blocked",
    reason: "drafts",
  });
  expect(await db.count("localMailMessages")).toBe(1);
  expect(await db.count("replyDrafts")).toBe(1);
});
it("resumes bounded deletion and only acknowledges index cleanup after source is gone", async () => {
  const db = (await getEmailCacheDatabase())!;
  for (let i = 0; i < 3; i++) await seed(`message-${i}`);
  expect(await clearLocalMailDownloads({ ...scope, limit: 1 })).toMatchObject({
    status: "progress",
  });
  expect(await db.count("localMailMessages")).toBe(3);
  await clearLocalMailDownloads({ ...scope, limit: 1 });
  expect(await db.count("localMailMessages")).toBe(2);
  let result: Awaited<ReturnType<typeof clearLocalMailDownloads>> | undefined;
  for (let i = 0; i < 30; i++) {
    result = await clearLocalMailDownloads({ ...scope, limit: 1 });
    if (result.status === "cleared") break;
  }
  expect(result).toMatchObject({ status: "cleared" });
  expect(await db.count("localMailMessages")).toBe(0);
  expect((await db.get("searchIndexAccounts", "account"))?.generation).not.toBe(
    "generation",
  );
  expect(await db.get("localMailEvictionJobs", "account")).toBeUndefined();
});
it("preserves a new draft created between batches and reports partial clearing", async () => {
  const db = (await getEmailCacheDatabase())!;
  await seed("message");
  await clearLocalMailDownloads(scope);
  await db.put("replyDrafts", {
    emailAccountId: "account",
    threadId: "thread",
    messageId: "message",
    revision: 1,
    content: { text: "unsent" } as never,
    updatedAt: 1,
  });
  expect(await clearLocalMailDownloads(scope)).toMatchObject({
    status: "blocked",
    reason: "drafts",
  });
  expect(await db.count("localMailMessages")).toBe(1);
});
async function seed(id: string) {
  const db = (await getEmailCacheDatabase())!;
  const data = getMockMessage({ id, threadId: "thread" });
  await db.put("localMailMessages", {
    emailAccountId: "account",
    messageId: id,
    threadId: "thread",
    receivedAt: 1,
    fetchedAt: 1,
    lastAccessedAt: 1,
    byteSize: 100,
    data: {
      ...data,
      date: data.date ?? "",
      historyId: data.historyId ?? "",
      inline: data.inline ?? [],
    },
  });
}
