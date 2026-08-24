"use client";

import { useCallback, useRef } from "react";
import { format } from "date-fns";
import chunk from "lodash/chunk";
import { toast } from "sonner";
import {
  cancelQueuedThreads,
  deleteEmails,
  markReadThreads,
} from "@/store/archive-queue";
import {
  markReadThreadAction,
  unarchiveThreadAction,
  untrashThreadAction,
} from "@/utils/actions/mail";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import { withThreadReadState } from "@/app/(app)/[emailAccountId]/mail/read-state";
import type {
  OptimisticThreadUpdate,
  ThreadRemoval,
} from "@/app/(app)/[emailAccountId]/mail/use-mail-threads";
import {
  getListThreadMessageIds,
  type ListThread,
} from "@/app/(app)/[emailAccountId]/mail/types";
import { snoozeThreadsAction } from "@/utils/actions/snooze";
import { mapWithConcurrency } from "@/utils/async";
import {
  markSyncedMailboxThreadsRead,
  removeSyncedMailboxThreads,
} from "@/utils/email-cache/mailbox";
import { requestMailboxSync } from "@/app/(app)/[emailAccountId]/mail/use-mailbox-sync";
import { bulkArchiveThreadsAction } from "@/utils/actions/mail-bulk-action";

const THREAD_ACTION_CONCURRENCY = 10;
const SNOOZE_ACTION_BATCH_CONCURRENCY = 2;
const SNOOZE_ACTION_BATCH_SIZE = 100;

type UndoableAction = "archive" | "delete";

type UndoableBatch = {
  type: UndoableAction;
  threadIds: string[];
  removal: ThreadRemoval;
  undone: boolean;
};

/**
 * Archive and delete with a real undo.
 *
 * Delete jobs may still be waiting in the queue, while bulk archives have
 * already completed before their undo becomes available. Anything sent to the
 * provider gets reversed properly.
 */
export function useThreadActions({
  emailAccountId,
  removeThreads,
  restoreThreads,
  optimisticallyUpdateThreads,
}: {
  emailAccountId: string;
  removeThreads: (threadIds: string[]) => ThreadRemoval;
  restoreThreads: (removal: ThreadRemoval, threadIds: string[]) => void;
  optimisticallyUpdateThreads: (
    threadIds: string[],
    updater: (thread: ListThread) => ListThread,
  ) => OptimisticThreadUpdate;
}) {
  const lastAction = useRef<UndoableBatch | null>(null);
  const actionSequence = useRef(0);

  // Takes the batch to reverse rather than reading the latest one: each toast
  // must undo the action it announced, even after another archive has happened.
  const undoBatch = useCallback(
    async (batch: UndoableBatch) => {
      if (batch.undone) return;
      batch.undone = true;
      if (lastAction.current === batch) lastAction.current = null;

      const { notCancelled } = cancelQueuedThreads({
        threadIds: batch.threadIds,
        actionType: batch.type,
      });

      const reverse =
        batch.type === "archive" ? unarchiveThreadAction : untrashThreadAction;

      const reversed = await mapWithConcurrency(
        notCancelled,
        THREAD_ACTION_CONCURRENCY,
        async (threadId) => {
          const result = await reverse(emailAccountId, { threadId });
          return { threadId, ok: !result?.serverError };
        },
      );

      // A thread the provider refused to unarchive is still archived, so
      // putting its row back would show a conversation that isn't there.
      const failed = reversed.filter((r) => !r.ok).map((r) => r.threadId);
      const restored = batch.threadIds.filter((id) => !failed.includes(id));

      restoreThreads(batch.removal, restored);
      if (restored.length) requestMailboxSync(emailAccountId);

      if (failed.length)
        toast.error(
          failed.length === batch.threadIds.length
            ? "Couldn't restore"
            : `Couldn't restore ${failed.length} of ${batch.threadIds.length}`,
        );
      else toast.success(summarise("Restored", restored.length));
    },
    [emailAccountId, restoreThreads],
  );

  // The keyboard shortcut has no toast to anchor to, so it undoes the latest.
  const undo = useCallback(async () => {
    const batch = lastAction.current;
    if (!batch) return;
    await undoBatch(batch);
  }, [undoBatch]);

  const trash = useCallback(
    (threadIds: string[]) => {
      if (!threadIds.length) return;

      actionSequence.current += 1;
      const removal = removeThreads(threadIds);
      const batch: UndoableBatch = {
        type: "delete",
        threadIds,
        removal,
        undone: false,
      };
      lastAction.current = batch;

      deleteEmails({
        threadIds,
        emailAccountId,
        onSuccess: (threadId) => {
          removeSyncedMailboxThreads({
            emailAccountId,
            threadIds: [threadId],
          })
            .catch(() => {})
            .finally(() => requestMailboxSync(emailAccountId));
        },
        // The queue reports the specific thread that failed; the rest of the
        // batch was deleted and must stay gone.
        onError: (threadId) => {
          restoreThreads(removal, [threadId]);
          toast.error("There was an error deleting");
        },
      });

      toast.success(summarise("Deleted", threadIds.length), {
        action: {
          label: `Undo · ${getShortcutHint("undo")}`,
          onClick: () => {
            undoBatch(batch);
          },
        },
      });
    },
    [emailAccountId, removeThreads, restoreThreads, undoBatch],
  );

  const archive = useCallback(
    async (threads: ListThread[]) => {
      if (!threads.length) return;

      const sequence = ++actionSequence.current;
      lastAction.current = null;
      const threadIds = threads.map((thread) => thread.id);
      const removal = removeThreads(threadIds);
      const response = await bulkArchiveThreadsAction(emailAccountId, {
        threads: threads.map((thread) => ({
          threadId: thread.id,
          messageIds: getListThreadMessageIds(thread),
        })),
      }).catch(() => null);
      const succeededThreadIds = new Set(
        response?.data?.succeededThreadIds ?? [],
      );
      const providerFailedThreadIds = new Set(
        response?.data?.failedThreadIds ?? [],
      );
      const failedThreadIds = threadIds.filter(
        (threadId) =>
          providerFailedThreadIds.has(threadId) ||
          !succeededThreadIds.has(threadId),
      );
      const failedThreadIdSet = new Set(failedThreadIds);
      const successfulThreadIds = threadIds.filter(
        (threadId) => !failedThreadIdSet.has(threadId),
      );

      restoreThreads(removal, failedThreadIds);

      if (successfulThreadIds.length) {
        await removeSyncedMailboxThreads({
          emailAccountId,
          threadIds: successfulThreadIds,
        }).catch(() => {});
        requestMailboxSync(emailAccountId);

        const batch: UndoableBatch = {
          type: "archive",
          threadIds: successfulThreadIds,
          removal,
          undone: false,
        };
        if (actionSequence.current === sequence) lastAction.current = batch;
        toast.success(summarise("Archived", successfulThreadIds.length), {
          action: {
            label: `Undo · ${getShortcutHint("undo")}`,
            onClick: () => {
              undoBatch(batch);
            },
          },
        });
      }

      if (failedThreadIds.length) {
        toast.error(
          failedThreadIds.length === threadIds.length
            ? "There was an error archiving"
            : `Couldn't archive ${failedThreadIds.length} of ${threadIds.length} conversations`,
        );
      }
    },
    [emailAccountId, removeThreads, restoreThreads, undoBatch],
  );

  const markRead = useCallback(
    (threadIds: string[]) => {
      const update = optimisticallyUpdateThreads(threadIds, (thread) =>
        withThreadReadState(thread, true),
      );
      if (!update.threadIds.length) return;
      const failedThreadIds: string[] = [];

      markReadThreads({
        threadIds: update.threadIds,
        emailAccountId,
        onSuccess: (threadId) => {
          update.commit(threadId);
          markSyncedMailboxThreadsRead({
            emailAccountId,
            read: true,
            threadIds: [threadId],
          }).catch(() => {});
        },
        onError: (threadId) => {
          failedThreadIds.push(threadId);
          toast.error("There was an error marking as read");
        },
        onSettled: () => update.rollback(failedThreadIds),
      });
    },
    [emailAccountId, optimisticallyUpdateThreads],
  );

  const setReadState = useCallback(
    async (threadIds: string[], read: boolean) => {
      const update = optimisticallyUpdateThreads(threadIds, (thread) =>
        withThreadReadState(thread, read),
      );
      if (!update.threadIds.length) return;

      const results = await mapWithConcurrency(
        update.threadIds,
        THREAD_ACTION_CONCURRENCY,
        async (threadId) => {
          try {
            const result = await markReadThreadAction(emailAccountId, {
              threadId,
              read,
            });
            return { failed: Boolean(result?.serverError), threadId };
          } catch {
            return { failed: true, threadId };
          }
        },
      );
      const failedThreadIds = results
        .filter((result) => result.failed)
        .map(({ threadId }) => threadId);

      for (const threadId of update.threadIds) {
        if (!failedThreadIds.includes(threadId)) update.commit(threadId);
      }
      update.rollback(failedThreadIds);
      const succeededThreadIds = update.threadIds.filter(
        (threadId) => !failedThreadIds.includes(threadId),
      );
      await markSyncedMailboxThreadsRead({
        emailAccountId,
        read,
        threadIds: succeededThreadIds,
      }).catch(() => {});

      if (failedThreadIds.length) {
        toast.error(
          failedThreadIds.length === update.threadIds.length
            ? `Couldn't mark as ${read ? "read" : "unread"}`
            : `Couldn't mark ${failedThreadIds.length} of ${update.threadIds.length} as ${read ? "read" : "unread"}`,
        );
        return;
      }

      toast.success(
        update.threadIds.length === 1
          ? `Marked as ${read ? "read" : "unread"}`
          : `Marked ${update.threadIds.length} as ${read ? "read" : "unread"}`,
      );
    },
    [emailAccountId, optimisticallyUpdateThreads],
  );

  const snooze = useCallback(
    async (threadIds: string[], snoozedUntil: Date) => {
      if (!threadIds.length) return;
      const removal = removeThreads(threadIds);
      const results = await mapWithConcurrency(
        chunk(threadIds, SNOOZE_ACTION_BATCH_SIZE),
        SNOOZE_ACTION_BATCH_CONCURRENCY,
        async (batch) => {
          const result = await snoozeThreadsAction(emailAccountId, {
            threadIds: batch,
            snoozedUntil,
          }).catch(() => null);
          return (
            result?.data ?? {
              failedThreadIds: batch,
              succeededThreadIds: [],
            }
          );
        },
      );
      const failedThreadIds = results.flatMap(
        (result) => result.failedThreadIds,
      );
      const succeededThreadIds = results.flatMap(
        (result) => result.succeededThreadIds,
      );

      restoreThreads(removal, failedThreadIds);
      await removeSyncedMailboxThreads({
        emailAccountId,
        threadIds: succeededThreadIds,
      }).catch(() => {});

      if (succeededThreadIds.length) {
        toast.success(
          succeededThreadIds.length === 1
            ? `Snoozed until ${format(snoozedUntil, "EEE, MMM d 'at' p")}`
            : `Snoozed ${succeededThreadIds.length} conversations`,
        );
      }
      if (failedThreadIds.length) {
        toast.error(
          failedThreadIds.length === 1
            ? "Couldn't snooze conversation"
            : `Couldn't snooze ${failedThreadIds.length} conversations`,
        );
      }
    },
    [emailAccountId, removeThreads, restoreThreads],
  );

  return {
    archive,
    trash,
    markRead,
    setReadState,
    snooze,
    undo,
  };
}

function summarise(verb: string, count: number) {
  return count === 1 ? verb : `${verb} ${count} conversations`;
}
