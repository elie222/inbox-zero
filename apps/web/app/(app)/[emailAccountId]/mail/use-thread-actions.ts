"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  archiveEmails,
  cancelQueuedThreads,
  deleteEmails,
} from "@/store/archive-queue";
import {
  markReadThreadAction,
  unarchiveThreadAction,
  untrashThreadAction,
} from "@/utils/actions/mail";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import { withThreadReadState } from "@/app/(app)/[emailAccountId]/mail/read-state";
import type { ListThread } from "@/app/(app)/[emailAccountId]/mail/types";
import type { ThreadRemoval } from "@/app/(app)/[emailAccountId]/mail/use-mail-threads";

type UndoableAction = "archive" | "delete";

type UndoableBatch = {
  type: UndoableAction;
  threadIds: string[];
  removal: ThreadRemoval;
  undone: boolean;
};

/**
 * Archive and delete with a real undo, plus read state.
 *
 * Undo tries to cancel the queued job first: the queue usually drains in well
 * under a second, but when it hasn't, cancelling avoids a pointless round trip
 * to the provider and back. Anything already sent gets reversed properly.
 */
export function useThreadActions({
  emailAccountId,
  removeThreads,
  restoreThreads,
  updateThreads,
}: {
  emailAccountId: string;
  removeThreads: (threadIds: string[]) => ThreadRemoval;
  restoreThreads: (removal: ThreadRemoval, threadIds: string[]) => void;
  updateThreads: (
    threadIds: string[],
    update: (thread: ListThread) => ListThread,
  ) => void;
}) {
  const lastAction = useRef<UndoableBatch | null>(null);

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

      const reversed = await Promise.all(
        notCancelled.map(async (threadId) => {
          const result = await reverse(emailAccountId, { threadId });
          return { threadId, ok: !result?.serverError };
        }),
      );

      // A thread the provider refused to unarchive is still archived, so
      // putting its row back would show a conversation that isn't there.
      const failed = reversed.filter((r) => !r.ok).map((r) => r.threadId);
      const restored = batch.threadIds.filter((id) => !failed.includes(id));

      restoreThreads(batch.removal, restored);

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

  const run = useCallback(
    (type: UndoableAction, threadIds: string[]) => {
      if (!threadIds.length) return;

      const removal = removeThreads(threadIds);
      const batch: UndoableBatch = { type, threadIds, removal, undone: false };
      lastAction.current = batch;

      const queue = type === "archive" ? archiveEmails : deleteEmails;
      queue({
        threadIds,
        emailAccountId,
        onSuccess: () => {},
        // The queue reports the specific thread that failed; the rest of the
        // batch archived fine and must stay gone.
        onError: (threadId) => {
          restoreThreads(removal, [threadId]);
          toast.error(
            type === "archive"
              ? "There was an error archiving"
              : "There was an error deleting",
          );
        },
      });

      toast.success(
        summarise(
          type === "archive" ? "Archived" : "Deleted",
          threadIds.length,
        ),
        {
          action: {
            label: `Undo · ${getShortcutHint("undo")}`,
            onClick: () => {
              undoBatch(batch);
            },
          },
        },
      );
    },
    [emailAccountId, removeThreads, restoreThreads, undoBatch],
  );

  // Applied to the list first: in list layout the reader covers the rows, so
  // waiting on the provider would leave the click with no visible effect.
  const markRead = useCallback(
    async (threadId: string, read: boolean) => {
      const update = (isRead: boolean) =>
        updateThreads([threadId], (thread) =>
          withThreadReadState(thread, isRead),
        );

      update(read);

      // A rejected request has to roll back too, or the row keeps showing a
      // state the provider never took: nothing else reverts it.
      try {
        const result = await markReadThreadAction(emailAccountId, {
          threadId,
          read,
        });
        if (result?.serverError) throw new Error(result.serverError);
      } catch {
        update(!read);
        toast.error(read ? "Couldn't mark as read" : "Couldn't mark as unread");
        return;
      }

      toast.success(read ? "Marked as read" : "Marked as unread");
    },
    [emailAccountId, updateThreads],
  );

  return {
    archive: useCallback((ids: string[]) => run("archive", ids), [run]),
    trash: useCallback((ids: string[]) => run("delete", ids), [run]),
    markRead,
    undo,
  };
}

function summarise(verb: string, count: number) {
  return count === 1 ? verb : `${verb} ${count} conversations`;
}
