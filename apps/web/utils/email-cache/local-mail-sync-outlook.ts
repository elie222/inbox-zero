import type { LocalMailSyncResponse } from "@/utils/email/local-mail-sync-types";
import type { ParsedMessage } from "@/utils/types";
import { formatEmailWithName } from "@/utils/email";
import { randomUuid } from "@/utils/uuid";
import {
  deleteLocalMailMessages,
  storeLocalMailMessages,
} from "./local-mail-messages";
import type { LocalMailSyncTransaction } from "./local-mail-sync";
import {
  getLocalMailWindowAfter,
  getLocalMailSyncRetention,
  LOCAL_MAIL_HISTORY_AFTER,
  type LocalMailSyncJob,
  type LocalMailSyncState,
} from "./local-mail-sync-state";
import {
  createLocalMailWindow,
  clearLocalMailSeen,
  markLocalMailSeen,
} from "./local-mail-sync-transitions";

type DeltaPatch = Extract<
  LocalMailSyncResponse,
  { phase: "folder-changes" }
>["result"]["messages"][number];

export async function applyOutlookSyncResponse(
  transaction: LocalMailSyncTransaction,
  state: LocalMailSyncState,
  job: LocalMailSyncJob,
  response: LocalMailSyncResponse,
  fetchedAt: number,
  now: number,
) {
  const jobs = transaction.objectStore("localMailSyncJobs");
  if (response.status === "reset-required") {
    if (job.request.phase === "folder-backfill" && job.window) {
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
      };
      job.request = { ...job.request, cursor: undefined };
    } else if (job.request.phase === "folder-changes") {
      const folderId = job.request.folderId;
      const folder = state.folders[folderId];
      if (!folder) throw new Error("Unknown local mail folder");
      if (job.window)
        await clearLocalMailSeen(
          transaction,
          state.emailAccountId,
          job.window.generation,
        );
      folder.cursor = undefined;
      folder.recovering = true;
      job.request = { ...job.request, cursor: undefined };
      job.window = {
        after: LOCAL_MAIL_HISTORY_AFTER,
        before: Number.MAX_SAFE_INTEGER,
        folderId,
        generation: randomUuid(),
        startedAt: fetchedAt,
        replay: true,
        recovery: true,
        membershipOnly: true,
      };
      const windowJob = await jobs.get([
        state.emailAccountId,
        `window:${folderId}`,
      ]);
      if (windowJob?.window) {
        await clearLocalMailSeen(
          transaction,
          state.emailAccountId,
          windowJob.window.generation,
        );
        windowJob.kind = "window";
        windowJob.window.generation = randomUuid();
        windowJob.window.replay = false;
        windowJob.window.requiredRound = undefined;
        windowJob.sweepAfter = undefined;
        windowJob.request = {
          phase: "folder-backfill",
          folderId,
          after: windowJob.window.after,
          before: windowJob.window.before,
          limit: 100,
        };
        await jobs.put(windowJob);
      }
    } else throw new Error("Unexpected Outlook reset");
    job.nextAttemptAt = now;
    await jobs.put(job);
    return;
  }
  if (response.status !== "ok" || response.phase !== job.request.phase)
    throw new Error("Unexpected Outlook sync response");
  if (response.phase === "folders") {
    if (!job.discovery || job.request.phase !== "folders")
      throw new Error("Missing folder discovery checkpoint");
    const generation = job.discovery.generation;
    state.discoveryGeneration = generation;
    state.discoveryComplete = false;
    for (const folder of response.result.folders) {
      if (state.excludedFolderIds.includes(folder.id)) continue;
      await ensureFolder(transaction, state, folder.id, generation, now);
      if ((folder.childFolderCount ?? 0) > 0) {
        const childId = `folders:${folder.id}`;
        if (!(await jobs.get([state.emailAccountId, childId])))
          await jobs.put({
            emailAccountId: state.emailAccountId,
            id: childId,
            kind: "discovery",
            priority: 1,
            nextAttemptAt: now,
            attempts: 0,
            request: {
              phase: "folders",
              parentFolderId: folder.id,
              limit: 100,
            },
            discovery: { parentFolderId: folder.id, generation },
          });
      }
    }
    if (response.result.nextCursor) {
      job.request = { ...job.request, cursor: response.result.nextCursor };
      await jobs.put(job);
    } else await jobs.delete([state.emailAccountId, job.id]);
    const remaining = await jobs
      .index("byAccount")
      .getAll(state.emailAccountId);
    if (
      !remaining.some(
        (candidate) =>
          candidate.kind === "discovery" &&
          candidate.discovery?.generation === generation,
      )
    ) {
      state.discoveryComplete = true;
      for (const [folderId, folder] of Object.entries(state.folders)) {
        if (folder.seen === generation || folder.removed) continue;
        folder.removed = true;
        for (const id of [
          `delta:${folderId}`,
          `window:${folderId}`,
          `bootstrap:${folderId}`,
          `membership:${folderId}`,
        ]) {
          const obsolete = await jobs.get([state.emailAccountId, id]);
          if (obsolete?.window)
            await clearLocalMailSeen(
              transaction,
              state.emailAccountId,
              obsolete.window.generation,
            );
          await jobs.delete([state.emailAccountId, id]);
        }
        await jobs.put({
          emailAccountId: state.emailAccountId,
          id: `membership:${folderId}`,
          kind: "sweep",
          priority: 0,
          nextAttemptAt: now,
          attempts: 0,
          request: { phase: "folder-changes", folderId, limit: 100 },
          window: {
            after: LOCAL_MAIL_HISTORY_AFTER,
            before: Number.MAX_SAFE_INTEGER,
            folderId,
            generation: randomUuid(),
            startedAt: fetchedAt,
            replay: true,
            recovery: true,
            membershipOnly: true,
            requiredRound: folder.round,
          },
        });
      }
      await jobs.put({
        emailAccountId: state.emailAccountId,
        id: "folders:root",
        kind: "discovery",
        priority: 1,
        nextAttemptAt: now + 15 * 60_000,
        attempts: 0,
        request: { phase: "folders", limit: 100 },
        discovery: { generation: generation + 1 },
      });
    }
    return;
  }
  if (response.phase === "folder-changes") {
    if (job.request.phase !== "folder-changes")
      throw new Error("Missing delta checkpoint");
    const folderId = job.request.folderId;
    const folder = state.folders[folderId];
    if (!folder) throw new Error("Unknown local mail folder");
    if (job.window?.membershipOnly && !job.request.cursor)
      job.window.startedAt = fetchedAt;
    const allJobs = await jobs.index("byAccount").getAll(state.emailAccountId);
    const windows = allJobs.filter(
      (candidate) => candidate.window?.folderId === folderId,
    );
    for (const patch of response.result.messages) {
      for (const active of windows)
        if (active.window)
          await markLocalMailSeen(
            transaction,
            state.emailAccountId,
            active.window.generation,
            [patch.id],
          );
      const existing = await transaction
        .objectStore("localMailMessages")
        .get([state.emailAccountId, patch.id]);
      const timestamp =
        patch.internalDate === undefined || patch.internalDate === null
          ? undefined
          : Number(patch.internalDate);
      if (existing) {
        await storeLocalMailMessages(
          transaction,
          state.emailAccountId,
          [mergeMetadata(existing.data, patch)],
          fetchedAt,
          {
            metadataOnly: true,
            retention: getLocalMailSyncRetention(state, job),
          },
        );
        if (
          (folder.cursor ||
            (folder.recovering && folder.round > 0) ||
            existing.receivedAt < state.retainedAfter) &&
          ((patch.changeKey !== undefined &&
            patch.changeKey !== existing.data.historyId) ||
            (patch.parentFolderId !== undefined &&
              patch.parentFolderId !== existing.data.parentFolderId) ||
            patch.isDraft === true)
        )
          await queueOutlookLookup(transaction, state, {
            messageId: patch.id,
            folderId,
            now,
            retainHistoricalImport: Boolean(folder.cursor),
            historical: folder.round === 0,
          });
      } else if (
        folder.cursor ||
        (folder.recovering &&
          folder.round > 0 &&
          (timestamp === undefined || timestamp >= state.retainedAfter))
      ) {
        await queueOutlookLookup(transaction, state, {
          messageId: patch.id,
          folderId,
          now,
          retainHistoricalImport: Boolean(folder.cursor),
        });
      }
    }
    for (const id of new Set([
      ...response.result.removedMessageIds,
      ...response.result.requiresReconciliationMessageIds,
    ])) {
      if (
        folder.cursor ||
        (folder.recovering && folder.round > 0) ||
        (await transaction
          .objectStore("localMailMessages")
          .get([state.emailAccountId, id]))
      )
        await queueOutlookLookup(transaction, state, {
          messageId: id,
          folderId,
          now,
          historical: folder.round === 0,
        });
    }
    job.request = { ...job.request, cursor: response.result.cursor };
    if (
      response.result.hasMore &&
      folder.round === 0 &&
      !folder.bootstrapComplete
    ) {
      const id = `bootstrap:${folderId}`;
      if (!(await jobs.get([state.emailAccountId, id])))
        await jobs.put({
          emailAccountId: state.emailAccountId,
          id,
          kind: "bootstrap",
          priority: 0.5,
          nextAttemptAt: now,
          attempts: 0,
          request: {
            phase: "folder-backfill",
            folderId,
            after: state.retainedAfter,
            before: state.snapshotBefore,
            limit: 5,
          },
        });
    }
    if (!response.result.hasMore) {
      await jobs.delete([state.emailAccountId, `bootstrap:${folderId}`]);
      if (folder.round === 0) {
        const initialWindow = await jobs.get([
          state.emailAccountId,
          `window:${folderId}`,
        ]);
        if (
          !initialWindow?.window ||
          initialWindow.kind !== "window" ||
          initialWindow.request.phase !== "folder-backfill" ||
          initialWindow.request.cursor
        )
          throw new Error("Missing initial folder body window");
        folder.before = now;
        folder.after = now;
        initialWindow.window.before = now;
        initialWindow.request.before = now;
        await jobs.put(initialWindow);
      }
      job.request = { ...job.request, stream: "changes" };
      folder.cursor = response.result.cursor;
      folder.round += 1;
      job.nextAttemptAt = now + 60_000;
      if (job.window?.membershipOnly) {
        await jobs.put({
          ...job,
          id: `membership:${folderId}`,
          kind: "sweep",
          priority: 0,
          nextAttemptAt: now,
          window: { ...job.window, requiredRound: folder.round },
        });
        job.window = undefined;
      }
    }
    await jobs.put(job);
    return;
  }
  if (response.phase === "folder-backfill") {
    if (job.kind === "bootstrap" && job.request.phase === "folder-backfill") {
      const folder = state.folders[job.request.folderId];
      if (!folder || folder.removed)
        throw new Error("Unknown bootstrap folder");
      await storeLocalMailMessages(
        transaction,
        state.emailAccountId,
        response.result.messages.map((entry) => ({
          ...entry.message,
          historyId: entry.changeKey ?? entry.message.historyId,
          hasAttachment: entry.hasAttachments,
        })),
        fetchedAt,
        { retention: getLocalMailSyncRetention(state, job) },
      );
      // A pre-anchor preview cannot establish coverage. The ordinary window
      // re-enumerates this bounded overlap after the metadata baseline completes.
      folder.bootstrapComplete = true;
      await jobs.delete([state.emailAccountId, job.id]);
      return;
    }
    if (!job.window || job.request.phase !== "folder-backfill")
      throw new Error("Missing body window");
    if (!job.request.cursor) {
      job.window.startedAt = fetchedAt;
      // Initial metadata can precede deletions that the later body snapshot
      // must reconcile, so it cannot count as evidence for this enumeration.
      await clearLocalMailSeen(
        transaction,
        state.emailAccountId,
        job.window.generation,
      );
    }
    const messages = response.result.messages.map((entry) => ({
      ...entry.message,
      historyId: entry.changeKey ?? entry.message.historyId,
      hasAttachment: entry.hasAttachments,
    }));
    await storeLocalMailMessages(
      transaction,
      state.emailAccountId,
      messages,
      fetchedAt,
      { retention: getLocalMailSyncRetention(state, job) },
    );
    await markLocalMailSeen(
      transaction,
      state.emailAccountId,
      job.window.generation,
      messages.map(({ id }) => id),
    );
    if (response.result.nextCursor)
      job.request = { ...job.request, cursor: response.result.nextCursor };
    else {
      const folderId = job.request.folderId;
      const folder = state.folders[folderId];
      if (!folder?.cursor)
        throw new Error("Body coverage requires a delta baseline");
      job.kind = "sweep";
      job.window.replay = true;
      job.window.requiredRound = folder.round + 1;
      const delta = await jobs.get([state.emailAccountId, `delta:${folderId}`]);
      if (!delta) throw new Error("Missing folder reconciliation job");
      delta.nextAttemptAt = now;
      await jobs.put(delta);
    }
    await jobs.put(job);
    return;
  }
  if (response.phase === "message-lookup") {
    if (job.request.phase !== "message-lookup")
      throw new Error("Missing message lookup");
    const result = response.result;
    if (result.status === "notFound")
      await deleteLocalMailMessages(
        transaction,
        state.emailAccountId,
        [job.request.messageId],
        fetchedAt,
      );
    else {
      const message = {
        ...result.message,
        historyId: result.changeKey ?? result.message.historyId,
        // Outlook reports presence separately from the message body.
        hasAttachment: result.hasAttachments,
      };
      const receivedAt = Number(message.internalDate);
      if (!Number.isFinite(receivedAt))
        throw new Error("Invalid Outlook message timestamp");
      const existing = await transaction
        .objectStore("localMailMessages")
        .get([state.emailAccountId, message.id]);
      if (
        (receivedAt < state.retainedAfter &&
          !job.retainHistoricalImport &&
          !existing) ||
        state.excludedFolderIds.includes(message.parentFolderId ?? "") ||
        message.labelIds?.includes("DRAFT")
      )
        await deleteLocalMailMessages(
          transaction,
          state.emailAccountId,
          [message.id],
          fetchedAt,
        );
      else {
        await storeLocalMailMessages(
          transaction,
          state.emailAccountId,
          [message],
          fetchedAt,
          { retention: getLocalMailSyncRetention(state, job) },
        );
        if (
          message.parentFolderId &&
          (!state.folders[message.parentFolderId] ||
            state.folders[message.parentFolderId]?.removed)
        )
          await ensureFolder(
            transaction,
            state,
            message.parentFolderId,
            state.discoveryGeneration,
            now,
          );

        const activeJobs = await jobs
          .index("byAccount")
          .getAll(state.emailAccountId);
        for (const active of activeJobs)
          if (
            active.window &&
            active.window.folderId === message.parentFolderId &&
            receivedAt >= active.window.after &&
            receivedAt < active.window.before
          )
            await markLocalMailSeen(
              transaction,
              state.emailAccountId,
              active.window.generation,
              [message.id],
            );
      }
    }
    await jobs.delete([state.emailAccountId, job.id]);
    return;
  }
  throw new Error("Unsupported Outlook sync phase");
}

export async function queueOutlookLookup(
  transaction: LocalMailSyncTransaction,
  state: LocalMailSyncState,
  {
    messageId,
    folderId,
    now,
    retainHistoricalImport = false,
    historical = false,
  }: {
    messageId: string;
    folderId: string;
    now: number;
    retainHistoricalImport?: boolean;
    historical?: boolean;
  },
) {
  const jobs = transaction.objectStore("localMailSyncJobs");
  const id = `lookup:${messageId}`;
  if (
    state.retentionRevision !== undefined &&
    (await transaction
      .objectStore("localMailEvictedMessages")
      .getKey([state.emailAccountId, messageId]))
  ) {
    await jobs.delete([state.emailAccountId, id]);
    return;
  }
  const previous = await jobs.get([state.emailAccountId, id]);
  const background =
    historical &&
    (!previous ||
      (previous.request.phase === "message-lookup" &&
        previous.request.stream === "backfill"));
  await jobs.put({
    emailAccountId: state.emailAccountId,
    id,
    kind: "lookup",
    priority: background ? 2 : 0,
    nextAttemptAt: previous?.nextAttemptAt ?? now,
    attempts: previous?.attempts ?? 0,
    request: {
      phase: "message-lookup",
      messageId,
      stream: background ? "backfill" : "changes",
    },
    retainHistoricalImport:
      retainHistoricalImport || previous?.retainHistoricalImport,
    lookupFolderIds: [
      ...new Set([...(previous?.lookupFolderIds ?? []), folderId]),
    ],
  });
}

export async function completeOutlookWindow(
  transaction: LocalMailSyncTransaction,
  state: LocalMailSyncState,
  job: LocalMailSyncJob,
  now: number,
) {
  const window = job.window;
  if (!window?.folderId) throw new Error("Missing folder coverage");
  const folder = state.folders[window.folderId];
  if (!folder) throw new Error("Unknown local mail folder");
  if (window.membershipOnly) {
    folder.recovering = false;
    return;
  }
  if (folder.after !== window.before)
    throw new Error("Noncontiguous folder coverage");
  folder.after = window.after;
  if (window.after > state.retentionAfter) {
    const size = Math.max(window.before - window.after, 1) * 4;
    const after = getLocalMailWindowAfter(
      state.retentionAfter,
      window.after,
      size,
    );
    state.retainedAfter = Math.min(state.retainedAfter, after);
    await createLocalMailWindow(
      transaction,
      state,
      after,
      window.after,
      now,
      window.folderId,
    );
  }
  const included = Object.values(state.folders).filter(
    (entry) => !entry.removed,
  );
  if (
    included.length &&
    state.discoveryComplete &&
    included.every((entry) => !entry.recovering)
  )
    state.coverage = {
      after: Math.max(...included.map((entry) => entry.after)),
      before: Math.min(...included.map((entry) => entry.before)),
    };
}

async function ensureFolder(
  transaction: LocalMailSyncTransaction,
  state: LocalMailSyncState,
  folderId: string,
  generation: number,
  now: number,
) {
  const existing = state.folders[folderId];
  if (existing && !existing.removed) {
    existing.seen = generation;
    return;
  }
  state.coverage = undefined;
  state.folders[folderId] = {
    after: state.snapshotBefore,
    before: state.snapshotBefore,
    round: 0,
    seen: generation,
  };
  await transaction.objectStore("localMailSyncJobs").put({
    emailAccountId: state.emailAccountId,
    id: `delta:${folderId}`,
    kind: "delta",
    priority: 1,
    nextAttemptAt: now,
    attempts: 0,
    request: {
      phase: "folder-changes",
      folderId,
      limit: 100,
      stream: "backfill",
    },
  });
  await createLocalMailWindow(
    transaction,
    state,
    state.retainedAfter,
    state.snapshotBefore,
    now,
    folderId,
  );
}
function mergeMetadata(
  previous: ParsedMessage & { hasAttachment?: boolean },
  patch: DeltaPatch,
): ParsedMessage & { hasAttachment?: boolean } {
  const result = {
    ...previous,
    headers: { ...previous.headers },
    labelIds: [...(previous.labelIds ?? [])],
  };
  if (patch.conversationId) result.threadId = patch.conversationId;
  if (patch.subject !== undefined) {
    result.subject = patch.subject ?? "";
    result.headers.subject = patch.subject ?? "";
  }
  if (patch.bodyPreview !== undefined) result.snippet = patch.bodyPreview ?? "";
  if (patch.hasAttachments !== undefined)
    result.hasAttachment = patch.hasAttachments ?? undefined;
  if (patch.internalDate !== undefined && patch.internalDate !== null)
    result.internalDate = patch.internalDate;
  if (patch.parentFolderId !== undefined)
    result.parentFolderId = patch.parentFolderId ?? undefined;
  if (patch.from !== undefined)
    result.headers.from = formatEmailWithName(
      patch.from?.emailAddress?.name,
      patch.from?.emailAddress?.address,
    );
  if (patch.toRecipients !== undefined)
    result.headers.to = (patch.toRecipients ?? [])
      .map((recipient) =>
        formatEmailWithName(
          recipient.emailAddress?.name,
          recipient.emailAddress?.address,
        ),
      )
      .join(", ");
  if (patch.ccRecipients !== undefined)
    result.headers.cc = (patch.ccRecipients ?? [])
      .map((recipient) =>
        formatEmailWithName(
          recipient.emailAddress?.name,
          recipient.emailAddress?.address,
        ),
      )
      .join(", ");
  if (patch.internetMessageId !== undefined)
    result.headers["message-id"] = patch.internetMessageId ?? undefined;
  if (patch.webLink !== undefined)
    result.externalUrl = patch.webLink ?? undefined;
  if (patch.conversationIndex !== undefined)
    result.conversationIndex = patch.conversationIndex ?? undefined;
  if (patch.categoryIds !== undefined) {
    const systemLabels = new Set([
      "INBOX",
      "SENT",
      "UNREAD",
      "STARRED",
      "IMPORTANT",
      "SPAM",
      "TRASH",
      "DRAFT",
      "ARCHIVE",
    ]);
    result.labelIds = [
      ...new Set([
        ...result.labelIds.filter((label) => systemLabels.has(label)),
        ...patch.categoryIds,
      ]),
    ];
  }
  if (patch.isRead !== undefined && patch.isRead !== null)
    result.labelIds = patch.isRead
      ? result.labelIds.filter((label) => label !== "UNREAD")
      : [...new Set([...result.labelIds, "UNREAD"])];
  if (patch.flag !== undefined)
    result.labelIds =
      patch.flag?.flagStatus === "flagged"
        ? [...new Set([...result.labelIds, "STARRED"])]
        : result.labelIds.filter((label) => label !== "STARRED");
  return result;
}
