"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  archiveEmails,
  cancelQueuedThreads,
  deleteEmails,
} from "@/store/archive-queue";
import {
  unarchiveThreadAction,
  untrashThreadAction,
} from "@/utils/actions/mail";
import { getShortcutHint } from "@/lib/shortcuts/registry";

type UndoableAction = "archive" | "delete";

type UndoableBatch = {
  type: UndoableAction;
  threadIds: string[];
  undone: boolean;
};

/**
 * Archive and delete with a real undo.
 *
 * Undo tries to cancel the queued job first: the queue usually drains in well
 * under a second, but when it hasn't, cancelling avoids a pointless round trip
 * to the provider and back. Anything already sent gets reversed properly.
 */
export function useThreadActions({
  emailAccountId,
  removeThreads,
  restoreThreads,
}: {
  emailAccountId: string;
  removeThreads: (threadIds: string[]) => void;
  restoreThreads: () => void;
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

      const results = await Promise.all(
        notCancelled.map((threadId) => reverse(emailAccountId, { threadId })),
      );

      restoreThreads();

      if (results.some((result) => result?.serverError))
        toast.error("Some conversations couldn't be restored");
      else toast.success(summarise("Restored", batch.threadIds.length));
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

      const batch: UndoableBatch = { type, threadIds, undone: false };
      lastAction.current = batch;
      removeThreads(threadIds);

      const queue = type === "archive" ? archiveEmails : deleteEmails;
      queue({
        threadIds,
        emailAccountId,
        onSuccess: () => {},
        onError: () => {
          restoreThreads();
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

  return {
    archive: useCallback((ids: string[]) => run("archive", ids), [run]),
    trash: useCallback((ids: string[]) => run("delete", ids), [run]),
    undo,
  };
}

function summarise(verb: string, count: number) {
  return count === 1 ? verb : `${verb} ${count} conversations`;
}
