import type { LocalMailRetentionPolicy } from "./local-mail-retention-types";
import {
  queueRetainedMailReconciliation,
  advanceRetainedMailReconciliation,
} from "./local-mail-sync-retained";
import type { LocalMailSyncResponse } from "@/utils/email/local-mail-sync-types";
import { randomUuid } from "@/utils/uuid";
import {
  deleteLocalMailMessages,
  storeLocalMailMessages,
} from "./local-mail-messages";
import type { LocalMailSyncTransaction } from "./local-mail-sync";
import {
  applyOutlookSyncResponse,
  completeOutlookWindow,
  queueOutlookLookup,
} from "./local-mail-sync-outlook";
import {
  LOCAL_MAIL_HISTORY_AFTER,
  getLocalMailSyncRetention,
  getLocalMailWindowAfter,
  LOCAL_MAIL_FIRST_WINDOW_MS,
  type LocalMailSyncJob,
  type LocalMailSyncState,
} from "./local-mail-sync-state";

export async function applyLocalMailSyncResponse(
  transaction: LocalMailSyncTransaction,
  state: LocalMailSyncState,
  job: LocalMailSyncJob,
  response: LocalMailSyncResponse,
  fetchedAt: number,
  now: number,
) {
  if (response.status === "reset-required") {
    if (response.phase !== job.request.phase)
      throw new Error("Unexpected local mail reset");
    if (state.strategy === "folder-delta")
      return applyOutlookSyncResponse(
        transaction,
        state,
        job,
        response,
        fetchedAt,
        now,
      );
    if (job.kind === "current") {
      state.recovering = true;
      job.request = {
        phase: "history-baseline",
        after: LOCAL_MAIL_HISTORY_AFTER,
      };
    } else if (job.window) {
      await clearLocalMailSeen(
        transaction,
        state.emailAccountId,
        job.window.generation,
      );
      job.window = {
        ...job.window,
        generation: randomUuid(),
        startedAt: fetchedAt,
        replay: false,
        historyCursor: undefined,
      };
      job.request = {
        phase: "history-backfill",
        after: job.window.after,
        before: job.window.before,
        limit: 100,
      };
    }
    job.pending = undefined;
    job.nextAttemptAt = now;
    await transaction.objectStore("localMailSyncJobs").put(job);
    return;
  }
  if (response.status !== "ok" || response.phase !== job.request.phase)
    throw new Error("Unexpected local mail sync response");
  job.attempts = 0;
  job.nextAttemptAt = now;
  if (response.phase === "capabilities") {
    state.strategy = response.result.strategy;
    state.excludedFolderIds = response.result.excludedFolderIds;
    await transaction
      .objectStore("localMailSyncJobs")
      .delete([state.emailAccountId, job.id]);
    if (state.strategy === "account-history") {
      await transaction.objectStore("localMailSyncJobs").put({
        emailAccountId: state.emailAccountId,
        id: "current",
        kind: "current",
        priority: 0,
        nextAttemptAt: now,
        attempts: 0,
        request: {
          phase: "history-baseline",
          after: LOCAL_MAIL_HISTORY_AFTER,
        },
      });
      await createLocalMailWindow(
        transaction,
        state,
        state.retainedAfter,
        state.snapshotBefore,
        now,
      );
    } else {
      await transaction.objectStore("localMailSyncJobs").put({
        emailAccountId: state.emailAccountId,
        id: "folders:root",
        kind: "discovery",
        priority: 1,
        nextAttemptAt: now,
        attempts: 0,
        request: { phase: "folders", limit: 100 },
        discovery: { generation: state.discoveryGeneration },
      });
    }
    return;
  }
  if (state.strategy === "folder-delta")
    return applyOutlookSyncResponse(
      transaction,
      state,
      job,
      response,
      fetchedAt,
      now,
    );
  if (response.phase === "history-baseline") {
    job.request = {
      phase: "history-changes",
      after: LOCAL_MAIL_HISTORY_AFTER,
      cursor: response.result.cursor,
      limit: 100,
    };
    if (!state.recovering) {
      const initialWindow = await transaction
        .objectStore("localMailSyncJobs")
        .get([state.emailAccountId, "window:account"]);
      if (
        !initialWindow?.window ||
        initialWindow.kind !== "window" ||
        initialWindow.request.phase !== "history-backfill" ||
        initialWindow.request.cursor ||
        initialWindow.pending
      )
        throw new Error("Missing initial mailbox window");
      // The history anchor is captured after activation. End the first snapshot
      // after that capture so arrivals during setup belong to at least one stream.
      state.snapshotBefore = now;
      initialWindow.window.before = now;
      initialWindow.request.before = now;
      await transaction.objectStore("localMailSyncJobs").put(initialWindow);
    }
    if (state.recovering) {
      await queueRetainedMailReconciliation(transaction, state, now);
      job.nextAttemptAt = Number.MAX_SAFE_INTEGER;
      await createLocalMailWindow(
        transaction,
        state,
        state.retainedAfter,
        now,
        now,
        undefined,
        true,
      );
    }
  } else if (
    response.phase === "history-backfill" ||
    response.phase === "history-changes"
  ) {
    const ids = await withoutEvictedMessages(
      transaction,
      state,
      response.result.messageIds,
    );
    if (job.window) {
      if (
        response.phase === "history-backfill" &&
        job.request.phase === "history-backfill" &&
        !job.request.cursor
      )
        job.window.startedAt = fetchedAt;
    }
    if (response.phase === "history-changes")
      await deleteLocalMailMessages(
        transaction,
        state.emailAccountId,
        response.result.confirmedDeletedMessageIds,
        fetchedAt,
      );
    job.pending =
      response.phase === "history-backfill"
        ? {
            ids,
            offset: 0,
            phase: response.phase,
            cursor: response.result.nextCursor,
            historyCursor: response.result.historyCursor,
            hasMore: Boolean(response.result.nextCursor),
          }
        : {
            ids,
            offset: 0,
            phase: response.phase,
            cursor: response.result.cursor,
            hasMore: response.result.hasMore,
          };
    if (ids.length) setHydrationRequest(job);
    else advanceGmailCheckpoint(job, now);
  } else if (response.phase === "history-hydrate") {
    if (job.request.phase !== "history-hydrate")
      throw new Error("Missing hydration request");
    const returnedIds = [
      ...response.result.messages.map(({ id }) => id),
      ...response.result.removedMessageIds,
      ...response.result.confirmedDeletedMessageIds,
    ];
    const returned = new Set(returnedIds);
    if (
      returned.size !== returnedIds.length ||
      returned.size !== job.request.messageIds.length ||
      job.request.messageIds.some((id) => !returned.has(id))
    )
      throw new Error("Incomplete local mail hydration response");
    await storeLocalMailMessages(
      transaction,
      state.emailAccountId,
      response.result.messages,
      fetchedAt,
      { retention: getLocalMailSyncRetention(state, job) },
    );
    await deleteLocalMailMessages(
      transaction,
      state.emailAccountId,
      response.result.confirmedDeletedMessageIds,
      fetchedAt,
    );
    if (job.kind === "retained") {
      await deleteLocalMailMessages(
        transaction,
        state.emailAccountId,
        response.result.removedMessageIds,
        fetchedAt,
      );
      await advanceRetainedMailReconciliation(transaction, job, now);
      return;
    }
    const inRange: string[] = [];
    const request = job.request;
    if (request.phase !== "history-hydrate" || !job.pending)
      throw new Error("Missing durable hydration work");
    for (const id of response.result.removedMessageIds) {
      const existing = await transaction
        .objectStore("localMailMessages")
        .get([state.emailAccountId, id]);
      if (
        existing &&
        existing.receivedAt >= request.after &&
        (request.before === undefined || existing.receivedAt < request.before)
      )
        inRange.push(id);
    }
    await deleteLocalMailMessages(
      transaction,
      state.emailAccountId,
      inRange,
      fetchedAt,
    );
    if (job.window)
      await markLocalMailSeen(
        transaction,
        state.emailAccountId,
        job.window.generation,
        response.result.messages.map(({ id }) => id),
      );
    job.pending.offset += request.messageIds.length;
    if (job.pending.offset < job.pending.ids.length) setHydrationRequest(job);
    else advanceGmailCheckpoint(job, now);
  } else throw new Error("Unsupported Gmail sync phase");
  await transaction.objectStore("localMailSyncJobs").put(job);
}

export async function createLocalMailWindow(
  transaction: LocalMailSyncTransaction,
  state: LocalMailSyncState,
  after: number,
  before: number,
  now: number,
  folderId?: string,
  recovery = false,
) {
  if (after >= before) return;
  const id = recovery ? "recovery" : `window:${folderId ?? "account"}`;
  await transaction.objectStore("localMailSyncJobs").put({
    emailAccountId: state.emailAccountId,
    id,
    kind: "window",
    priority: recovery
      ? 0
      : 2 +
        Math.ceil(
          Math.max(0, state.snapshotBefore - before) /
            LOCAL_MAIL_FIRST_WINDOW_MS,
        ),
    nextAttemptAt: now,
    attempts: 0,
    request: folderId
      ? { phase: "folder-backfill", folderId, after, before, limit: 100 }
      : { phase: "history-backfill", after, before, limit: 100 },
    window: {
      after,
      before,
      folderId,
      generation: randomUuid(),
      startedAt: now,
      replay: false,
      recovery,
    },
  });
}

export async function markLocalMailSeen(
  transaction: LocalMailSyncTransaction,
  emailAccountId: string,
  generation: string,
  ids: string[],
) {
  for (const messageId of ids)
    await transaction
      .objectStore("localMailSyncSeen")
      .put({ emailAccountId, generation, messageId });
}

export async function sweepLocalMailSyncWindow(
  transaction: LocalMailSyncTransaction,
  state: LocalMailSyncState,
  job: LocalMailSyncJob,
  now: number,
) {
  const window = job.window;
  if (!window) throw new Error("Missing mail reconciliation scope");
  const folderId = window.folderId;
  if (folderId) {
    const folder = state.folders[folderId];
    const jobs = await transaction
      .objectStore("localMailSyncJobs")
      .index("byAccount")
      .getAll(state.emailAccountId);
    if (
      !folder ||
      folder.round < (window.requiredRound ?? 0) ||
      jobs.some(
        (candidate) =>
          candidate.kind === "lookup" &&
          candidate.lookupFolderIds?.includes(folderId),
      )
    ) {
      job.nextAttemptAt = now + 1000;
      await transaction.objectStore("localMailSyncJobs").put(job);
      return;
    }
  }
  const range = IDBKeyRange.bound(
    [state.emailAccountId, job.sweepAfter?.receivedAt ?? window.after],
    [state.emailAccountId, window.before],
    false,
    true,
  );
  let cursor = await transaction
    .objectStore("localMailMessages")
    .index("byAccountReceivedAt")
    .openCursor(range);
  if (cursor && job.sweepAfter) {
    const previousPrimary: [string, string] = [
      state.emailAccountId,
      job.sweepAfter.messageId,
    ];
    if (
      cursor.value.receivedAt === job.sweepAfter.receivedAt &&
      cursor.value.messageId < job.sweepAfter.messageId
    )
      cursor = await cursor.continuePrimaryKey(
        [state.emailAccountId, job.sweepAfter.receivedAt],
        previousPrimary,
      );
    if (cursor?.value.messageId === job.sweepAfter.messageId)
      cursor = await cursor.continue();
  }
  let count = 0;
  while (cursor && count < 100) {
    const row = cursor.value;
    job.sweepAfter = { receivedAt: row.receivedAt, messageId: row.messageId };
    if (
      (!folderId || row.data.parentFolderId === folderId) &&
      row.fetchedAt <= window.startedAt &&
      !(await transaction
        .objectStore("localMailSyncSeen")
        .get([state.emailAccountId, window.generation, row.messageId]))
    )
      if (folderId)
        await queueOutlookLookup(transaction, state, {
          messageId: row.messageId,
          folderId,
          now,
          historical: !window.recovery,
        });
      else
        await deleteLocalMailMessages(
          transaction,
          state.emailAccountId,
          [row.messageId],
          window.startedAt,
        );
    count += 1;
    cursor = await cursor.continue();
  }
  if (cursor) {
    job.nextAttemptAt = now;
    await transaction.objectStore("localMailSyncJobs").put(job);
    return;
  }
  if (folderId) {
    const lookups = await transaction
      .objectStore("localMailSyncJobs")
      .index("byAccount")
      .getAll(state.emailAccountId);
    if (
      lookups.some(
        (candidate) =>
          candidate.kind === "lookup" &&
          candidate.lookupFolderIds?.includes(folderId),
      )
    ) {
      job.nextAttemptAt = now + 1000;
      await transaction.objectStore("localMailSyncJobs").put(job);
      return;
    }
  }
  await clearLocalMailSeen(
    transaction,
    state.emailAccountId,
    window.generation,
  );
  await transaction
    .objectStore("localMailSyncJobs")
    .delete([state.emailAccountId, job.id]);
  if (folderId) return completeOutlookWindow(transaction, state, job, now);
  if (
    state.coverage &&
    !window.recovery &&
    state.coverage.after !== window.before
  )
    throw new Error("Noncontiguous mail coverage");
  state.coverage = {
    after: window.after,
    before: Math.max(state.coverage?.before ?? window.before, window.before),
  };
  if (window.recovery) {
    state.recovering = false;
    const jobs = await transaction
      .objectStore("localMailSyncJobs")
      .index("byAccount")
      .getAll(state.emailAccountId);
    for (const candidate of jobs) {
      if (candidate.kind === "window" || candidate.kind === "sweep") {
        if (candidate.window)
          await clearLocalMailSeen(
            transaction,
            state.emailAccountId,
            candidate.window.generation,
          );
        await transaction
          .objectStore("localMailSyncJobs")
          .delete([state.emailAccountId, candidate.id]);
      }
      if (candidate.kind === "current") {
        candidate.nextAttemptAt = now;
        await transaction.objectStore("localMailSyncJobs").put(candidate);
      }
    }
  }
  if (window.after > state.retentionAfter) {
    state.nextWindowSize = Math.min(
      Number.MAX_SAFE_INTEGER,
      state.nextWindowSize * 4,
    );
    const after = getLocalMailWindowAfter(
      state.retentionAfter,
      window.after,
      state.nextWindowSize,
    );
    state.retainedAfter = after;
    await createLocalMailWindow(transaction, state, after, window.after, now);
  }
}

export async function clearLocalMailSeen(
  transaction: LocalMailSyncTransaction,
  emailAccountId: string,
  generation: string,
) {
  await transaction
    .objectStore("localMailSyncSeen")
    .delete(
      IDBKeyRange.bound(
        [emailAccountId, generation, ""],
        [emailAccountId, generation, []],
      ),
    );
}
function setHydrationRequest(job: LocalMailSyncJob) {
  if (!job.pending) throw new Error("Missing hydration work");
  job.request = {
    phase: "history-hydrate",
    after: job.window?.after ?? LOCAL_MAIL_HISTORY_AFTER,
    before: job.window?.before,
    messageIds: job.pending.ids.slice(
      job.pending.offset,
      job.pending.offset + 5,
    ),
    stream: job.kind === "current" ? "changes" : "backfill",
  };
}
function advanceGmailCheckpoint(job: LocalMailSyncJob, now: number) {
  const pending = job.pending;
  if (!pending) throw new Error("Missing enumeration checkpoint");
  job.pending = undefined;
  if (pending.phase === "history-backfill") {
    if (!job.window || !pending.historyCursor)
      throw new Error("Missing window history baseline");
    job.window.historyCursor = pending.historyCursor;
    if (pending.hasMore)
      job.request = {
        phase: "history-backfill",
        after: job.window.after,
        before: job.window.before,
        cursor: pending.cursor,
        limit: 100,
      };
    else {
      job.window.replay = true;
      job.request = {
        phase: "history-changes",
        after: job.window.after,
        before: job.window.before,
        cursor: pending.historyCursor,
        limit: 100,
      };
    }
  } else {
    if (!pending.cursor) throw new Error("Missing history checkpoint");
    job.request = {
      phase: "history-changes",
      after: job.window?.after ?? LOCAL_MAIL_HISTORY_AFTER,
      before: job.window?.before,
      cursor: pending.cursor,
      limit: 100,
    };
    if (!pending.hasMore) {
      if (job.window) {
        job.kind = "sweep";
        job.priority = 2;
      } else job.nextAttemptAt = now + 60_000;
    }
  }
}

export async function synchronizeLocalMailRetention(
  transaction: LocalMailSyncTransaction,
  state: LocalMailSyncState,
  policy: LocalMailRetentionPolicy,
  now: number,
) {
  const floor = Math.max(
    state.retentionAfter,
    policy.requestedAfter,
    policy.automaticAfter,
  );
  state.retentionRevision = policy.revision;
  state.retentionAfter = floor;
  state.retainedAfter = Math.max(state.retainedAfter, floor);
  state.fence++;
  state.leaseOwner = undefined;
  state.leaseExpiresAt = undefined;
  if (state.coverage)
    state.coverage =
      floor < state.coverage.before
        ? { ...state.coverage, after: Math.max(state.coverage.after, floor) }
        : undefined;
  for (const folder of Object.values(state.folders))
    folder.after = Math.min(folder.before, Math.max(folder.after, floor));
  const store = transaction.objectStore("localMailSyncJobs");
  const jobs = await store.index("byAccount").getAll(state.emailAccountId);
  for (const job of jobs) {
    if (job.kind === "bootstrap" && job.request.phase === "folder-backfill") {
      if (job.request.before <= floor)
        await store.delete([state.emailAccountId, job.id]);
      else if (job.request.after < floor)
        await store.put({
          ...job,
          request: { ...job.request, after: floor, cursor: undefined },
        });
      continue;
    }
    if (!job.window || job.window.membershipOnly || job.window.after >= floor)
      continue;
    await clearLocalMailSeen(
      transaction,
      state.emailAccountId,
      job.window.generation,
    );
    await store.delete([state.emailAccountId, job.id]);
    if (job.window.before > floor)
      await createLocalMailWindow(
        transaction,
        state,
        floor,
        job.window.before,
        now,
        job.window.folderId,
        job.window.recovery,
      );
  }
  if (
    state.recovering &&
    jobs.some(
      (job) =>
        job.kind === "current" && job.request.phase !== "history-baseline",
    )
  )
    await queueRetainedMailReconciliation(transaction, state, now);
}

export async function prepareLocalMailRetentionJobs(
  transaction: LocalMailSyncTransaction,
  state: LocalMailSyncState,
  now: number,
) {
  const store = transaction.objectStore("localMailSyncJobs");
  const jobs = await store.index("byAccount").getAll(state.emailAccountId);
  for (const job of jobs) {
    if (job.request.phase === "message-lookup") {
      if (
        await transaction
          .objectStore("localMailEvictedMessages")
          .get([state.emailAccountId, job.request.messageId])
      )
        // Local absence is intentional. It needs no body lookup or membership
        // dependency; the marker remains until confirmed deletion or restoration.
        await store.delete([state.emailAccountId, job.id]);
    } else if (job.pending) {
      const remaining = job.pending.ids.slice(job.pending.offset);
      const ids = await withoutEvictedMessages(transaction, state, remaining);
      if (ids.length === remaining.length) continue;
      job.pending = { ...job.pending, ids, offset: 0 };
      if (ids.length) setHydrationRequest(job);
      else advanceGmailCheckpoint(job, now);
      await store.put(job);
    } else if (
      job.kind === "retained" &&
      job.request.phase === "history-hydrate"
    ) {
      const ids = await withoutEvictedMessages(
        transaction,
        state,
        job.request.messageIds,
      );
      if (ids.length === job.request.messageIds.length) continue;
      if (ids.length)
        await store.put({
          ...job,
          request: { ...job.request, messageIds: ids },
        });
      else await advanceRetainedMailReconciliation(transaction, job, now);
    }
  }
}

async function withoutEvictedMessages(
  transaction: LocalMailSyncTransaction,
  state: LocalMailSyncState,
  ids: string[],
) {
  if (state.retentionRevision === undefined) return ids;
  const markers = await Promise.all(
    ids.map((id) =>
      transaction
        .objectStore("localMailEvictedMessages")
        .getKey([state.emailAccountId, id]),
    ),
  );
  return ids.filter((_id, index) => !markers[index]);
}
