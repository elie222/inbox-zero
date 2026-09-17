// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { installMailCacheStorageTestEnvironment } from "./optional-cache-write.test-helpers";
import { beforeEach, expect, it } from "vitest";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import { activateMailSync } from "./mail-activation";
import {
  initializeSearchIndexAccount,
  seedSearchIndexWork,
} from "./search-index-seed";

installMailCacheStorageTestEnvironment();
beforeEach(() => clearEmailCache());

it("preserves retention and protected work when replacing the source generation", async () => {
  const database = (await getEmailCacheDatabase())!;
  const emailAccountId = "account-1";
  const generation = "old-generation";
  activateMailSync(emailAccountId);
  await database.put("searchIndexAccounts", {
    emailAccountId,
    generation,
    sourceVersion: 1,
    retentionRevision: 3,
    evictionMarkerBytes: 120,
    attachmentBytes: 123,
  });
  const policy = {
    emailAccountId,
    generation,
    revision: 3,
    requestedAfter: 10,
    automaticAfter: 20,
  };
  await database.put("localMailRetentionPolicies", policy);
  const marker = {
    emailAccountId,
    messageId: "evicted",
    threadId: "thread",
    receivedAt: 1,
    evictedAt: 30,
    revision: 3,
    byteSize: 120,
  };
  await database.put("localMailEvictedMessages", marker);
  await database.put("localMailThreadProtection", {
    emailAccountId,
    threadId: "protected",
    generation,
    reservations: { download: { bytes: 100, expiresAt: 1000 } },
  });
  await database.put("localMailEvictionJobs", {
    emailAccountId,
    generation,
    revision: 3,
    after: 0,
    before: 20,
    startedAt: 30,
    protectedRecentAfter: 25,
    protectedFetchedAfter: 25,
    cursor: { receivedAt: 1, messageId: "evicted" },
    stage: "drain-index",
    removedBytes: 500,
  });
  const [first, second] = await Promise.all([
    initializeSearchIndexAccount(emailAccountId),
    initializeSearchIndexAccount(emailAccountId),
  ]);
  expect(first).toEqual(second);
  expect(first?.generation).not.toBe(generation);
  expect(first).toMatchObject({
    retentionRevision: 3,
    evictionMarkerBytes: 120,
    attachmentBytes: 123,
  });
  expect(
    await database.get("localMailRetentionPolicies", emailAccountId),
  ).toEqual({ ...policy, generation: first?.generation });
  expect(
    await database.get("localMailEvictedMessages", [emailAccountId, "evicted"]),
  ).toEqual(marker);
  expect(
    await database.get("localMailThreadProtection", [
      emailAccountId,
      "protected",
    ]),
  ).toMatchObject({
    generation: first?.generation,
    reservations: { download: { bytes: 100, expiresAt: 1000 } },
  });
  expect(
    await database.get("localMailEvictionJobs", emailAccountId),
  ).toMatchObject({
    generation: first?.generation,
    stage: "remove-source",
    cursor: undefined,
  });
});

it("keeps canonical bodies and reindexes them after a source migration", async () => {
  const database = (await getEmailCacheDatabase())!;
  const emailAccountId = "account-1";
  activateMailSync(emailAccountId);
  const data = {
    id: "old-import",
    threadId: "protected-thread",
    internalDate: "1",
    date: "1970-01-01T00:00:00.001Z",
    subject: "Retained",
    snippet: "Body",
    historyId: "",
    headers: {
      from: "sender@example.com",
      to: "user@example.com",
      subject: "Retained",
      date: "1970-01-01T00:00:00.001Z",
    },
    textPlain: "Retained body",
    inline: [],
  };
  const byteSize = new Blob([JSON.stringify(data)]).size;
  await database.put("searchIndexAccounts", {
    emailAccountId,
    generation: "old",
    sourceVersion: 1,
    retentionRevision: 1,
    messageBytes: byteSize,
  });
  await database.put("localMailRetentionPolicies", {
    emailAccountId,
    generation: "old",
    revision: 1,
    requestedAfter: 100,
    automaticAfter: 100,
  });
  const row = {
    emailAccountId,
    messageId: data.id,
    threadId: data.threadId,
    data,
    byteSize,
    receivedAt: 1,
    fetchedAt: 1,
    bodyFetchedAt: 1,
    lastAccessedAt: 1,
  };
  await database.put("localMailMessages", row);
  let totalBytes = byteSize;
  for (let i = 0; i < 124; i++) {
    const otherData = { ...data, id: `message-${i}`, threadId: `thread-${i}` };
    const otherBytes = new Blob([JSON.stringify(otherData)]).size;
    totalBytes += otherBytes;
    await database.put("localMailMessages", {
      ...row,
      messageId: otherData.id,
      threadId: otherData.threadId,
      data: otherData,
      byteSize: otherBytes,
    });
  }
  const account = (await database.get("searchIndexAccounts", emailAccountId))!;
  await database.put("searchIndexAccounts", {
    ...account,
    messageBytes: totalBytes,
  });
  await database.put("localMailThreadProtection", {
    emailAccountId,
    threadId: data.threadId,
    generation: "old",
    reservations: { download: { bytes: 100, expiresAt: 1000 } },
  });
  await initializeSearchIndexAccount(emailAccountId);
  expect(
    await database.get("localMailMessages", [emailAccountId, data.id]),
  ).toEqual(row);
  await seedSearchIndexWork(emailAccountId);
  expect(await database.count("searchIndexWork")).toBe(100);
  await seedSearchIndexWork(emailAccountId);
  expect(await database.count("searchIndexWork")).toBe(125);
  for (let i = 0; i < 5; i++) {
    if ((await seedSearchIndexWork(emailAccountId))?.complete) break;
  }
  expect(
    await database.get("localMailMessages", [emailAccountId, data.id]),
  ).toEqual(row);
  expect(
    await database.get("searchIndexAccounts", emailAccountId),
  ).toMatchObject({ messageBytes: totalBytes });
  expect(
    await database.get("searchIndexWork", [emailAccountId, data.threadId]),
  ).toMatchObject({ status: "pending" });
});
