import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import type { LocalMailSyncResponse } from "@/utils/email/local-mail-sync-types";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import { storeLocalMailMessages } from "./local-mail-messages";
import {
  runLocalMailSyncTick,
  readLocalMailSyncState,
} from "./local-mail-sync";

vi.mock("@/utils/actions/local-mail-sync", () => ({
  localMailSyncAction: vi.fn(),
}));
vi.mock("./mail-activation", () => ({
  isMailSyncActivated: () => true,
  clearMailActivation: vi.fn(),
}));
const emailAccountId = "account-1";
const now = Date.UTC(2026, 8, 1);
const day = 86_400_000;
const folderId = "folder-1";
const retentionAfter = now - 60 * day;
let clock: number;
let call: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  await clearEmailCache();
  clock = now;
  call = vi.fn();
  await (await getEmailCacheDatabase())!.put("searchIndexAccounts", {
    emailAccountId,
    generation: "generation-1",
  });
});
describe("durable Outlook local mail synchronization", () => {
  it("clips historical body pagination at a new floor without reusing the old continuation", async () => {
    await initialize();
    await tick(body([message("already-read")], "old-body-continuation"));
    const old = await job(`window:${folderId}`);
    await setOutlookRetentionPolicy();
    await tick(body([message("already-read")]));
    expect(call.mock.calls.at(-1)?.[1]).toEqual({
      phase: "folder-backfill",
      folderId,
      after: now - 10 * day,
      before: now,
      limit: 100,
    });
    expect((await job(`window:${folderId}`))?.window?.generation).not.toBe(
      old?.window?.generation,
    );
    expect(
      (await readLocalMailSyncState(emailAccountId))?.coverage,
    ).toBeUndefined();
    await tick(delta());
    await tick();
    expect((await readLocalMailSyncState(emailAccountId))?.coverage).toEqual({
      after: now - 10 * day,
      before: now,
    });
  });

  it("removes evicted lookup dependencies so body coverage can finish without redownloading intentional absence", async () => {
    await initialize();
    clock += 60_000;
    await tick(
      delta([{ id: "evicted", internalDate: String(now - 365 * day) }]),
    );
    expect(await job("lookup:evicted")).toBeDefined();
    await setOutlookRetentionPolicy();
    const db = (await getEmailCacheDatabase())!;
    await db.put("localMailEvictedMessages", {
      emailAccountId,
      messageId: "evicted",
      threadId: "thread-evicted",
      receivedAt: now - 365 * day,
      evictedAt: clock,
      revision: 1,
      byteSize: 100,
    });
    call.mockClear();
    await tick(body([]));
    expect(await job("lookup:evicted")).toBeUndefined();
    await tick(
      delta(
        [{ id: "evicted", internalDate: String(now - 365 * day) }],
        ["evicted"],
      ),
    );
    expect(await job("lookup:evicted")).toBeUndefined();
    await tick();
    expect((await readLocalMailSyncState(emailAccountId))?.coverage).toEqual({
      after: now - 10 * day,
      before: now,
    });
    expect(
      await db.get("localMailEvictedMessages", [emailAccountId, "evicted"]),
    ).toBeDefined();
    expect(
      await db.get("localMailTombstones", [emailAccountId, "evicted"]),
    ).toBeUndefined();
    expect(
      call.mock.calls.every(
        ([, request]) => request.phase !== "message-lookup",
      ),
    ).toBe(true);
  });

  it("keeps initial paginated metadata historical and hydrates recent mail through body windows", async () => {
    await capabilities();
    await folders();
    const first = delta([
      { id: "recent-message", internalDate: String(now - day) },
    ]);
    if (first.status !== "ok" || first.phase !== "folder-changes")
      throw new Error("Unexpected fixture");
    first.result.hasMore = true;
    first.result.cursor = "initial-next-page";
    await tick(first);
    expect(await job("lookup:recent-message")).toBeUndefined();
    expect((await job(`delta:${folderId}`))?.request).toMatchObject({
      cursor: "initial-next-page",
      stream: "backfill",
    });
    call.mockClear();
    expect((await tick(undefined, { allowHistoricalWork: false })).status).toBe(
      "waiting",
    );
    expect(call).not.toHaveBeenCalled();
    call.mockRejectedValueOnce(new Error("Temporary provider failure"));
    await tick();
    expect(await job(`bootstrap:${folderId}`)).toBeDefined();
    clock += 60_000;
    const preview = await tick(
      body([message("recent-message")], "preview-next-page"),
    );
    expect(preview.status).toBe("progress");
    expect(preview).not.toHaveProperty("currentUpdate");
    expect(call.mock.calls.at(-1)?.[1]).toMatchObject({
      phase: "folder-backfill",
      limit: 5,
    });
    expect(await stored("recent-message")).toBeDefined();
    expect(await job(`bootstrap:${folderId}`)).toBeUndefined();
    expect(
      (await readLocalMailSyncState(emailAccountId))?.coverage,
    ).toBeUndefined();
    expect((await job(`window:${folderId}`))?.request).not.toHaveProperty(
      "cursor",
    );
    expect((await job(`delta:${folderId}`))?.request).toMatchObject({
      cursor: "initial-next-page",
    });
    clock += 5000;
    await tick(
      delta([{ id: "setup-arrival", internalDate: String(now + 2000) }]),
    );
    expect((await job(`window:${folderId}`))?.request).toMatchObject({
      before: clock,
    });
    expect((await job(`delta:${folderId}`))?.request).toMatchObject({
      stream: "changes",
    });
    expect(await job("lookup:setup-arrival")).toBeUndefined();
    clock += 1;
    await tick(body([]));
    expect(
      (await readLocalMailSyncState(emailAccountId))?.coverage,
    ).toBeUndefined();
    await tick(delta());
    await tick();
    expect((await job("lookup:recent-message"))?.request).toMatchObject({
      stream: "backfill",
    });
    await tick({
      status: "ok",
      phase: "message-lookup",
      result: { status: "notFound" },
    });
    clock += 1000;
    await tick();
    expect(await stored("recent-message")).toBeUndefined();
    expect((await readLocalMailSyncState(emailAccountId))?.coverage).toEqual({
      after: now - 30 * day,
      before: clock - 1001,
    });
  });

  it("keeps an expired initial metadata continuation historical until a complete baseline", async () => {
    await capabilities();
    await folders();
    const first = delta();
    if (first.status !== "ok" || first.phase !== "folder-changes")
      throw new Error("Unexpected fixture");
    first.result.hasMore = true;
    first.result.cursor = "initial-continuation";
    const initial = await tick(first);
    expect(initial).not.toHaveProperty("currentUpdate");
    await tick(body([]));
    await tick({ status: "reset-required", phase: "folder-changes" });
    call.mockClear();
    expect((await tick(undefined, { allowHistoricalWork: false })).status).toBe(
      "waiting",
    );
    expect(call).not.toHaveBeenCalled();
    clock += 5000;
    const completed = await tick(delta());
    expect(completed).not.toHaveProperty("currentUpdate");
    expect((await job(`window:${folderId}`))?.request).toMatchObject({
      before: clock,
    });
  });

  it("does not announce historical reconciliation lookups as new mail", async () => {
    await capabilities();
    await folders();
    await seed(message("old-import", now - 365 * day), now - 1);
    await tick(delta([{ id: "old-import", changeKey: "updated" }]));
    const lookup = await job("lookup:old-import");
    expect(lookup?.request).toMatchObject({ stream: "backfill" });
    const result = await tick(found(message("old-import", now - 365 * day)));
    expect(result.status).toBe("progress");
    expect(result).not.toHaveProperty("newMail");
    expect(result).not.toHaveProperty("currentUpdate");
  });

  it("reconciles deleted imported-old records after delta expiry and preserves valid moved imports", async () => {
    await initialize();
    const oldDate = now - 365 * day;
    await seed(message("old-deleted", oldDate), now - 1);
    await seed(message("old-moved", oldDate), now - 1);
    clock += 60_000;
    await tick({ status: "reset-required", phase: "folder-changes" });
    await tick(delta());
    await tick();
    expect(await job("lookup:old-deleted")).toBeDefined();
    expect(await job("lookup:old-moved")).toBeDefined();
    await tick({
      status: "ok",
      phase: "message-lookup",
      result: { status: "notFound" },
    });
    await tick(found(message("old-moved", oldDate, "another-folder")));
    expect(await stored("old-deleted")).toBeUndefined();
    expect((await stored("old-moved"))?.data.parentFolderId).toBe(
      "another-folder",
    );
    expect(
      (await readLocalMailSyncState(emailAccountId))?.folders["another-folder"],
    ).toBeDefined();
  });

  it("establishes unfiltered delta before body work and replays changes before coverage", async () => {
    await initialize();
    expect((await job(`window:${folderId}`))?.request).toMatchObject({
      phase: "folder-backfill",
      after: now - 30 * day,
      before: now,
    });
    await tick(body([message("first")], "next-body"));
    expect((await job(`window:${folderId}`))?.request).toMatchObject({
      cursor: "next-body",
    });
    await tick(body([message("second")]));
    expect(
      (await readLocalMailSyncState(emailAccountId))?.coverage,
    ).toBeUndefined();
    await tick(delta());
    await tick();
    expect((await readLocalMailSyncState(emailAccountId))?.coverage).toEqual({
      after: now - 30 * day,
      before: now,
    });
    expect((await job(`window:${folderId}`))?.window).toMatchObject({
      after: retentionAfter,
      before: now - 30 * day,
    });
    expect(await stored("first")).toBeDefined();
    expect(await stored("second")).toBeDefined();
  });
  it("persists folder discovery continuation and queues children while skipping excluded roots", async () => {
    await capabilities();
    await tick({
      status: "ok",
      phase: "folders",
      result: {
        folders: [
          { id: folderId, childFolderCount: 1 },
          { id: "trash", childFolderCount: 5 },
        ],
        nextCursor: "folders-next",
      },
    });
    expect((await job("folders:root"))?.request).toMatchObject({
      cursor: "folders-next",
    });
    expect(await job(`folders:${folderId}`)).toBeDefined();
    expect(await job("folders:trash")).toBeUndefined();
    expect(
      (await readLocalMailSyncState(emailAccountId))?.discoveryComplete,
    ).toBe(false);
    await tick(delta());
    await tick({ status: "ok", phase: "folders", result: { folders: [] } });
    await tick({ status: "ok", phase: "folders", result: { folders: [] } });
    expect(
      (await readLocalMailSyncState(emailAccountId))?.discoveryComplete,
    ).toBe(true);
  });
  it("stores Outlook attachment presence reported by message lookup", async () => {
    await initialize();
    clock += 60_000;
    await tick(delta([{ id: "attached", internalDate: String(now - day) }]));
    const lookup = found(message("attached"));
    if (
      lookup.status !== "ok" ||
      lookup.phase !== "message-lookup" ||
      lookup.result.status !== "found"
    )
      throw new Error("Unexpected fixture");
    lookup.result.hasAttachments = true;
    await tick(lookup);
    expect((await stored("attached"))?.data.hasAttachment).toBe(true);
  });
  it("applies an Outlook attachment flag from a delta without attachment files", async () => {
    await capabilities();
    await folders();
    await seed(message("existing"), now - 1000);
    await tick(delta([{ id: "existing", hasAttachments: true }]));
    expect((await stored("existing"))?.data.hasAttachment).toBe(true);
    clock += 60_000;
    await tick(delta([{ id: "existing", hasAttachments: false }]));
    expect((await stored("existing"))?.data.hasAttachment).toBe(false);
  });
  it("merges sparse metadata without erasing bodies or inventing missing fields", async () => {
    await capabilities();
    await folders();
    await seed(message("existing"), now - 1000);
    await tick(
      delta([{ id: "existing", isRead: true, subject: "Updated subject" }]),
    );
    const result = await stored("existing");
    expect(result?.data.textPlain).toBe("Searchable body");
    expect(result?.data.headers.subject).toBe("Updated subject");
    expect(result?.data.headers.from).toBe("sender@example.com");
    expect(result?.data.labelIds).not.toContain("UNREAD");
    expect(await job("lookup:existing")).toBeUndefined();
  });
  it("stores resolved category IDs while preserving system labels and sparse categories", async () => {
    await capabilities();
    await folders();
    await seed(
      { ...message("changed"), labelIds: ["UNREAD", "old-category"] },
      now - 1000,
    );
    await seed(
      { ...message("cleared"), labelIds: ["UNREAD", "old-category"] },
      now - 1000,
    );
    await seed(
      { ...message("sparse"), labelIds: ["UNREAD", "old-category"] },
      now - 1000,
    );
    await tick(
      delta([
        { id: "changed", categories: ["Project"], categoryIds: ["category-1"] },
        { id: "cleared", categories: [], categoryIds: [] },
        { id: "sparse", isRead: true },
      ]),
    );
    expect((await stored("changed"))?.data.labelIds).toEqual([
      "UNREAD",
      "category-1",
    ]);
    expect((await stored("cleared"))?.data.labelIds).toEqual(["UNREAD"]);
    expect((await stored("sparse"))?.data.labelIds).toEqual(["old-category"]);
  });
  it("resolves removed membership as a move and deletes only after global not-found", async () => {
    await initialize();
    await seed(message("moved"), now - 1000);
    await seed(message("deleted"), now - 1000);
    clock += 60_000;
    await tick(delta([], ["moved", "deleted"]));
    expect(await stored("moved")).toBeDefined();
    expect(await stored("deleted")).toBeDefined();
    // Jobs are deterministic by identifier; deletion sorts first.
    await tick({
      status: "ok",
      phase: "message-lookup",
      result: { status: "notFound" },
    });
    await tick(found(message("moved", now - day, "another-folder")));
    expect(await stored("deleted")).toBeUndefined();
    expect((await stored("moved"))?.data.parentFolderId).toBe("another-folder");
  });
  it("reconciles vanished members after token expiry and keeps recovery pending through throttling", async () => {
    await initialize();
    await seed(message("vanished"), now - 1000);
    clock += 60_000;
    await tick({ status: "reset-required", phase: "folder-changes" });
    expect((await job(`delta:${folderId}`))?.request).not.toHaveProperty(
      "cursor",
      expect.any(String),
    );
    expect(
      (await readLocalMailSyncState(emailAccountId))?.folders[folderId]
        ?.recovering,
    ).toBe(true);
    await tick(delta());
    await tick();
    expect(await stored("vanished")).toBeDefined();
    expect(await job("lookup:vanished")).toBeDefined();
    await tick({ status: "paused", retryAfterMs: 90_000 });
    expect(
      (await readLocalMailSyncState(emailAccountId))?.folders[folderId]
        ?.recovering,
    ).toBe(true);
    clock += 90_000;
    await tick({
      status: "ok",
      phase: "message-lookup",
      result: { status: "notFound" },
    });
    await tick();
    expect(await stored("vanished")).toBeUndefined();
    expect(
      (await readLocalMailSyncState(emailAccountId))?.folders[folderId]
        ?.recovering,
    ).toBe(false);
  });
  it("does not download old initial metadata but does retain later old-date imports", async () => {
    await capabilities();
    await folders();
    await tick(delta([{ id: "old-initial", internalDate: String(-day) }]));
    expect(await job("lookup:old-initial")).toBeUndefined();
    clock += 60_000;
    await tick(delta([{ id: "old-import", internalDate: String(-day) }]));
    expect((await job("lookup:old-import"))?.retainHistoricalImport).toBe(true);
    await tick(found(message("old-import", -day)));
    expect(await stored("old-import")).toBeDefined();
  });
  it("uses lookup reconciliation for stale body-window members rather than deleting moved mail", async () => {
    await initialize();
    await seed(message("unseen"), now - 1000);
    await tick(body([]));
    await tick(delta());
    await tick();
    expect(await job("lookup:unseen")).toBeDefined();
    expect(
      (await readLocalMailSyncState(emailAccountId))?.coverage,
    ).toBeUndefined();
    await tick(found(message("unseen", now - day, "another-folder")));
    clock += 1000;
    call.mockImplementation(async (_account, request) =>
      request.phase === "folder-backfill" ? body([]) : delta(),
    );
    for (let index = 0; index < 8; index += 1) {
      if (
        (await readLocalMailSyncState(emailAccountId))?.folders[folderId]
          ?.after ===
        now - 30 * day
      )
        break;
      await tick();
    }
    expect((await stored("unseen"))?.data.parentFolderId).toBe(
      "another-folder",
    );
    expect(
      (await readLocalMailSyncState(emailAccountId))?.folders[folderId]?.after,
    ).toBe(now - 30 * day);
    expect(await job("delta:another-folder")).toBeDefined();
  });
});

async function initialize() {
  await capabilities();
  await folders();
  await tick(delta());
}
async function capabilities() {
  await tick({
    status: "ok",
    phase: "capabilities",
    result: {
      strategy: "folder-delta",
      excludedFolderIds: ["trash", "spam", "drafts"],
      maxHydrationMessages: 1,
    },
  });
}
async function folders() {
  await tick({
    status: "ok",
    phase: "folders",
    result: { folders: [{ id: folderId, childFolderCount: 0 }] },
  });
}
function delta(
  messages: Extract<
    LocalMailSyncResponse,
    { phase: "folder-changes" }
  >["result"]["messages"] = [],
  removedMessageIds: string[] = [],
): LocalMailSyncResponse {
  return {
    status: "ok",
    phase: "folder-changes",
    result: {
      resetRequired: false,
      messages,
      removedMessageIds,
      requiresReconciliationMessageIds: [],
      attachmentMetadataAvailable: false,
      cursor: "delta-checkpoint",
      hasMore: false,
    },
  };
}
function body(
  messages: ReturnType<typeof message>[],
  nextCursor?: string,
): LocalMailSyncResponse {
  return {
    status: "ok",
    phase: "folder-backfill",
    result: {
      messages: messages.map((entry) => ({
        message: entry,
        changeKey: "revision",
        hasAttachments: false,
        attachmentMetadataAvailable: false,
      })),
      nextCursor,
    },
  };
}
function found(entry: ReturnType<typeof message>): LocalMailSyncResponse {
  return {
    status: "ok",
    phase: "message-lookup",
    result: {
      status: "found",
      message: entry,
      changeKey: "revision",
      hasAttachments: false,
      attachmentMetadataAvailable: false,
    },
  };
}
function message(
  id: string,
  receivedAt = now - day,
  parentFolderId = folderId,
) {
  return {
    ...getMockMessage({
      id,
      threadId: `thread-${id}`,
      textPlain: "Searchable body",
      labelIds: ["UNREAD"],
      from: "sender@example.com",
    }),
    internalDate: String(receivedAt),
    date: new Date(receivedAt).toISOString(),
    parentFolderId,
  };
}
async function tick(
  response?: LocalMailSyncResponse,
  overrides: Partial<Parameters<typeof runLocalMailSyncTick>[0]> = {},
) {
  if (response) call.mockResolvedValueOnce(response);
  return runLocalMailSyncTick({
    emailAccountId,
    retentionAfter,
    now: clock,
    call,
    admitBackfill: async () => true,
    withSyncLock: async (_account, run) => run(),
    withStorageLock: async (commit) => commit(),
    admitResponse: async () => ({
      allowed: true,
      logicalLimitBytes: Number.POSITIVE_INFINITY,
      maxGrowthBytes: Number.MAX_SAFE_INTEGER,
    }),
    ...overrides,
  });
}
async function job(id: string) {
  return (await getEmailCacheDatabase())!.get("localMailSyncJobs", [
    emailAccountId,
    id,
  ]);
}
async function stored(id: string) {
  return (await getEmailCacheDatabase())!.get("localMailMessages", [
    emailAccountId,
    id,
  ]);
}
async function seed(entry: ReturnType<typeof message>, fetchedAt: number) {
  const transaction = (await getEmailCacheDatabase())!.transaction(
    [
      "localMailMessages",
      "localMailTombstones",
      "searchIndexAccounts",
      "searchIndexWork",

      "localMailAttachmentFiles",
      "localMailAttachmentJobs",
      "localMailThreadProtection",
    ],
    "readwrite",
  );
  await storeLocalMailMessages(transaction, emailAccountId, [entry], fetchedAt);
  await transaction.done;
}

async function setOutlookRetentionPolicy() {
  const db = (await getEmailCacheDatabase())!;
  const tx = db.transaction(
    ["searchIndexAccounts", "localMailRetentionPolicies"],
    "readwrite",
  );
  const account = (await tx
    .objectStore("searchIndexAccounts")
    .get(emailAccountId))!;
  await tx
    .objectStore("searchIndexAccounts")
    .put({ ...account, retentionRevision: 1 });
  await tx.objectStore("localMailRetentionPolicies").put({
    emailAccountId,
    generation: account.generation,
    revision: 1,
    requestedAfter: retentionAfter,
    automaticAfter: now - 10 * day,
  });
  await tx.done;
}
