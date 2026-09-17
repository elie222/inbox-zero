import "fake-indexeddb/auto";
import { bootstrapLocalMailStorageLedgerBatch } from "./local-mail-storage-ledger-bootstrap";
import {
  localMailLedgerBytes,
  LOCAL_MAIL_ACCOUNTED_STORES,
} from "./local-mail-storage-ledger";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import type { LocalMailSyncResponse } from "@/utils/email/local-mail-sync-types";
import {
  clearEmailCache,
  clearEmailCacheForAccount,
  getEmailCacheDatabase,
} from "./database";
import { storeLocalMailMessages } from "./local-mail-messages";
import { isMailSyncActivated } from "./mail-activation";
import {
  runLocalMailSyncTick,
  readLocalMailSyncState,
} from "./local-mail-sync";
import { LOCAL_MAIL_HISTORY_AFTER } from "./local-mail-sync-state";

vi.mock("@/utils/actions/local-mail-sync", () => ({
  localMailSyncAction: vi.fn(),
}));
vi.mock("./mail-activation", () => ({
  isMailSyncActivated: vi.fn(() => true),
  clearMailActivation: vi.fn(),
}));
const emailAccountId = "account-1";
const now = Date.UTC(2026, 8, 1);
const day = 86_400_000;
const retentionAfter = now - 60 * day;
let clock: number;
let call: ReturnType<typeof vi.fn>;
const syncLocks = new Map<string, symbol>();
beforeEach(async () => {
  await clearEmailCache();
  syncLocks.clear();
  vi.mocked(isMailSyncActivated).mockReturnValue(true);
  clock = now;
  call = vi.fn();
  await (await getEmailCacheDatabase())!.put("searchIndexAccounts", {
    emailAccountId,
    generation: "generation-1",
  });
});

describe("durable Gmail local mail synchronization", () => {
  it("accounts source, index work and checkpoints atomically through hydration and retry", async () => {
    await initializeGmail();
    for (let batch = 0; batch < 100; batch++) {
      if ((await bootstrapLocalMailStorageLedgerBatch()) !== "progress") break;
    }
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: ["downloaded"], historyCursor: "anchor" },
    });
    await tick(hydrated(["downloaded"]));
    expect(await stored("downloaded")).toBeDefined();
    call.mockRejectedValueOnce(new Error("connection interrupted"));
    await tick();
    const database = (await getEmailCacheDatabase())!;
    const ledger = (await database.get("localMailStorageLedger", "origin"))!;
    for (const store of LOCAL_MAIL_ACCOUNTED_STORES) {
      const rows = await database.getAll(store);
      expect(ledger.stores[store]?.complete, store).toBe(true);
      expect(ledger.stores[store]?.bytes, store).toBe(
        rows.reduce(
          (sum, row) => sum + new Blob([JSON.stringify(row)]).size,
          0,
        ),
      );
    }
  });

  it("restarts a pending historical range at a raised retention floor without reusing its cursor", async () => {
    await initializeGmail();
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: {
        messageIds: ["old-page"],
        nextCursor: "old-continuation",
        historyCursor: "old-anchor",
      },
    });
    const old = await getJob("window:account");
    const db = (await getEmailCacheDatabase())!;
    await db.put("localMailSyncSeen", {
      emailAccountId,
      generation: old!.window!.generation,
      messageId: "old-page",
    });
    await setRetentionPolicy(now - 10 * day);
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: [], historyCursor: "fresh-anchor" },
    });
    expect(call.mock.calls.at(-1)?.[1]).toEqual({
      phase: "history-backfill",
      after: now - 10 * day,
      before: now,
      limit: 100,
    });
    expect((await getJob("window:account"))?.window?.generation).not.toBe(
      old?.window?.generation,
    );
    expect(await db.count("localMailSyncSeen")).toBe(0);
    expect((await readLocalMailSyncState(emailAccountId))?.retentionAfter).toBe(
      now - 10 * day,
    );
  });

  it("reconciles newly exceptional retained records before finishing recovery after a floor change", async () => {
    await initializeGmail();
    await seed("protected-old", now - 20 * day, now - 1);
    clock += 60_000;
    await tick({ status: "reset-required", phase: "history-changes" });
    await tick({
      status: "ok",
      phase: "history-baseline",
      result: { cursor: "replacement" },
    });
    expect(await getJob("retained-reconciliation")).toBeUndefined();
    await setRetentionPolicy(now - 10 * day);
    await tick({
      status: "ok",
      phase: "history-hydrate",
      result: {
        messages: [message("protected-old", now - 20 * day)],
        removedMessageIds: [],
        confirmedDeletedMessageIds: [],
      },
    });
    expect(call.mock.calls.at(-1)?.[1]).toMatchObject({
      phase: "history-hydrate",
      messageIds: ["protected-old"],
      after: LOCAL_MAIL_HISTORY_AFTER,
    });
    expect((await getJob("current"))?.nextAttemptAt).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(await stored("protected-old")).toBeDefined();
    expect((await getJob("recovery"))?.window?.after).toBe(now - 10 * day);
  });

  it("cancels wholly evicted historical work and never lowers the floor on reload", async () => {
    await initializeGmail();
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: [], historyCursor: "anchor" },
    });
    await tick(changes("completed"));
    await tick();
    const old = await getJob("window:account");
    expect(old?.window?.before).toBe(now - 30 * day);
    await setRetentionPolicy(now - 10 * day);
    call.mockClear();
    expect((await run()).status).toBe("waiting");
    expect(await getJob("window:account")).toBeUndefined();
    expect(
      (await readLocalMailSyncState(emailAccountId))?.coverage?.after,
    ).toBe(now - 10 * day);
    await run({ retentionAfter: LOCAL_MAIL_HISTORY_AFTER });
    expect((await readLocalMailSyncState(emailAccountId))?.retentionAfter).toBe(
      now - 10 * day,
    );
    expect(call).not.toHaveBeenCalled();
  });

  it("drops newly evicted pending hydration IDs without losing the final provider checkpoint", async () => {
    await initializeGmail();
    await setRetentionPolicy(now - 10 * day);
    clock += 60_000;
    await tick(changes("after-page", ["pending-eviction"]));
    const db = (await getEmailCacheDatabase())!;
    await db.put("localMailEvictedMessages", {
      emailAccountId,
      messageId: "pending-eviction",
      threadId: "thread-pending",
      receivedAt: now - 365 * day,
      evictedAt: clock,
      revision: 1,
      byteSize: 100,
    });
    call.mockClear();
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: [], historyCursor: "window-anchor" },
    });
    expect(
      call.mock.calls.every(
        ([, request]) => request.phase !== "history-hydrate",
      ),
    ).toBe(true);
    expect((await getJob("current"))?.request).toMatchObject({
      phase: "history-changes",
      cursor: "after-page",
    });
    expect(
      await db.get("localMailTombstones", [emailAccountId, "pending-eviction"]),
    ).toBeUndefined();
  });

  it("rejects a provider response captured before the retention revision changed", async () => {
    await initializeGmail();
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: ["late"], historyCursor: "anchor" },
    });
    let finish: (response: LocalMailSyncResponse) => void = () => undefined;
    call.mockImplementationOnce(
      () =>
        new Promise<LocalMailSyncResponse>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = run();
    await vi.waitFor(() =>
      expect(call.mock.calls.at(-1)?.[1].phase).toBe("history-hydrate"),
    );
    await setRetentionPolicy(now - 10 * day, false);
    finish(hydrated(["late"]));
    expect((await pending).status).toBe("stale");
    expect(await stored("late")).toBeUndefined();
  });

  it("skips evicted current IDs while preserving confirmed deletions and unseen old imports", async () => {
    await initializeGmail();
    await setRetentionPolicy(now - 10 * day);
    const db = (await getEmailCacheDatabase())!;
    for (const id of ["evicted", "deleted-marker"])
      await db.put("localMailEvictedMessages", {
        emailAccountId,
        messageId: id,
        threadId: `thread-${id}`,
        receivedAt: now - 365 * day,
        evictedAt: now - 1,
        revision: 1,
        byteSize: 100,
      });
    clock += 60_000;
    await tick({
      status: "ok",
      phase: "history-changes",
      result: {
        resetRequired: false,
        cursor: "current-next",
        messageIds: ["evicted", "new-import"],
        confirmedDeletedMessageIds: ["deleted-marker"],
        hasMore: false,
      },
    });
    await tick({
      status: "ok",
      phase: "history-hydrate",
      result: {
        messages: [message("new-import", now - 365 * day)],
        removedMessageIds: [],
        confirmedDeletedMessageIds: [],
      },
    });
    expect(call.mock.calls.at(-1)?.[1]).toMatchObject({
      phase: "history-hydrate",
      messageIds: ["new-import"],
    });
    expect(await stored("new-import")).toBeDefined();
    expect(await stored("evicted")).toBeUndefined();
    expect(
      await db.get("localMailEvictedMessages", [
        emailAccountId,
        "deleted-marker",
      ]),
    ).toBeUndefined();
    expect((await getJob("current"))?.request).toMatchObject({
      cursor: "current-next",
    });
  });

  it("reconciles retained imports outside ordinary coverage after expired history without widening backfill", async () => {
    await initializeGmail();
    for (let index = 0; index < 7; index++)
      await seed(`old-${index}`, now - 365 * day, now - 1);
    await seed("future-import", now + 365 * day, now - 1);
    clock += 60_000;
    await tick({ status: "reset-required", phase: "history-changes" });
    await tick({
      status: "ok",
      phase: "history-baseline",
      result: { cursor: "new-anchor" },
    });
    expect((await getJob("recovery"))?.window?.after).toBe(now - 30 * day);
    let retained = await getJob("retained-reconciliation");
    expect(retained?.request).toMatchObject({
      phase: "history-hydrate",
      after: LOCAL_MAIL_HISTORY_AFTER,
      messageIds: ["old-0", "old-1", "old-2", "old-3", "old-4"],
    });
    await tick({
      status: "ok",
      phase: "history-hydrate",
      result: {
        messages: [],
        removedMessageIds: [],
        confirmedDeletedMessageIds: [
          "old-0",
          "old-1",
          "old-2",
          "old-3",
          "old-4",
        ],
      },
    });
    retained = await getJob("retained-reconciliation");
    expect(retained?.request).toMatchObject({
      messageIds: ["old-5", "old-6", "future-import"],
    });
    await tick({
      status: "ok",
      phase: "history-hydrate",
      result: {
        messages: [message("old-6", now - 365 * day)],
        removedMessageIds: [],
        confirmedDeletedMessageIds: ["old-5", "future-import"],
      },
    });
    expect(await getJob("retained-reconciliation")).toBeUndefined();
    expect(await stored("old-5")).toBeUndefined();
    expect(await stored("future-import")).toBeUndefined();
    expect(await stored("old-6")).toBeDefined();
    expect((await readLocalMailSyncState(emailAccountId))?.retainedAfter).toBe(
      now - 30 * day,
    );
    expect((await getJob("current"))?.nextAttemptAt).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("does not adopt a replacement anchor while retained exception reconciliation is paused", async () => {
    await initializeGmail();
    await seed("old-import", now - 365 * day, now - 1);
    clock += 60_000;
    await tick({ status: "reset-required", phase: "history-changes" });
    await tick({
      status: "ok",
      phase: "history-baseline",
      result: { cursor: "replacement" },
    });
    call.mockResolvedValueOnce({
      status: "ok",
      phase: "history-hydrate",
      result: {
        messages: [message("old-import", now - 365 * day)],
        removedMessageIds: [],
        confirmedDeletedMessageIds: [],
      },
    });
    await run({
      admitResponse: async () => ({
        allowed: false,
        logicalLimitBytes: Number.POSITIVE_INFINITY,
        maxGrowthBytes: 0,
      }),
    });
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: [], historyCursor: "range-anchor" },
    });
    await tick(changes("range-complete"));
    call.mockClear();
    expect((await run()).status).toBe("waiting");
    expect(call).not.toHaveBeenCalled();
    expect((await readLocalMailSyncState(emailAccountId))?.recovering).toBe(
      true,
    );
    expect((await getJob("current"))?.nextAttemptAt).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    clock += 90_000;
    await tick({
      status: "ok",
      phase: "history-hydrate",
      result: {
        messages: [],
        removedMessageIds: [],
        confirmedDeletedMessageIds: ["old-import"],
      },
    });
    await tick();
    expect((await readLocalMailSyncState(emailAccountId))?.recovering).toBe(
      false,
    );
    expect((await getJob("current"))?.request).toMatchObject({
      cursor: "replacement",
    });
    expect(await stored("old-import")).toBeUndefined();
  });

  it("includes arrivals between activation and the initial history anchor in the first snapshot", async () => {
    await tick(capabilities());
    const arrival = now + 2000;
    clock = now + 5000;
    await tick({
      status: "ok",
      phase: "history-baseline",
      result: { cursor: "anchor-after-arrival" },
    });
    expect((await readLocalMailSyncState(emailAccountId))?.snapshotBefore).toBe(
      clock,
    );
    expect((await getJob("window:account"))?.request).toMatchObject({
      phase: "history-backfill",
      before: clock,
    });
    await tick(changes("current-after-arrival"));
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: ["setup-arrival"], historyCursor: "window-anchor" },
    });
    expect((await getJob("window:account"))?.request).toMatchObject({
      phase: "history-hydrate",
      before: clock,
    });
    await tick({
      status: "ok",
      phase: "history-hydrate",
      result: {
        messages: [message("setup-arrival", arrival)],
        removedMessageIds: [],
        confirmedDeletedMessageIds: [],
      },
    });
    expect((await stored("setup-arrival"))?.receivedAt).toBe(arrival);
  });

  it("finishes unbounded history with one contiguous older tail including pre-epoch mail", async () => {
    await initializeGmail();
    const database = (await getEmailCacheDatabase())!;
    const initial = (await readLocalMailSyncState(emailAccountId))!;
    await database.put("localMailSyncStates", {
      ...initial,
      retentionAfter: LOCAL_MAIL_HISTORY_AFTER,
    });
    let previousAfter = initial.retainedAfter;
    for (let window = 0; window < 5; window++) {
      await tick({
        status: "ok",
        phase: "history-backfill",
        result: { messageIds: [], historyCursor: "window-anchor" },
      });
      await tick(changes("replayed-window"));
      await tick();
      const pending = await getJob("window:account");
      expect(pending?.window?.before).toBe(previousAfter);
      previousAfter = pending!.window!.after;
    }
    const tail = await getJob("window:account");
    expect(tail?.window?.after).toBe(LOCAL_MAIL_HISTORY_AFTER);
    expect(tail?.window?.before).toBeGreaterThan(0);
  });

  it("pauses historical pages without delaying due current changes", async () => {
    await initializeGmail();
    call.mockClear();
    expect((await run({ allowHistoricalWork: false })).status).toBe("waiting");
    expect(call).not.toHaveBeenCalled();
    clock += 60_000;
    call.mockResolvedValueOnce(changes("next-current"));
    expect((await run({ allowHistoricalWork: false })).status).toBe("progress");
    expect(call).toHaveBeenCalledWith(
      emailAccountId,
      expect.objectContaining({ phase: "history-changes" }),
    );
    expect((await getJob("window:account"))?.request.phase).toBe(
      "history-backfill",
    );
  });

  it("persists enumeration IDs and offsets across reloads and does not advance coverage before replay", async () => {
    await initializeGmail();
    const ids = Array.from({ length: 7 }, (_, i) => `message-${i}`);
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: {
        messageIds: ids,
        nextCursor: "next-page",
        historyCursor: "window-anchor",
      },
    });
    let job = await getJob("window:account");
    expect(job?.pending).toMatchObject({ ids, offset: 0, cursor: "next-page" });
    expect(job?.request).toMatchObject({
      phase: "history-hydrate",
      messageIds: ids.slice(0, 5),
    });
    expect(
      (await readLocalMailSyncState(emailAccountId))?.coverage,
    ).toBeUndefined();
    await tick(hydrated(ids.slice(0, 5)));
    job = await getJob("window:account");
    expect(job?.pending?.offset).toBe(5);
    await tick(hydrated(ids.slice(5)));
    expect((await getJob("window:account"))?.request).toMatchObject({
      phase: "history-backfill",
      cursor: "next-page",
    });
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: [], historyCursor: "window-anchor" },
    });
    expect((await getJob("window:account"))?.request).toMatchObject({
      phase: "history-changes",
      cursor: "window-anchor",
    });
    await tick(changes("window-finished"));
    expect((await getJob("window:account"))?.kind).toBe("sweep");
    await tick();
    const state = await readLocalMailSyncState(emailAccountId);
    expect(state?.coverage).toEqual({ after: now - 30 * day, before: now });
    expect((await getJob("window:account"))?.window).toMatchObject({
      after: retentionAfter,
      before: now - 30 * day,
    });
    expect(
      await (await getEmailCacheDatabase())!.count("localMailMessages"),
    ).toBe(7);
  });
  it("leaves hydration offset and canonical messages unchanged on errors and quota pauses", async () => {
    await initializeGmail();
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: ["message"], historyCursor: "anchor" },
    });
    const original = await getJob("window:account");
    call.mockRejectedValueOnce(new Error("provider unavailable"));
    expect((await run())?.status).toBe("retry");
    expect((await getJob("window:account"))?.pending).toEqual(
      original?.pending,
    );
    clock += 3000;
    await tick({ status: "paused", retryAfterMs: 90_000 });
    const paused = await getJob("window:account");
    expect(paused?.pending).toEqual(original?.pending);
    expect(paused?.nextAttemptAt).toBe(clock + 90_000);
    const calls = call.mock.calls.length;
    clock += 30_000;
    expect((await run()).status).toBe("waiting");
    expect(call).toHaveBeenCalledTimes(calls);
    expect(
      await (await getEmailCacheDatabase())!.count("localMailMessages"),
    ).toBe(0);
  });
  it("reconciles vanished records after history expiry before coverage can become complete", async () => {
    await initializeGmail();
    await seed("vanished", now - day, now - 1000);
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: [], historyCursor: "expired" },
    });
    await tick({ status: "reset-required", phase: "history-changes" });
    expect((await getJob("window:account"))?.request.phase).toBe(
      "history-backfill",
    );
    expect(await stored("vanished")).toBeDefined();
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: [], historyCursor: "fresh" },
    });
    await tick(changes("finished"));
    expect(
      (await readLocalMailSyncState(emailAccountId))?.coverage,
    ).toBeUndefined();
    await tick();
    expect(await stored("vanished")).toBeUndefined();
    expect(
      (await readLocalMailSyncState(emailAccountId))?.coverage?.after,
    ).toBe(now - 30 * day);
  });
  it("does not let global history filtering delete messages in an adjacent range", async () => {
    await initializeGmail();
    await seed("older", now - 40 * day, now - 1000);
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: [], historyCursor: "anchor" },
    });
    await tick(changes("next", ["older"]));
    await tick({
      status: "ok",
      phase: "history-hydrate",
      result: {
        messages: [],
        removedMessageIds: ["older"],
        confirmedDeletedMessageIds: [],
      },
    });
    expect(await stored("older")).toBeDefined();
  });
  it("discovers old-date imports from the all-time current stream", async () => {
    await initializeGmail();
    clock += 60_000;
    await tick(changes("current-next", ["historical-import"]));
    expect(call.mock.calls.at(-1)?.[1]).toMatchObject({
      phase: "history-changes",
      after: LOCAL_MAIL_HISTORY_AFTER,
    });
    await tick({
      status: "ok",
      phase: "history-hydrate",
      result: {
        messages: [message("historical-import", -day)],
        removedMessageIds: [],
        confirmedDeletedMessageIds: [],
      },
    });
    expect(call.mock.calls.at(-1)?.[1]).toMatchObject({
      phase: "history-hydrate",
      after: LOCAL_MAIL_HISTORY_AFTER,
    });
    expect(await stored("historical-import")).toBeDefined();
  });
  it("reconciles retained coverage before adopting a replacement current-stream baseline", async () => {
    await initializeGmail();
    await seed("vanished", now - day, now - 1000);
    clock += 60_000;
    await tick({ status: "reset-required", phase: "history-changes" });
    await tick({
      status: "ok",
      phase: "history-baseline",
      result: { cursor: "candidate-baseline" },
    });
    expect((await readLocalMailSyncState(emailAccountId))?.recovering).toBe(
      true,
    );
    expect((await getJob("current"))?.nextAttemptAt).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: [], historyCursor: "recovery-anchor" },
    });
    await tick(changes("recovery-finished"));
    await tick();
    expect(await stored("vanished")).toBeUndefined();
    expect((await readLocalMailSyncState(emailAccountId))?.recovering).toBe(
      false,
    );
    expect((await getJob("current"))?.request).toMatchObject({
      cursor: "candidate-baseline",
    });
  });
});

describe("local mail ownership and storage", () => {
  it("does not activate assistant-only accounts", async () => {
    vi.mocked(isMailSyncActivated).mockReturnValue(false);
    expect((await run()).status).toBe("inactive");
    expect(call).not.toHaveBeenCalled();
  });
  it("does not start without browser ownership coordination", async () => {
    vi.stubGlobal("navigator", {});
    try {
      expect(await run({ withSyncLock: undefined })).toEqual({
        status: "unavailable",
      });
      expect(call).not.toHaveBeenCalled();
      expect(await readLocalMailSyncState(emailAccountId)).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("does not call the provider while another document owns the account lock", async () => {
    syncLocks.set(emailAccountId, Symbol("sync-owner"));
    expect((await run()).status).toBe("waiting");
    expect(call).not.toHaveBeenCalled();
    expect(await readLocalMailSyncState(emailAccountId)).toBeUndefined();
  });
  it.each([
    "account",
    "job",
  ] as const)("preserves durable %s cooldowns when reclaiming an abandoned lease", async (cooldown) => {
    await tick(capabilities());
    const database = (await getEmailCacheDatabase())!;
    const state = (await readLocalMailSyncState(emailAccountId))!;
    await database.put("localMailSyncStates", {
      ...state,
      leaseOwner: "abandoned",
      leaseExpiresAt: clock + 180_000,
      nextAttemptAt: cooldown === "account" ? clock + 10_000 : clock,
    });
    if (cooldown === "job") {
      for (const job of await database.getAll("localMailSyncJobs"))
        await database.put("localMailSyncJobs", {
          ...job,
          nextAttemptAt: clock + 10_000,
        });
    }
    call.mockClear();
    expect(await run()).toMatchObject({
      status: "waiting",
      retryAt: clock + 10_000,
    });
    expect(call).not.toHaveBeenCalled();
    clock += 10_001;
    await tick({
      status: "ok",
      phase: "history-baseline",
      result: { cursor: "baseline" },
    });
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("fences concurrent tabs and ignores the former owner's late response", async () => {
    let resolve: (response: LocalMailSyncResponse) => void = () => undefined;
    call.mockImplementationOnce(
      () =>
        new Promise<LocalMailSyncResponse>((done) => {
          resolve = done;
        }),
    );
    const first = run();
    await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));
    expect((await run()).status).toBe("waiting");
    // Losing the document releases its browser lock before the durable lease expires.
    syncLocks.clear();
    await tick(capabilities());
    resolve(capabilities());
    expect((await first).status).toBe("stale");
    expect((await readLocalMailSyncState(emailAccountId))?.fence).toBe(2);
  });
  it("rejects an expired owner even without a takeover", async () => {
    let resolve: (response: LocalMailSyncResponse) => void = () => undefined;
    call.mockImplementationOnce(
      () =>
        new Promise<LocalMailSyncResponse>((done) => {
          resolve = done;
        }),
    );
    const pending = run();
    await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));
    const database = (await getEmailCacheDatabase())!;
    const state = (await readLocalMailSyncState(emailAccountId))!;
    await database.put("localMailSyncStates", {
      ...state,
      leaseExpiresAt: clock - 1,
    });
    resolve(capabilities());
    expect((await pending).status).toBe("stale");
    expect(
      (await readLocalMailSyncState(emailAccountId))?.strategy,
    ).toBeUndefined();
  });
  it("sweeps more than one bounded page with equal timestamps without skipping records", async () => {
    await initializeGmail();
    const database = (await getEmailCacheDatabase())!;
    const tx = database.transaction(
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
    await storeLocalMailMessages(
      tx,
      emailAccountId,
      Array.from({ length: 205 }, (_, index) =>
        message(`stale-${String(index).padStart(3, "0")}`),
      ),
      now - 1000,
    );
    await tx.done;
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: [], historyCursor: "anchor" },
    });
    await tick(changes("finished"));
    await tick();
    expect(await database.count("localMailMessages")).toBe(105);
    expect(
      (await readLocalMailSyncState(emailAccountId))?.coverage,
    ).toBeUndefined();
    await tick();
    expect(await database.count("localMailMessages")).toBe(5);
    await tick();
    expect(await database.count("localMailMessages")).toBe(0);
    expect(
      (await readLocalMailSyncState(emailAccountId))?.coverage,
    ).toBeDefined();
    // 205 seeded records across five sweeps take well under a second alone, but
    // the default 5s bound is reached when parallel suites starve this worker.
  }, 20_000);
  it("rolls back messages and hydration checkpoint when combined account bytes exceed capacity", async () => {
    await initializeGmail();
    const database = (await getEmailCacheDatabase())!;
    await database.put("searchIndexAccounts", {
      emailAccountId: "account-2",
      generation: "other-generation",
      messageBytes: 2000,
    });
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: ["large"], historyCursor: "anchor" },
    });
    const original = await getJob("window:account");
    while ((await bootstrapLocalMailStorageLedgerBatch()) === "progress") {}
    const ledger = (await database.get("localMailStorageLedger", "origin"))!;
    ledger.index = { status: "ready", bytes: 4096 };
    await database.put("localMailStorageLedger", ledger);
    const logicalLimitBytes = localMailLedgerBytes(ledger);
    call.mockResolvedValueOnce(hydrated(["large"]));
    const result = await runLocalMailSyncTick({
      emailAccountId,
      retentionAfter,
      now: clock,
      call,
      admitBackfill: async () => true,
      admitResponse: async () => ({
        allowed: true,
        logicalLimitBytes,
        maxGrowthBytes: Number.MAX_SAFE_INTEGER,
      }),
      withSyncLock,
      withStorageLock: async (commit) => commit(),
    });
    expect(result.status).toBe("storage-paused");
    const pending = await getJob("window:account");
    expect(pending?.pending).toEqual(original?.pending);
    expect(pending?.request).toEqual(original?.request);
    expect(pending?.nextAttemptAt).toBe(clock + 60_000);
    expect(await stored("large")).toBeUndefined();
    expect(
      (await database.get("searchIndexAccounts", emailAccountId))
        ?.messageBytes ?? 0,
    ).toBe(0);
    expect(
      (await readLocalMailSyncState(emailAccountId))?.leaseOwner,
    ).toBeUndefined();
    expect((await readLocalMailSyncState(emailAccountId))?.storagePaused).toBe(
      true,
    );
  });
  it("allows confirmed deletions to reduce usage even while already over capacity", async () => {
    await initializeGmail();
    await seed("deleted", now - day, now - 1000);
    await seed("retained", now - day, now - 1000);
    clock += 60_000;
    call.mockResolvedValueOnce({
      status: "ok",
      phase: "history-changes",
      result: {
        resetRequired: false,
        cursor: "next",
        messageIds: [],
        confirmedDeletedMessageIds: ["deleted"],
        hasMore: false,
      },
    });
    await runLocalMailSyncTick({
      emailAccountId,
      retentionAfter,
      now: clock,
      call,
      admitBackfill: async () => false,
      admitResponse: async () => ({
        allowed: true,
        logicalLimitBytes: Number.POSITIVE_INFINITY,
        maxGrowthBytes: 1,
      }),
      withSyncLock,
      withStorageLock: async (commit) => commit(),
    });
    expect(await stored("deleted")).toBeUndefined();
    expect(await stored("retained")).toBeDefined();
  });
  it("fences in-flight work across account cleanup and generation replacement", async () => {
    let resolve: (response: LocalMailSyncResponse) => void = () => undefined;
    call.mockImplementationOnce(
      () =>
        new Promise<LocalMailSyncResponse>((done) => {
          resolve = done;
        }),
    );
    const pending = run();
    await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));
    await clearEmailCacheForAccount(emailAccountId);
    resolve(capabilities());
    expect((await pending).status).toBe("stale");
    expect(await readLocalMailSyncState(emailAccountId)).toBeUndefined();
    expect(
      await (await getEmailCacheDatabase())!.count("localMailSyncJobs"),
    ).toBe(0);
  });
  it("takes the storage lock only after network work and rechecks admission inside it", async () => {
    let locked = false;
    call.mockImplementationOnce(async () => {
      expect(locked).toBe(false);
      return capabilities();
    });
    await runLocalMailSyncTick({
      emailAccountId,
      retentionAfter,
      now: clock,
      call,
      admitBackfill: async () => true,
      admitResponse: async () => {
        expect(locked).toBe(true);
        return {
          allowed: true,
          logicalLimitBytes: Number.POSITIVE_INFINITY,
          maxGrowthBytes: Number.MAX_SAFE_INTEGER,
        };
      },
      withSyncLock,
      withStorageLock: async (commit) => {
        locked = true;
        try {
          return await commit();
        } finally {
          locked = false;
        }
      },
    });
    expect((await readLocalMailSyncState(emailAccountId))?.strategy).toBe(
      "account-history",
    );
  });
  it("releases a still-owned claim when the device storage lock is busy", async () => {
    call.mockResolvedValueOnce(capabilities());
    const result = await runLocalMailSyncTick({
      emailAccountId,
      retentionAfter,
      now: clock,
      call,
      admitBackfill: async () => true,
      admitResponse: async () => ({
        allowed: true,
        logicalLimitBytes: Number.POSITIVE_INFINITY,
        maxGrowthBytes: Number.MAX_SAFE_INTEGER,
      }),
      withSyncLock,
      withStorageLock: async () => {
        throw new Error("busy");
      },
    });
    expect(result.status).toBe("retry");
    expect(
      (await readLocalMailSyncState(emailAccountId))?.leaseOwner,
    ).toBeUndefined();
    expect((await getJob("capabilities"))?.nextAttemptAt).toBe(clock + 5000);
  });
  it("does not partially checkpoint an incomplete hydration response", async () => {
    await initializeGmail();
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: ["first", "missing"], historyCursor: "anchor" },
    });
    expect((await tick(hydrated(["first"]))).status).toBe("retry");
    expect((await getJob("window:account"))?.pending?.offset).toBe(0);
    expect(await stored("first")).toBeUndefined();
  });
  it("hydrates current mail from incoming reserve while historical intake is paused", async () => {
    await initializeGmail();
    clock += 60_000;
    await tick(changes("incoming-page", ["incoming"]));
    call.mockResolvedValueOnce(hydrated(["incoming"]));
    const admitResponse = vi.fn(async () => ({
      allowed: true,
      logicalLimitBytes: Number.POSITIVE_INFINITY,
      maxGrowthBytes: Number.MAX_SAFE_INTEGER,
    }));
    await run({ admitBackfill: async () => false, admitResponse });
    expect(await stored("incoming")).toBeDefined();
    expect(admitResponse).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "history-hydrate" }),
      "current",
    );
  });

  it("keeps a current hydration job durable when incoming capacity is exhausted", async () => {
    await initializeGmail();
    clock += 60_000;
    await tick(changes("incoming-page", ["incoming"]));
    const job = await getJob("current");
    call.mockResolvedValueOnce(hydrated(["incoming"]));
    await run({
      admitBackfill: async () => false,
      admitResponse: async () => ({
        allowed: false,
        logicalLimitBytes: Number.POSITIVE_INFINITY,
        maxGrowthBytes: 0,
      }),
    });
    expect((await getJob("current"))?.pending).toEqual(job?.pending);
    expect(await stored("incoming")).toBeUndefined();
    expect((await readLocalMailSyncState(emailAccountId))?.storagePaused).toBe(
      true,
    );
  });

  it("preserves the exact job when actual downloaded bytes exceed storage admission", async () => {
    await initializeGmail();
    await tick({
      status: "ok",
      phase: "history-backfill",
      result: { messageIds: ["large"], historyCursor: "anchor" },
    });
    const job = await getJob("window:account");
    call.mockResolvedValueOnce(hydrated(["large"]));
    await runLocalMailSyncTick({
      emailAccountId,
      retentionAfter,
      now: clock,
      call,
      admitBackfill: async () => true,
      withSyncLock,
      withStorageLock: async (commit) => commit(),
      admitResponse: async () => ({
        allowed: false,
        logicalLimitBytes: Number.POSITIVE_INFINITY,
        maxGrowthBytes: 0,
      }),
    });
    expect((await getJob("window:account"))?.pending).toEqual(job?.pending);
    expect(await stored("large")).toBeUndefined();
    expect((await readLocalMailSyncState(emailAccountId))?.storagePaused).toBe(
      true,
    );
  });
});

async function initializeGmail() {
  await tick(capabilities());
  await tick({
    status: "ok",
    phase: "history-baseline",
    result: { cursor: "all-time-anchor" },
  });
  await tick(changes("current-cursor"));
}
function capabilities(): LocalMailSyncResponse {
  return {
    status: "ok",
    phase: "capabilities",
    result: {
      strategy: "account-history",
      excludedFolderIds: [],
      maxHydrationMessages: 25,
    },
  };
}
function changes(
  cursor: string,
  messageIds: string[] = [],
): LocalMailSyncResponse {
  return {
    status: "ok",
    phase: "history-changes",
    result: {
      resetRequired: false,
      messageIds,
      confirmedDeletedMessageIds: [],
      cursor,
      hasMore: false,
    },
  };
}
function hydrated(ids: string[]): LocalMailSyncResponse {
  return {
    status: "ok",
    phase: "history-hydrate",
    result: {
      messages: ids.map((id) => message(id)),
      removedMessageIds: [],
      confirmedDeletedMessageIds: [],
    },
  };
}
function message(id: string, receivedAt = now - day) {
  return {
    ...getMockMessage({ id, threadId: `thread-${id}` }),
    internalDate: String(receivedAt),
    date: new Date(receivedAt).toISOString(),
  };
}
async function tick(response?: LocalMailSyncResponse) {
  if (response) call.mockResolvedValueOnce(response);
  return run();
}
function run(
  overrides: Partial<Parameters<typeof runLocalMailSyncTick>[0]> = {},
) {
  return runLocalMailSyncTick({
    emailAccountId,
    retentionAfter,
    now: clock,
    call,
    admitBackfill: async () => true,
    withSyncLock,
    withStorageLock: async (commit) => commit(),
    admitResponse: async () => ({
      allowed: true,
      logicalLimitBytes: Number.POSITIVE_INFINITY,
      maxGrowthBytes: Number.MAX_SAFE_INTEGER,
    }),
    ...overrides,
  });
}
async function getJob(id: string) {
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
async function seed(id: string, receivedAt: number, fetchedAt: number) {
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
  await storeLocalMailMessages(
    transaction,
    emailAccountId,
    [message(id, receivedAt)],
    fetchedAt,
  );
  await transaction.done;
}

async function setRetentionPolicy(after: number, release = true) {
  const db = (await getEmailCacheDatabase())!;
  const tx = db.transaction(
    [
      "searchIndexAccounts",
      "localMailRetentionPolicies",
      "localMailSyncStates",
    ],
    "readwrite",
  );
  const account = (await tx
    .objectStore("searchIndexAccounts")
    .get(emailAccountId))!;
  await tx
    .objectStore("searchIndexAccounts")
    .put({ ...account, retentionRevision: 1, evictionMarkerBytes: 200 });
  await tx.objectStore("localMailRetentionPolicies").put({
    emailAccountId,
    generation: account.generation,
    revision: 1,
    requestedAfter: retentionAfter,
    automaticAfter: after,
  });
  if (release) {
    const state = (await tx
      .objectStore("localMailSyncStates")
      .get(emailAccountId))!;
    await tx.objectStore("localMailSyncStates").put({
      ...state,
      fence: state.fence + 1,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    });
  }
  await tx.done;
}

async function withSyncLock<T>(
  emailAccountId: string,
  run: () => Promise<T>,
): Promise<T | undefined> {
  if (syncLocks.has(emailAccountId)) return;
  const token = Symbol("sync-owner");
  syncLocks.set(emailAccountId, token);
  try {
    return await run();
  } finally {
    if (syncLocks.get(emailAccountId) === token)
      syncLocks.delete(emailAccountId);
  }
}
