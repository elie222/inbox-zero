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

type LastAction = { type: UndoableAction; threadIds: string[] };

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
  const lastAction = useRef<LastAction | null>(null);

  const undo = useCallback(async () => {
    const action = lastAction.current;
    if (!action) return;
    lastAction.current = null;

    const { notCancelled } = cancelQueuedThreads({
      threadIds: action.threadIds,
      actionType: action.type,
    });

    const reverse =
      action.type === "archive" ? unarchiveThreadAction : untrashThreadAction;

    const results = await Promise.all(
      notCancelled.map((threadId) => reverse(emailAccountId, { threadId })),
    );

    restoreThreads();

    if (results.some((result) => result?.serverError))
      toast.error("Some conversations couldn't be restored");
    else toast.success(summarise("Restored", action.threadIds.length));
  }, [emailAccountId, restoreThreads]);

  const run = useCallback(
    (type: UndoableAction, threadIds: string[]) => {
      if (!threadIds.length) return;

      lastAction.current = { type, threadIds };
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
              undo();
            },
          },
        },
      );
    },
    [emailAccountId, removeThreads, restoreThreads, undo],
  );

  return {
    archive: useCallback((ids: string[]) => run("archive", ids), [run]),
    trash: useCallback((ids: string[]) => run("delete", ids), [run]),
    undo,
    canUndo: () => lastAction.current !== null,
  };
}

function summarise(verb: string, count: number) {
  return count === 1 ? verb : `${verb} ${count} conversations`;
}
