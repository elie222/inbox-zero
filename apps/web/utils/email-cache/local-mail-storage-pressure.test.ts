import { SOURCE_VERSION } from "./search-index-seed";
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, expect, it, vi } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import { activateMailSync, clearMailActivation } from "./mail-activation";
import { updateLocalMailThreadProtection } from "./local-mail-retention";
import { storeLocalMailMessages } from "./local-mail-messages";
import { readLocalMailStorageAdmission } from "./local-mail-storage";
import { reclaimSearchIndexStorage } from "./search-index-service";
import { relieveLocalMailStoragePressure } from "./local-mail-storage-pressure";

vi.mock("./local-mail-storage", () => ({
  readLocalMailStorageAdmission: vi.fn(),
  withLocalMailStorageLock: async <T>(work: () => Promise<T>) => work(),
}));
vi.mock("./search-index-service", () => ({
  reclaimSearchIndexStorage: vi.fn(),
  cleanupSearchIndex: vi.fn(async () => {}),
}));
const day = 86_400_000;
const now = 1000 * day;

beforeEach(async () => {
  await clearEmailCache();
  vi.clearAllMocks();
  vi.mocked(readLocalMailStorageAdmission).mockResolvedValue({
    allowed: false,
    reason: "storage-full",
    budgetBytes: 100,
    backfillLimitBytes: 90,
    limitBytes: 90,
    remainingBytes: 0,
  });
  vi.mocked(reclaimSearchIndexStorage).mockResolvedValue({
    status: "not-ready",
  });
});

it("evicts the oldest complete prefix across accounts and waits for durable index work", async () => {
  await seed("newer", 200 * day);
  await seed("older", 100 * day);
  const options = { emailAccountIds: ["newer", "older"], now };
  expect(await relieveLocalMailStoragePressure(options)).toBe("progress");
  const database = (await getEmailCacheDatabase())!;
  expect(await database.get("localMailEvictionJobs", "newer")).toBeUndefined();
  expect(await database.get("localMailEvictionJobs", "older")).toMatchObject({
    before: 130 * day,
  });
  expect(await relieveLocalMailStoragePressure(options)).toBe("progress");
  expect(await database.count("localMailEvictedMessages")).toBe(1);
  expect(await database.count("localMailTombstones")).toBe(0);
  expect(await relieveLocalMailStoragePressure(options)).toBe("waiting-index");
  expect(await database.get("localMailEvictionJobs", "older")).toBeDefined();
  vi.mocked(reclaimSearchIndexStorage).mockResolvedValue({
    status: "ready",
    storage: {
      incrementalVacuum: false,
      beforeBytes: 100,
      afterBytes: 100,
      reusableBytes: 50,
    },
  });
  expect(await relieveLocalMailStoragePressure(options)).toBe("waiting-space");
  expect(await database.get("localMailEvictionJobs", "newer")).toBeUndefined();
  await database.clear("searchIndexWork");
  vi.mocked(readLocalMailStorageAdmission).mockResolvedValue({
    allowed: true,
    reason: "available",
    budgetBytes: 100,
    backfillLimitBytes: 90,
    limitBytes: 90,
    remainingBytes: 50,
  });
  expect(await relieveLocalMailStoragePressure(options)).toBe("available");
  expect(await database.get("localMailEvictionJobs", "older")).toBeUndefined();
});

it("does not evict when quota is unknown", async () => {
  await seed("account", 100 * day);
  vi.mocked(readLocalMailStorageAdmission).mockResolvedValue({
    allowed: false,
    reason: "storage-unavailable",
    budgetBytes: 100,
    backfillLimitBytes: 0,
    limitBytes: 0,
    remainingBytes: 0,
  });
  expect(
    await relieveLocalMailStoragePressure({
      emailAccountIds: ["account"],
      now,
    }),
  ).toBe("unavailable");
  expect(
    await (await getEmailCacheDatabase())!.count("localMailEvictionJobs"),
  ).toBe(0);
});

it("does not create an eviction job for an inactive account under pressure", async () => {
  await seed("account", 100 * day);
  clearMailActivation("account");
  expect(
    await relieveLocalMailStoragePressure({
      emailAccountIds: ["account"],
      now,
    }),
  ).toBe("protected");
  expect(
    await (await getEmailCacheDatabase())!.count("localMailEvictionJobs"),
  ).toBe(0);
});

it("rechecks origin pressure under the commit lock before advancing retention", async () => {
  await seed("account", 100 * day);
  vi.mocked(readLocalMailStorageAdmission)
    .mockResolvedValueOnce({
      allowed: false,
      reason: "storage-full",
      budgetBytes: 100,
      backfillLimitBytes: 90,
      limitBytes: 90,
      remainingBytes: 0,
    })
    .mockResolvedValueOnce({
      allowed: true,
      reason: "available",
      budgetBytes: 100,
      backfillLimitBytes: 90,
      limitBytes: 90,
      remainingBytes: 50,
    });
  await relieveLocalMailStoragePressure({ emailAccountIds: ["account"], now });
  const database = (await getEmailCacheDatabase())!;
  expect(await database.count("localMailEvictionJobs")).toBe(0);
  expect(
    (await database.get("localMailSyncStates", "account"))?.coverage?.after,
  ).toBe(0);
});

it("serializes competing pressure decisions without creating two account evictions", async () => {
  await seed("a", 100 * day);
  await seed("b", 200 * day);
  await Promise.all([
    relieveLocalMailStoragePressure({ emailAccountIds: ["a", "b"], now }),
    relieveLocalMailStoragePressure({ emailAccountIds: ["a", "b"], now }),
  ]);
  expect(
    await (await getEmailCacheDatabase())!.count("localMailEvictionJobs"),
  ).toBe(1);
});

it.each([
  "inactive",
  "disconnected",
])("preserves a %s account's pending eviction without blocking active accounts", async (mode) => {
  await seed("dormant", 100 * day);
  await seed("active", 200 * day);
  await relieveLocalMailStoragePressure({
    emailAccountIds: ["dormant", "active"],
    now,
  });
  const database = (await getEmailCacheDatabase())!;
  const dormantJob = await database.get("localMailEvictionJobs", "dormant");
  if (mode === "inactive") clearMailActivation("dormant");
  const options = {
    emailAccountIds: mode === "inactive" ? ["dormant", "active"] : ["active"],
    now,
  };
  expect(await relieveLocalMailStoragePressure(options)).toBe("progress");
  expect(await database.get("localMailEvictionJobs", "active")).toBeDefined();
  await relieveLocalMailStoragePressure(options);
  expect(
    await database.get("localMailMessages", ["active", "message"]),
  ).toBeUndefined();
  expect(
    await database.get("localMailMessages", ["dormant", "message"]),
  ).toBeDefined();
  expect(await database.get("localMailEvictionJobs", "dormant")).toEqual(
    dormantJob,
  );
});

it("protects recent complete coverage and never selects incomplete history", async () => {
  await seed("account", now - 10 * day);
  expect(
    await relieveLocalMailStoragePressure({
      emailAccountIds: ["account"],
      now,
    }),
  ).toBe("protected");
  const database = (await getEmailCacheDatabase())!;
  const state = (await database.get("localMailSyncStates", "account"))!;
  await database.put("localMailSyncStates", { ...state, coverage: undefined });
  expect(
    await relieveLocalMailStoragePressure({
      emailAccountIds: ["account"],
      now,
    }),
  ).toBe("protected");
});

it("revisits unpinned exceptions below the coverage floor without claiming more coverage", async () => {
  await seed("account", 100 * day);
  const database = (await getEmailCacheDatabase())!;
  await updateLocalMailThreadProtection({
    emailAccountId: "account",
    generation: "generation",
    threadId: "thread",
    pinned: true,
    now,
  });
  const options = { emailAccountIds: ["account"], now };
  await relieveLocalMailStoragePressure(options);
  await relieveLocalMailStoragePressure(options);
  await finishIndexWork();
  await relieveLocalMailStoragePressure(options);
  const before = (await database.get("localMailSyncStates", "account"))!;
  await updateLocalMailThreadProtection({
    emailAccountId: "account",
    generation: "generation",
    threadId: "thread",
    pinned: false,
    now,
  });
  await relieveLocalMailStoragePressure(options);
  await relieveLocalMailStoragePressure(options);
  expect(await database.count("localMailMessages")).toBe(0);
  expect(await database.count("localMailEvictedMessages")).toBe(1);
  expect(
    (await database.get("localMailSyncStates", "account"))?.coverage,
  ).toEqual(before.coverage);
  expect(
    (await database.get("localMailRetentionPolicies", "account"))
      ?.automaticAfter,
  ).toBe(130 * day);
});

it("finishes a protected-only exception pass and backs off before rescanning", async () => {
  await seed("account", 100 * day);
  const database = (await getEmailCacheDatabase())!;
  await updateLocalMailThreadProtection({
    emailAccountId: "account",
    generation: "generation",
    threadId: "thread",
    pinned: true,
    now,
  });
  const options = { emailAccountIds: ["account"], now };
  await relieveLocalMailStoragePressure(options);
  await relieveLocalMailStoragePressure(options);
  await finishIndexWork();
  await relieveLocalMailStoragePressure(options);
  await relieveLocalMailStoragePressure(options);
  await relieveLocalMailStoragePressure(options);
  await relieveLocalMailStoragePressure(options);
  expect(
    (await database.get("localMailRetentionPolicies", "account"))
      ?.exceptionSweepAfter,
  ).toBeGreaterThan(now);
  expect(await relieveLocalMailStoragePressure(options)).toBe("protected");
  expect(await database.count("localMailEvictionJobs")).toBe(0);
  expect(await database.count("localMailMessages")).toBe(1);
});

it("does not resume source deletion while origin quota is unknown", async () => {
  await seed("account", 100 * day);
  const options = { emailAccountIds: ["account"], now };
  await relieveLocalMailStoragePressure(options);
  vi.mocked(readLocalMailStorageAdmission).mockResolvedValue({
    allowed: false,
    reason: "storage-unavailable",
    budgetBytes: 100,
    backfillLimitBytes: 0,
    limitBytes: 0,
    remainingBytes: 0,
  });
  expect(await relieveLocalMailStoragePressure(options)).toBe("unavailable");
  expect(
    await (await getEmailCacheDatabase())!.count("localMailMessages"),
  ).toBe(1);
});

async function finishIndexWork() {
  const database = (await getEmailCacheDatabase())!;
  await database.clear("searchIndexWork");
  vi.mocked(reclaimSearchIndexStorage).mockResolvedValue({
    status: "ready",
    storage: {
      incrementalVacuum: true,
      beforeBytes: 100,
      afterBytes: 100,
      reusableBytes: 0,
    },
  });
}

async function seed(emailAccountId: string, receivedAt: number) {
  activateMailSync(emailAccountId);
  const db = (await getEmailCacheDatabase())!;
  await db.put("searchIndexAccounts", {
    emailAccountId,
    generation: "generation",
    sourceVersion: SOURCE_VERSION,
  });
  await db.put("localMailSyncStates", {
    emailAccountId,
    generation: "generation",
    fence: 1,
    strategy: "account-history",
    retentionAfter: 0,
    retainedAfter: 0,
    snapshotBefore: now,
    nextWindowSize: 30 * day,
    excludedFolderIds: [],
    folders: {},
    discoveryGeneration: 1,
    discoveryComplete: true,
    coverage: { after: 0, before: now },
    nextAttemptAt: 0,
  });
  const tx = db.transaction(
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
  await storeLocalMailMessages(
    tx,
    emailAccountId,
    [
      {
        ...getMockMessage({ id: "message", threadId: "thread" }),
        internalDate: String(receivedAt),
      },
    ],
    now - 2 * day,
  );
  await tx.done;
}
